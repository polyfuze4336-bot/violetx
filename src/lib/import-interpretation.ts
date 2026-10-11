// Pure interpretation of a WhatsApp import: what KIND of record the message is
// (PR update / partial workout / full workout) and whether claimed PRs are real
// against the recorded history. No IO. The PR maths is the existing PR engine
// (detectPrEvents); nothing here decides a PR by itself, and an AI never does.

import { detectPrEvents, prEventDetail, type PrEvent, type PrInputSet } from "@/lib/analytics";

export type ImportType = "PR_UPDATE" | "PARTIAL" | "FULL";

export const IMPORT_TYPES: ImportType[] = ["PR_UPDATE", "PARTIAL", "FULL"];

export const IMPORT_TYPE_LABEL: Record<ImportType, string> = {
  PR_UPDATE: "PR / Progress Update",
  PARTIAL: "Partial Workout",
  FULL: "Full Workout",
};

export const IMPORT_TYPE_HINT: Record<ImportType, string> = {
  PR_UPDATE: "Selected progress only. Not a workout, so it never changes workout counts or adherence.",
  PARTIAL: "Part of a workout. Saved as incomplete; missing exercises are unknown, not skipped.",
  FULL: "Everything you did. Saved as a normal completed workout.",
};

/** WorkoutSession.status for each import type (no schema change: status is free text). */
export const SESSION_STATUS_FOR: Record<ImportType, string> = {
  PR_UPDATE: "PR_UPDATE",
  PARTIAL: "PARTIAL",
  FULL: "COMPLETED",
};

/** Sessions that only represent part of what was done: unknown, never zero. */
export function isIncompleteSessionStatus(status: string | null | undefined): boolean {
  return status === "PR_UPDATE" || status === "PARTIAL";
}

export function isImportType(value: unknown): value is ImportType {
  return value === "PR_UPDATE" || value === "PARTIAL" || value === "FULL";
}

// --- Which import type does this look like? -----------------------------------

export interface Recommendation {
  type: ImportType;
  /** Plain-language explanation shown in the review. */
  reason: string;
  exercises: number;
  entries: number;
}

const FULL_WORDING = /\b(full|complete|whole|entire)\s+(workout|session|routine)\b|\bworkout\s+(done|complete|completed)\b|\bfinished\s+(my\s+|the\s+)?(workout|session)\b/i;
const PARTIAL_WORDING = /\b(partial|part\s+of|some\s+of|only\s+did|just\s+did)\b/i;
const PR_WORDING = /\b(pr|pb|prs)\b|\bpersonal\s+(record|best)\b|\bnew\s+(record|best|max)\b|🏆/i;

const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Recommend an import type from the extracted sets and the message wording.
 * This is only a recommendation: the review always lets the user change it.
 */
export function recommendImportType(input: {
  rawText?: string;
  sets: { exercise: string; prClaim?: boolean }[];
}): Recommendation {
  const text = input.rawText ?? "";
  const byExercise = new Map<string, number>();
  for (const s of input.sets) {
    const k = nameKey(s.exercise);
    byExercise.set(k, (byExercise.get(k) ?? 0) + 1);
  }
  const exercises = byExercise.size;
  const entries = input.sets.length;
  const base = { exercises, entries };

  if (FULL_WORDING.test(text)) {
    return { type: "FULL", reason: "The message describes a complete workout.", ...base };
  }
  if (PARTIAL_WORDING.test(text)) {
    return { type: "PARTIAL", reason: "The message says it covers only part of the workout.", ...base };
  }
  if (input.sets.some((s) => s.prClaim) || PR_WORDING.test(text)) {
    return {
      type: "PR_UPDATE",
      reason: "The message calls out PRs, so it appears to contain selected exercise progress rather than a complete workout.",
      ...base,
    };
  }
  if (exercises >= 4 && entries / exercises >= 2) {
    return {
      type: "FULL",
      reason: `${exercises} exercises with several sets each looks like a complete session.`,
      ...base,
    };
  }
  if (exercises > 0 && entries === exercises) {
    return {
      type: "PR_UPDATE",
      reason: "This message appears to contain selected exercise progress rather than a complete workout.",
      ...base,
    };
  }
  return {
    type: "PARTIAL",
    reason: "Several sets for only a few exercises. This could be part of a workout, so it is saved as incomplete.",
    ...base,
  };
}

