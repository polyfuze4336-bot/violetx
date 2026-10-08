// Deterministic workout engine: PR detection and explainable progressive
// overload suggestions. Pure functions only (no IO) so the rules are fully
// unit-testable. AI may explain these results but never replaces them.

import { epley } from "@/lib/training-analytics";
import { isBetterLoad } from "@/lib/progression-type";

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
/** Loads within 0.01 kg are the same load (decimal representation tolerance). */
const SAME_LOAD = 0.01;
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
  /** Best load of the session: heaviest, or lowest assistance for assisted lifts. */
  topWeightKg: number;
  volumeKg: number;
  bestE1rm: number;
}

/**
 * Working sets grouped per session, most recent first. For assisted lifts the
 * weight is assistance, so the best load is the lowest and volume / estimated
 * 1RM are not meaningful (reported as 0).
 */
export function summarizeSessions(history: LoggedSet[], assisted = false): SessionSummary[] {
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
      topWeightKg: assisted
        ? Math.min(...sets.map((s) => s.weightKg))
        : Math.max(...sets.map((s) => s.weightKg)),
      volumeKg: assisted ? 0 : sets.reduce((a, s) => a + setVolume(s), 0),
      bestE1rm: assisted ? 0 : round1(Math.max(...sets.map((s) => epley(s.weightKg, s.reps)))),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface ExerciseBests {
  /** Heaviest load; for assisted lifts the LOWEST assistance (0 if no history). */
  maxWeightKg: number;
  maxE1rm: number;
  bestSessionVolumeKg: number;
  sessions: number;
}

export function exerciseBests(history: LoggedSet[], assisted = false): ExerciseBests {
  const sessions = summarizeSessions(history, assisted);
  const loads = sessions.map((s) => s.topWeightKg);
  return {
    maxWeightKg: assisted ? (loads.length ? Math.min(...loads) : 0) : Math.max(0, ...loads),
    maxE1rm: Math.max(0, ...sessions.map((s) => s.bestE1rm)),
    bestSessionVolumeKg: Math.max(0, ...sessions.map((s) => s.volumeKg)),
    sessions: sessions.length,
  };
}

// --- PR detection ------------------------------------------------------------

export type PrType = "WEIGHT" | "ASSISTANCE" | "REPS" | "E1RM" | "VOLUME";

export interface PrAchievement {
  type: PrType;
  label: string;
  /** The load (kg) of the set that achieved it; rep PRs are contextual to it. */
  weightKg: number;
  value: number;
  previous: number;
  /** Percentage improvement over the previous best. */
  deltaPct: number;
  /** Assisted exercise: weightKg is assistance, not external load. */
  assisted?: boolean;
}

export interface PrCheckInput {
  /** The set that was just logged. */
  set: { weightKg: number; reps: number; setType?: string | null };
  /** Every earlier set for this exercise (excluding this session's sets). */
  priorHistory: LoggedSet[];
  /** Working sets already logged earlier in the current session (excl. this one). */
  sessionSetsSoFar: { weightKg: number; reps: number; setType?: string | null }[];
  /** Assisted exercise: the weight is assistance, so lower is better. */
  assisted?: boolean;
}

const pct = (value: number, previous: number) =>
  previous > 0 ? round1(((value - previous) / previous) * 100) : 0;

/**
 * Detect PRs for a freshly logged set. A first-ever performance of an exercise
 * is a baseline, not a PR. Warm-up sets never produce PRs.
 */
export function detectSetPrs(input: PrCheckInput): PrAchievement[] {
  const { set, priorHistory, sessionSetsSoFar } = input;
  const assisted = input.assisted === true;
  if (set.setType === "WARMUP" || set.reps <= 0 || set.weightKg < 0) return [];
  const prior = workingSets(priorHistory);
  if (prior.length === 0) return [];

  const out: PrAchievement[] = [];
  const bests = exerciseBests(prior, assisted);

  if (assisted && set.weightKg < bests.maxWeightKg - SAME_LOAD) {
    out.push({
      type: "ASSISTANCE",
      label: "Assistance PR",
      weightKg: set.weightKg,
      value: set.weightKg,
      previous: bests.maxWeightKg,
      deltaPct: pct(bests.maxWeightKg - set.weightKg, bests.maxWeightKg),
    });
  } else if (!assisted && set.weightKg > bests.maxWeightKg) {
    out.push({
      type: "WEIGHT",
      label: "Weight PR",
      weightKg: set.weightKg,
      value: set.weightKg,
      previous: bests.maxWeightKg,
      deltaPct: pct(set.weightKg, bests.maxWeightKg),
    });
  } else {
    // Rep PR: the most reps ever done at this SAME load (0.01 kg tolerance).
    // A heavier or lighter record never counts: 60 kg × 15 is not compared
    // with 100 kg × 10. A load with no earlier history is a new reference
    // point, not a record. Sets already logged this session count too, so
    // 80 × 10 followed by 80 × 9 does not celebrate twice.
    const sameLoad = (w: number) => Math.abs(w - set.weightKg) < 0.01;
    const priorSame = prior.filter((s) => sameLoad(s.weightKg));
    const prevMaxReps = Math.max(0, ...priorSame.map((s) => s.reps));
    const sessionMaxReps = Math.max(
      0,
      ...workingSets(sessionSetsSoFar).filter((s) => sameLoad(s.weightKg)).map((s) => s.reps)
    );
    if (priorSame.length > 0 && set.reps > Math.max(prevMaxReps, sessionMaxReps)) {
      out.push({
        type: "REPS",
        label: "Rep PR",
        weightKg: set.weightKg,
        value: set.reps,
        previous: prevMaxReps,
        deltaPct: pct(set.reps, prevMaxReps),
      });
    }
  }

  // Estimated 1RM and volume are meaningless when the weight is assistance.
  if (assisted) return out.map((a) => ({ ...a, assisted: true }));

  const e1rm = round1(epley(set.weightKg, set.reps));
  if (e1rm > bests.maxE1rm) {
    out.push({
      type: "E1RM",
      label: "Estimated 1RM PR",
      weightKg: set.weightKg,
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
      weightKg: set.weightKg,
      value: Math.round(sessionVolume),
      previous: Math.round(bests.bestSessionVolumeKg),
      deltaPct: pct(sessionVolume, bests.bestSessionVolumeKg),
    });
  }
  return out;
}

// --- Progressive overload suggestions ----------------------------------------

export type SuggestionKind =
  | "baseline"
  | "increase_weight"
  | "reduce_assistance"
  | "add_reps"
  | "repeat"
  | "reduce";

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
  /** Assisted exercise: progress by lowering the assistance, never by adding it. */
  assisted?: boolean;
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
  const assisted = options.assisted === true;
  const sessions = summarizeSessions(history, assisted);

  if (sessions.length === 0) {
    return {
      kind: "baseline",
      weightKg: null,
      repMin,
      repMax,
      rationale: assisted
        ? `No previous data yet. Pick an assistance level that lets you do ${repMin}–${repMax} reps with 2 reps left in reserve; it becomes your baseline.`
        : `No previous data yet. Pick a weight you can lift for ${repMin}–${repMax} reps with 2 reps left in reserve; it becomes your baseline.`,
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

  if (assisted) return suggestAssisted({ last, prev, weight, avgRpe, repMin, repMax, options, topSets, hitTop, missedMin });

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

interface AssistedCtx {
  last: SessionSummary;
  prev: SessionSummary | undefined;
  weight: number;
  avgRpe: number | null;
  repMin: number;
  repMax: number;
  options: OverloadOptions;
  topSets: (s: SessionSummary) => LoggedSet[];
  hitTop: (s: SessionSummary) => boolean;
  missedMin: (s: SessionSummary) => boolean;
}

/** Double progression for assisted lifts: add reps, then LOWER the assistance. */
function suggestAssisted(c: AssistedCtx): OverloadSuggestion {
  const { last, prev, weight, avgRpe, repMin, repMax } = c;
  const base = { repMin, repMax };

  if (c.hitTop(last) && (prev ? c.hitTop(prev) && prev.topWeightKg === weight : true)) {
    if (avgRpe !== null && avgRpe >= 9.5) {
      return {
        kind: "repeat",
        weightKg: weight,
        ...base,
        rationale: `You reached ${repMax} reps on every set, but the effort was very high (RPE ${round1(avgRpe)}). Repeat ${weight} kg assistance and aim for a lower RPE before reducing it.`,
      };
    }
    const step = Math.min(c.options.incrementKg ?? 2.5, weight);
    if (step <= 0) {
      return {
        kind: "add_reps",
        weightKg: 0,
        ...base,
        rationale: "You are already unassisted. Add reps, then consider adding external load.",
      };
    }
    return {
      kind: "reduce_assistance",
      weightKg: round1(weight - step),
      ...base,
      rationale: `Suggested ${step} kg less assistance (${weight} → ${round1(weight - step)} kg) because you completed the top of your ${repMin}–${repMax} rep range on every set${prev ? " in the previous two sessions" : " in your last session"}. Lower assistance = stronger.`,
    };
  }

  if (c.missedMin(last) && prev && c.missedMin(prev) && prev.topWeightKg === weight) {
    const more = round1(weight + (c.options.incrementKg ?? 2.5));
    return {
      kind: "reduce",
      weightKg: more,
      ...base,
      rationale: `You fell short of ${repMin} reps at ${weight} kg assistance in two sessions in a row. Consider a little more assistance (${more} kg) to rebuild reps, then reduce it again. Take recovery and sleep into account.`,
    };
  }

  const bestReps = Math.max(...c.topSets(last).map((x) => x.reps));
  const target = Math.min(bestReps + 1, repMax);
  return {
    kind: "add_reps",
    weightKg: weight,
    ...base,
    rationale: `Stay at ${weight} kg assistance and aim for ${target} reps on your top sets (last time: ${c.topSets(last).map((x) => x.reps).join(", ")}). Reduce the assistance once every set reaches ${repMax}.`,
  };
}

/** One-line formatter for the previous-performance list. */
export function formatSet(s: { weightKg: number; reps: number }): string {
  return `${s.weightKg} kg × ${s.reps}`;
}

// --- Load vs rep progression -------------------------------------------------

export interface ProgressionSummary {
  /**
   * Better load than last time: a heavier top weight, or (assisted lifts) less
   * assistance. `deltaKg` is always the positive size of the improvement.
   * Assisted lifts also carry `topReps`: the best reps at the old vs new top
   * load (35 kg × 8 → 30 kg × 10 is less assistance AND +2 reps).
   */
  load: {
    fromKg: number;
    toKg: number;
    deltaKg: number;
    topReps?: { from: number; to: number; delta: number };
  } | null;
  /** Present (true) for assisted lifts: `load` means LESS assistance. */
  assisted?: true;
  /** More reps at the same load (the heaviest load that improved). */
  reps: { weightKg: number; from: number; to: number; delta: number } | null;
}

/**
 * Compare this session's working sets with the previous session's. Both kinds
 * of progress count: a heavier top set (load) and more reps at the same weight
 * (reps). Pure; callers pass working sets only.
 */
export function describeProgression(
  previous: { weightKg: number; reps: number }[],
  current: { weightKg: number; reps: number }[],
  assisted = false
): ProgressionSummary {
  if (previous.length === 0 || current.length === 0) return { load: null, reps: null, ...(assisted ? { assisted: true as const } : {}) };

  const best = (sets: { weightKg: number }[]) =>
    assisted ? Math.min(...sets.map((s) => s.weightKg)) : Math.max(...sets.map((s) => s.weightKg));
  const prevTop = best(previous);
  const curTop = best(current);
  const gain = assisted ? prevTop - curTop : curTop - prevTop;
  let load: ProgressionSummary["load"] = null;
  if (gain > SAME_LOAD) {
    load = { fromKg: prevTop, toKg: curTop, deltaKg: round1(gain) };
    if (assisted) {
      const topReps = (sets: { weightKg: number; reps: number }[], w: number) =>
        Math.max(...sets.filter((s) => Math.abs(s.weightKg - w) < SAME_LOAD).map((s) => s.reps));
      const from = topReps(previous, prevTop);
      const to = topReps(current, curTop);
      load.topReps = { from, to, delta: to - from };
    }
  }

  let reps: ProgressionSummary["reps"] = null;
  for (const c of current) {
    const bestNow = Math.max(...current.filter((s) => Math.abs(s.weightKg - c.weightKg) < SAME_LOAD).map((s) => s.reps));
    const before = previous.filter((s) => Math.abs(s.weightKg - c.weightKg) < SAME_LOAD).map((s) => s.reps);
    if (before.length === 0) continue;
    const bestBefore = Math.max(...before);
    // Prefer the hardest load that improved (heaviest, or least assistance).
    if (bestNow > bestBefore && (!reps || isBetterLoad(c.weightKg, reps.weightKg, assisted))) {
      reps = { weightKg: c.weightKg, from: bestBefore, to: bestNow, delta: bestNow - bestBefore };
    }
  }
  return { load, reps, ...(assisted ? { assisted: true as const } : {}) };
}

/** One-line explanation of a PR, e.g. "+2 reps at 80 kg (previous best 8)". */
export function prDetail(a: PrAchievement): string {
  switch (a.type) {
    case "REPS": {
      const d = a.value - a.previous;
      return `+${d} rep${d === 1 ? "" : "s"} at ${a.weightKg} kg${a.assisted ? " assistance" : ""} (previous best ${a.previous})`;
    }
    case "WEIGHT":
      return `+${round1(a.value - a.previous)} kg (previous best ${a.previous} kg)`;
    case "ASSISTANCE":
      return `${round1(a.previous - a.value)} kg less assistance (${a.previous} → ${a.value} kg)`;
    case "E1RM":
      return `Estimated 1RM ${a.value} kg (+${a.deltaPct}%)`;
    default:
      return `Session volume ${a.value.toLocaleString()} kg (+${a.deltaPct}%)`;
  }
}
