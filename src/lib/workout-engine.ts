// Deterministic workout engine: PR detection and explainable progressive
// overload suggestions. Pure functions only (no IO) so the rules are fully
// unit-testable. AI may explain these results but never replaces them.

import { epley } from "@/lib/training-analytics";

export interface LoggedSet {
  /** ISO timestamp or yyyy-mm-dd of the session the set belongs to. */
  date: string;
  weightKg: number;
  reps: number;
  setType?: string | null;
  rpe?: number | null;
  /** Groups sets of one session; falls back to the calendar date. */
  sessionId?: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dayOf = (s: LoggedSet) => s.date.slice(0, 10);
const sessionKey = (s: LoggedSet) => s.sessionId ?? dayOf(s);

/** Warm-up sets never count towards bests, volume or progression. */
export function workingSets<T extends { setType?: string | null }>(sets: T[]): T[] {
  return sets.filter((s) => s.setType !== "WARMUP");
}

export function setVolume(s: { weightKg: number; reps: number }): number {
  return s.weightKg * s.reps;
}

export interface SessionSummary {
  key: string;
  date: string;
  sets: LoggedSet[];
  topWeightKg: number;
  volumeKg: number;
  bestE1rm: number;
}

/** Working sets grouped per session, most recent first. */
export function summarizeSessions(history: LoggedSet[]): SessionSummary[] {
  const groups = new Map<string, LoggedSet[]>();
  for (const s of workingSets(history)) {
    const k = sessionKey(s);
    const list = groups.get(k) ?? [];
    list.push(s);
    groups.set(k, list);
  }
  return Array.from(groups.entries())
    .map(([key, sets]) => ({
      key,
      date: dayOf(sets[0]),
      sets,
      topWeightKg: Math.max(...sets.map((s) => s.weightKg)),
      volumeKg: sets.reduce((a, s) => a + setVolume(s), 0),
      bestE1rm: round1(Math.max(...sets.map((s) => epley(s.weightKg, s.reps)))),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface ExerciseBests {
  maxWeightKg: number;
  maxE1rm: number;
  bestSessionVolumeKg: number;
  sessions: number;
}

export function exerciseBests(history: LoggedSet[]): ExerciseBests {
  const sessions = summarizeSessions(history);
  return {
    maxWeightKg: Math.max(0, ...sessions.map((s) => s.topWeightKg)),
    maxE1rm: Math.max(0, ...sessions.map((s) => s.bestE1rm)),
    bestSessionVolumeKg: Math.max(0, ...sessions.map((s) => s.volumeKg)),
    sessions: sessions.length,
  };
}

// --- PR detection ------------------------------------------------------------

export type PrType = "WEIGHT" | "REPS" | "E1RM" | "VOLUME";

export interface PrAchievement {
  type: PrType;
  label: string;
  value: number;
  previous: number;
  /** Percentage improvement over the previous best. */
  deltaPct: number;
}

export interface PrCheckInput {
  /** The set that was just logged. */
  set: { weightKg: number; reps: number; setType?: string | null };
  /** Every earlier set for this exercise (excluding this session's sets). */
  priorHistory: LoggedSet[];
  /** Working sets already logged earlier in the current session (excl. this one). */
  sessionSetsSoFar: { weightKg: number; reps: number; setType?: string | null }[];
}

const pct = (value: number, previous: number) =>
  previous > 0 ? round1(((value - previous) / previous) * 100) : 0;

/**
 * Detect PRs for a freshly logged set. A first-ever performance of an exercise
 * is a baseline, not a PR. Warm-up sets never produce PRs.
 */
export function detectSetPrs(input: PrCheckInput): PrAchievement[] {
  const { set, priorHistory, sessionSetsSoFar } = input;
  if (set.setType === "WARMUP" || set.reps <= 0 || set.weightKg < 0) return [];
  const prior = workingSets(priorHistory);
  if (prior.length === 0) return [];

  const out: PrAchievement[] = [];
  const bests = exerciseBests(prior);

  if (set.weightKg > bests.maxWeightKg) {
    out.push({
      type: "WEIGHT",
      label: "Weight PR",
      value: set.weightKg,
      previous: bests.maxWeightKg,
      deltaPct: pct(set.weightKg, bests.maxWeightKg),
    });
  } else {
    // Rep PR: more reps than ever done at this weight or heavier.
    const heavierOrEqual = prior.filter((s) => s.weightKg >= set.weightKg);
    const prevMaxReps = Math.max(0, ...heavierOrEqual.map((s) => s.reps));
    if (heavierOrEqual.length > 0 && set.reps > prevMaxReps) {
      out.push({
        type: "REPS",
        label: "Rep PR",
        value: set.reps,
        previous: prevMaxReps,
        deltaPct: pct(set.reps, prevMaxReps),
      });
    }
  }

  const e1rm = round1(epley(set.weightKg, set.reps));
  if (e1rm > bests.maxE1rm) {
    out.push({
      type: "E1RM",
      label: "Estimated 1RM PR",
      value: e1rm,
      previous: bests.maxE1rm,
      deltaPct: pct(e1rm, bests.maxE1rm),
    });
  }

  // Volume PR: this session's volume for the exercise beats any previous session.
  const sessionVolume =
    workingSets(sessionSetsSoFar).reduce((a, s) => a + setVolume(s), 0) +
    setVolume(set);
  if (sessionVolume > bests.bestSessionVolumeKg && workingSets(sessionSetsSoFar).length > 0) {
    out.push({
      type: "VOLUME",
      label: "Volume PR",
      value: Math.round(sessionVolume),
      previous: Math.round(bests.bestSessionVolumeKg),
      deltaPct: pct(sessionVolume, bests.bestSessionVolumeKg),
    });
  }
  return out;
}

// --- Progressive overload suggestions ----------------------------------------

export type SuggestionKind = "baseline" | "increase_weight" | "add_reps" | "repeat" | "reduce";

export interface OverloadSuggestion {
  kind: SuggestionKind;
  weightKg: number | null;
  repMin: number;
  repMax: number;
  /** Plain-language reason shown to the athlete. */
  rationale: string;
}

export interface OverloadOptions {
  repMin?: number;
  repMax?: number;
  /** Smallest plate jump in kg. */
  incrementKg?: number;
}

function incrementFor(weightKg: number, override?: number): number {
  if (override) return override;
  if (weightKg < 20) return 1;
  return weightKg >= 100 ? 5 : 2.5;
}

/**
 * Suggest the next target from recent sessions (double progression):
 * hit the top of the rep range on every set → add load; otherwise add reps;
 * miss the bottom of the range repeatedly → reduce. Always explained.
 */
export function suggestProgression(
  history: LoggedSet[],
  options: OverloadOptions = {}
): OverloadSuggestion {
  const repMin = options.repMin ?? 6;
  const repMax = options.repMax ?? 10;
  const sessions = summarizeSessions(history);

  if (sessions.length === 0) {
    return {
      kind: "baseline",
      weightKg: null,
      repMin,
      repMax,
      rationale: `No previous data yet. Pick a weight you can lift for ${repMin}–${repMax} reps with 2 reps left in reserve; it becomes your baseline.`,
    };
  }

  const last = sessions[0];
  const prev = sessions[1];
  const topSets = (s: SessionSummary) => s.sets.filter((x) => x.weightKg === s.topWeightKg);
  const hitTop = (s: SessionSummary) => topSets(s).every((x) => x.reps >= repMax);
  const missedMin = (s: SessionSummary) => topSets(s).some((x) => x.reps < repMin);
  const weight = last.topWeightKg;
  const rpes = topSets(last).map((x) => x.rpe).filter((r): r is number => typeof r === "number");
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

  if (hitTop(last) && (prev ? hitTop(prev) && prev.topWeightKg === weight : true)) {
    if (avgRpe !== null && avgRpe >= 9.5) {
      return {
        kind: "repeat",
        weightKg: weight,
        repMin,
        repMax,
        rationale: `You reached ${repMax} reps on every set, but the effort was very high (RPE ${round1(avgRpe)}). Repeat ${weight} kg and aim for a lower RPE before adding load.`,
      };
    }
    const inc = incrementFor(weight, options.incrementKg);
    const evidence = prev
      ? "in the previous two sessions"
      : "in your last session";
    return {
      kind: "increase_weight",
      weightKg: round1(weight + inc),
      repMin,
      repMax,
      rationale: `Suggested +${inc} kg because you completed the top of your ${repMin}–${repMax} rep range on every set ${evidence}.`,
    };
  }

  if (missedMin(last) && prev && missedMin(prev) && prev.topWeightKg === weight) {
    const reduced = round1(Math.round((weight * 0.925) / 1.25) * 1.25);
    return {
      kind: "reduce",
      weightKg: reduced,
      repMin,
      repMax,
      rationale: `You fell short of ${repMin} reps at ${weight} kg in two sessions in a row. Consider ~7% less (${reduced} kg) to rebuild reps, then progress again. Take recovery and sleep into account.`,
    };
  }

  const bestReps = Math.max(...topSets(last).map((x) => x.reps));
  const target = Math.min(bestReps + 1, repMax);
  return {
    kind: "add_reps",
    weightKg: weight,
    repMin,
    repMax,
    rationale: `Stay at ${weight} kg and aim for ${target} reps on your top sets (last time: ${topSets(last).map((x) => x.reps).join(", ")}). Add load once every set reaches ${repMax}.`,
  };
}

/** One-line formatter for the previous-performance list. */
export function formatSet(s: { weightKg: number; reps: number }): string {
  return `${s.weightKg} kg × ${s.reps}`;
}