/**
 * Flag sets whose own line in the message calls them a PR ("PR bench 80 x 10").
 * The parser does this per line; this covers sets extracted another way (the
 * LLM path). The flag is only a claim to verify, never a fact.
 */
export function markPrClaims<T extends { exercise: string; reps: number; weightKg: number; prClaim?: boolean }>(
  rawText: string,
  sets: T[]
): T[] {
  const prLines = rawText.split(/\r?\n/).filter((l) => PR_WORDING.test(l));
  if (prLines.length === 0) return sets;
  const hasNumber = (line: string, n: number) =>
    new RegExp(`(^|[^\\d.])${String(n).replace(".", "\\.")}([^\\d]|$)`).test(line);
  return sets.map((s) => {
    if (s.prClaim) return s;
    const words = nameKey(s.exercise).split(" ").filter((w) => w.length >= 3);
    const claimed = prLines.some(
      (l) => hasNumber(l, s.weightKg) && hasNumber(l, s.reps) && words.some((w) => l.toLowerCase().includes(w))
    );
    return claimed ? { ...s, prClaim: true } : s;
  });
}

// --- Are the claimed PRs real? -------------------------------------------------

export type ClaimStatus =
  /** The PR engine finds a new record against the recorded history. */
  | "CONFIRMED_PR"
  /** Not a new record. It is still saved as a progress entry. */
  | "NOT_A_PR"
  /** No earlier history for this exercise: a baseline, not a PR. */
  | "FIRST_RECORD"
  /** Another set in this import already carries the PR for this exercise. */
  | "SUPPORTING"
  /** The exercise name is still waiting for the user's confirmation. */
  | "UNRESOLVED";

export interface ClaimInput {
  exerciseId: string | null;
  exerciseName: string;
  weightKg: number;
  reps: number;
  assisted: boolean;
  /** The message called this a PR. */
  claimedPr: boolean;
  /** The exercise name still needs the user's decision. */
  unresolved?: boolean;
}

export interface ClaimAssessment {
  status: ClaimStatus;
  prType: PrEvent["type"] | null;
  /** "Rep PR" / "Weight PR" / "Assistance PR" when confirmed. */
  label: string | null;
  /** "+2 reps at 80 kg" / "+5 kg" / "5 kg less assistance …". */
  detail: string | null;
  previous: { weightKg: number; reps: number } | null;
  /** For NOT_A_PR: the record that stands. */
  existingBest: { weightKg: number; reps: number } | null;
  claimedPr: boolean;
  assisted: boolean;
  message: string;
}

const dayOf = (iso: string) => iso.slice(0, 10);
const loadKey = (w: number) => Math.round(w * 100);

function fmtKg(n: number): string {
  return `${Math.round(n * 100) / 100}`;
}

function describe(weightKg: number, reps: number, assisted: boolean): string {
  return `${fmtKg(weightKg)} kg${assisted ? " assistance" : ""} × ${reps}`;
}

function bestOnRecord(
  history: PrInputSet[],
  exerciseId: string,
  weightKg: number,
  assisted: boolean
): { weightKg: number; reps: number } | null {
  const rows = history.filter((h) => h.exerciseId === exerciseId);
  if (rows.length === 0) return null;
  const sameLoad = rows.filter((h) => loadKey(h.weightKg) === loadKey(weightKg));
  if (sameLoad.length > 0) {
    const best = sameLoad.reduce((a, b) => (b.reps > a.reps ? b : a));
    return { weightKg: best.weightKg, reps: best.reps };
  }
  const best = rows.reduce((a, b) => {
    const better = assisted ? b.weightKg < a.weightKg : b.weightKg > a.weightKg;
    return better || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a;
  });
  return { weightKg: best.weightKg, reps: best.reps };
}

