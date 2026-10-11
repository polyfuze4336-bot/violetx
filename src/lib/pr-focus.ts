// "Which lift should I focus on?": the exercise that has gone the longest without
// a new personal record. Everything here is computed from the sets the athlete
// recorded (through the existing PR engine's events and the per-exercise series).
// Pure and deterministic; no estimates and no AI.

import type { PrEvent } from "@/lib/analytics";
import { prEventDetail } from "@/lib/analytics";
import type { ExerciseSeries } from "@/lib/training-analytics";

const DAY_MS = 86_400_000;

/** An exercise needs this many recorded sessions before "no PR" means anything. */
export const MIN_SESSIONS = 3;
/** Exercises not trained for this long are inactive, not stalled. */
export const ACTIVE_WINDOW_DAYS = 45;
/** Shorter gaps are normal training, not a reminder. */
export const MIN_DAYS_WITHOUT_PR = 14;

export interface FocusItem {
  exerciseId: string;
  name: string;
  assisted: boolean;
  /** Days since the last PR, or since the first recorded session if none was ever broken. */
  daysSincePr: number;
  /** yyyy-mm-dd of the last PR, null when no PR has ever been recorded. */
  lastPrDate: string | null;
  /** The last PR ("Weight PR", "80 kg × 8"); null when none. */
  lastPr: { label: string; weightKg: number; reps: number } | null;
  /** Recorded sessions since that date. */
  sessionsSince: number;
  /** Best recorded load: heaviest, or lowest assistance for assisted lifts. */
  bestWeightKg: number;
}

const day = (iso: string) => iso.slice(0, 10);
const daysBetween = (fromIso: string, to: Date) =>
  Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - new Date(`${day(fromIso)}T00:00:00Z`).getTime()) / DAY_MS);

/**
 * Exercises ranked by the longest time since their last personal record.
 * Only exercises that are still being trained are considered.
 */
export function staleRecordFocus(series: ExerciseSeries[], prEvents: PrEvent[], now: Date = new Date(), limit = 3): FocusItem[] {
  const items: FocusItem[] = [];
  for (const s of series) {
    if (s.points.length < MIN_SESSIONS) continue;
    const last = s.points[s.points.length - 1];
    if (daysBetween(last.date, now) > ACTIVE_WINDOW_DAYS) continue;

    const events = prEvents.filter((e) => e.exerciseId === s.exerciseId);
    const latest = events.reduce<PrEvent | null>((a, b) => (a === null || b.date > a.date ? b : a), null);
    const since = latest ? day(latest.date) : day(s.points[0].date);
    const daysSincePr = daysBetween(since, now);
    if (daysSincePr < MIN_DAYS_WITHOUT_PR) continue;

    const loads = s.points.map((p) => p.maxWeightKg);
    items.push({
      exerciseId: s.exerciseId,
      name: s.name,
      assisted: s.assisted,
      daysSincePr,
      lastPrDate: latest ? day(latest.date) : null,
      lastPr: latest ? { label: prEventDetail(latest).label, weightKg: latest.weightKg, reps: latest.reps } : null,
      sessionsSince: s.points.filter((p) => day(p.date) > since).length,
      bestWeightKg: s.assisted ? Math.min(...loads) : Math.max(...loads),
    });
  }
  return items.sort((a, b) => b.daysSincePr - a.daysSincePr || a.name.localeCompare(b.name)).slice(0, limit);
}

const fmt = (n: number) => `${Math.round(n * 100) / 100}`;

/** One-sentence reminder grounded in the recorded numbers. */
export function focusMessage(f: FocusItem): string {
  const gap = `${f.daysSincePr} day${f.daysSincePr === 1 ? "" : "s"}`;
  const unit = f.assisted ? "kg assistance" : "kg";
  const last = f.lastPr
    ? `Your last record was a ${f.lastPr.label} of ${fmt(f.lastPr.weightKg)} ${unit} × ${f.lastPr.reps}.`
    : `No PR has been recorded since your first session (best: ${fmt(f.bestWeightKg)} ${unit}).`;
  const target = f.assisted
    ? "Try less assistance, or more reps at the same assistance."
    : "Try one more rep at your best weight, or the next small weight increase.";
  return `${f.name} has had no new PR for ${gap}. ${last} ${target}`;
}
