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
    const bestRepsAtWeight = new Map<number, number>();
    let hasBaseline = false;

    for (const s of list) {
      if (!hasBaseline) {
        hasBaseline = true;
        maxWeight = s.weightKg;
        maxWeightReps = s.reps;
        bestRepsAtWeight.set(s.weightKg, s.reps);
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
          s.weightKg,
          Math.max(bestRepsAtWeight.get(s.weightKg) ?? 0, s.reps)
        );
      } else {
        const prevReps = bestRepsAtWeight.get(s.weightKg) ?? 0;
        if (s.reps > prevReps) {
          events.push({
            exerciseId: s.exerciseId,
            exerciseName: s.exerciseName,
            date: s.date,
            weightKg: s.weightKg,
            reps: s.reps,
            type: "REPS",
            prevWeightKg: s.weightKg,
            prevReps: prevReps || null,
          });
          bestRepsAtWeight.set(s.weightKg, s.reps);
          if (s.weightKg === maxWeight) maxWeightReps = s.reps;
        } else {
          bestRepsAtWeight.set(s.weightKg, Math.max(prevReps, s.reps));
        }
      }
    }
  }

  events.sort((a, b) => b.date.localeCompare(a.date));
  return events;
}