/**
 * Check imported sets against the recorded history with the existing PR engine.
 * Only history BEFORE the import day is the baseline. Every claim is saved
 * either way; this only decides whether a PR can be announced.
 */
export function assessClaims(input: {
  history: PrInputSet[];
  claims: ClaimInput[];
  /** yyyy-mm-dd of the workout the import belongs to. */
  day: string;
}): ClaimAssessment[] {
  const { claims, day } = input;
  const history = input.history.filter((h) => dayOf(h.date) < day);
  const historyIds = new Set(history.map((h) => h.exerciseId));

  const engineInput: PrInputSet[] = [...history];
  claims.forEach((c, i) => {
    if (c.exerciseId && !c.unresolved && historyIds.has(c.exerciseId)) {
      engineInput.push({
        exerciseId: c.exerciseId,
        exerciseName: c.exerciseName,
        date: `${day}T12:00:00.000Z`,
        weightKg: c.weightKg,
        reps: c.reps,
        position: 100_000 + i,
        assisted: c.assisted,
      });
    }
  });
  const todays = detectPrEvents(engineInput).filter((e) => dayOf(e.date) === day);

  return claims.map((c): ClaimAssessment => {
    const base = {
      prType: null,
      label: null,
      detail: null,
      previous: null,
      existingBest: null,
      claimedPr: c.claimedPr,
      assisted: c.assisted,
    } as const;

    if (c.unresolved) {
      return { ...base, status: "UNRESOLVED", message: "Confirm the exercise name to check this against your records." };
    }
    if (!c.exerciseId || !historyIds.has(c.exerciseId)) {
      return {
        ...base,
        status: "FIRST_RECORD",
        message: c.claimedPr
          ? "PR claim detected, but VioletX has no earlier record of this exercise. It will be saved as a first entry."
          : "No earlier record of this exercise. It will be saved as a first entry.",
      };
    }

    const own = todays.find(
      (e) => e.exerciseId === c.exerciseId && e.weightKg === c.weightKg && e.reps === c.reps
    );
    if (own) {
      const d = prEventDetail(own);
      return {
        ...base,
        status: "CONFIRMED_PR",
        prType: own.type,
        label: d.label,
        detail: d.detail,
        previous: own.prevWeightKg !== null && own.prevReps !== null ? { weightKg: own.prevWeightKg, reps: own.prevReps } : null,
        message: `Confirmed ${d.label.toUpperCase()}: ${d.detail}.`,
      };
    }
    if (todays.some((e) => e.exerciseId === c.exerciseId)) {
      return { ...base, status: "SUPPORTING", message: "Part of the same progress as another set in this import." };
    }

    const best = bestOnRecord(history, c.exerciseId, c.weightKg, c.assisted);
    const stands = best ? describe(best.weightKg, best.reps, c.assisted) : null;
    return {
      ...base,
      status: "NOT_A_PR",
      existingBest: best,
      message: c.claimedPr
        ? `PR claim detected, but VioletX has a previous record of ${stands}. This does not appear to be a new recorded PR, so it is saved as a progress entry.`
        : `No new record. Your recorded best is ${stands}. It is saved as a progress entry.`,
    };
  });
}

/** One-line summary of what an import found, for the review header. */
export function summarizeDetection(r: Pick<Recommendation, "exercises" | "entries">): string {
  const ex = `${r.exercises} exercise${r.exercises === 1 ? "" : "s"}`;
  const en = `${r.entries} performance entr${r.entries === 1 ? "y" : "ies"}`;
  return `${ex} · ${en}`;
}
