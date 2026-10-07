// Pure analytics helpers for trends and personal records. No IO — unit-testable.

export interface SeriesPoint {
  date: string; // ISO
  value: number;
}

export interface SeriesStats {
  count: number;
  starting: number;
  latest: number;
  previous: number | null;
  deltaPrev: number; // latest - previous
  deltaStart: number; // latest - starting
  pctPrev: number | null; // % change vs previous
  pctStart: number | null; // % change vs starting
  lowest: number;
  highest: number;
  trend: "up" | "down" | "flat";
}

/** Compute trend statistics for a series. `points` must be sorted ascending. */
export function computeSeriesStats(points: SeriesPoint[]): SeriesStats | null {
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  const starting = values[0];
  const latest = values[values.length - 1];
  const previous = values.length > 1 ? values[values.length - 2] : null;
  const deltaPrev = previous === null ? 0 : latest - previous;
  const deltaStart = latest - starting;
  const pctPrev =
    previous && previous !== 0 ? (deltaPrev / previous) * 100 : null;
  const pctStart = starting !== 0 ? (deltaStart / starting) * 100 : null;

  return {
    count: points.length,
    starting,
    latest,
    previous,
    deltaPrev,
    deltaStart,
    pctPrev,
    pctStart,
    lowest: Math.min(...values),
    highest: Math.max(...values),
    trend: deltaStart > 0 ? "up" : deltaStart < 0 ? "down" : "flat",
  };
}

export type RangeKey = "1M" | "3M" | "6M" | "1Y" | "ALL";

export const RANGE_MONTHS: Record<Exclude<RangeKey, "ALL">, number> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
};

/** Filter points to those within a time range from `now`. Copes with irregular dates. */
export function filterPointsByRange(
  points: SeriesPoint[],
  range: RangeKey,
  now: Date = new Date()
): SeriesPoint[] {
  if (range === "ALL") return points;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RANGE_MONTHS[range]);
  return points.filter((p) => new Date(p.date) >= cutoff);
}

export interface PrInputSet {
  exerciseId: string;
  exerciseName: string;
  date: string; // ISO
  weightKg: number;
  reps: number;
  position: number;
}

export interface PrEvent {
  exerciseId: string;
  exerciseName: string;
  date: string;
  weightKg: number;
  reps: number;
  type: "WEIGHT" | "REPS";
  prevWeightKg: number | null;
  prevReps: number | null;
}

/**
 * Detect personal-record achievements across a set history:
 *  - WEIGHT: a new maximum load for the exercise.
 *  - REPS: more repetitions at a weight than previously achieved at that weight.
 * The first set of each exercise establishes a baseline (not a PR).
 */
export function detectPrEvents(sets: PrInputSet[]): PrEvent[] {
  const byExercise = new Map<string, PrInputSet[]>();
  for (const s of sets) {
    const list = byExercise.get(s.exerciseId) ?? [];
    list.push(s);
    byExercise.set(s.exerciseId, list);
  }

  const events: PrEvent[] = [];

  for (const list of Array.from(byExercise.values())) {
    list.sort((a, b) => {
      const d = new Date(a.date).getTime() - new Date(b.date).getTime();
      return d !== 0 ? d : a.position - b.position;
    });

    let maxWeight = 0;
    let maxWeightReps = 0;
    // Rep records are contextual to the load, keyed to 0.01 kg to tolerate
    // decimal representation (e.g. 82.5 vs 82.50).
    const loadKey = (w: number) => Math.round(w * 100);
    const bestRepsAtWeight = new Map<number, number>();
    let hasBaseline = false;

    for (const s of list) {
      if (!hasBaseline) {
        hasBaseline = true;
        maxWeight = s.weightKg;
        maxWeightReps = s.reps;
        bestRepsAtWeight.set(loadKey(s.weightKg), s.reps);
        continue;
      }

      if (s.weightKg > maxWeight) {
        events.push({
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseName,
          date: s.date,
          weightKg: s.weightKg,
          reps: s.reps,
          type: "WEIGHT",
          prevWeightKg: maxWeight,
          prevReps: maxWeightReps,
        });
        maxWeight = s.weightKg;
        maxWeightReps = s.reps;
        bestRepsAtWeight.set(
          loadKey(s.weightKg),
          Math.max(bestRepsAtWeight.get(loadKey(s.weightKg)) ?? 0, s.reps)
        );
      } else {
        const prevReps = bestRepsAtWeight.get(loadKey(s.weightKg)) ?? 0;
        // A rep PR needs an earlier best at this SAME load; a first set at a
        // new, lighter load is just a new reference point, not a record.
        if (prevReps > 0 && s.reps > prevReps) {
          events.push({
            exerciseId: s.exerciseId,
            exerciseName: s.exerciseName,
            date: s.date,
            weightKg: s.weightKg,
            reps: s.reps,
            type: "REPS",
            prevWeightKg: s.weightKg,
            prevReps,
          });
          bestRepsAtWeight.set(loadKey(s.weightKg), s.reps);
          if (s.weightKg === maxWeight) maxWeightReps = s.reps;
        } else {
          bestRepsAtWeight.set(loadKey(s.weightKg), Math.max(prevReps, s.reps));
        }
      }
    }
  }

  return collapseSameDayEvents(events).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
}

/**
 * Several sets in one session can each beat the old record (8 → 9 → 10 reps).
 * Keep one achievement per exercise/day/type (and load, for rep PRs): the best
 * one, measured against the record that stood before the session.
 */
function collapseSameDayEvents(events: PrEvent[]): PrEvent[] {
  const best = new Map<string, PrEvent>();
  for (const e of events) {
    const key = `${e.exerciseId}|${e.date.slice(0, 10)}|${e.type}|${
      e.type === "REPS" ? Math.round(e.weightKg * 100) : ""
    }`;
    const cur = best.get(key);
    if (!cur) {
      best.set(key, e);
      continue;
    }
    const better = e.type === "WEIGHT" ? e.weightKg > cur.weightKg : e.reps > cur.reps;
    best.set(key, better ? { ...e, prevWeightKg: cur.prevWeightKg, prevReps: cur.prevReps } : cur);
  }
  return Array.from(best.values());
}

/** Short label and detail for a PR event: load PRs vs rep PRs (same load). */
export function prEventDetail(e: Pick<PrEvent, "type" | "weightKg" | "reps" | "prevWeightKg" | "prevReps">): {
  label: string;
  detail: string;
} {
  if (e.type === "REPS") {
    const d = e.prevReps !== null ? e.reps - e.prevReps : null;
    return {
      label: "Rep PR",
      detail: d !== null ? `+${d} rep${d === 1 ? "" : "s"} at ${e.weightKg} kg` : `${e.reps} reps at ${e.weightKg} kg`,
    };
  }
  const d = e.prevWeightKg !== null ? Math.round((e.weightKg - e.prevWeightKg) * 10) / 10 : null;
  return { label: "Weight PR", detail: d !== null ? `+${d} kg` : `${e.weightKg} kg` };
}
