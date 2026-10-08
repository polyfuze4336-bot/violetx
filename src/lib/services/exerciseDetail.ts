import {
  exerciseEntryRepository,
  exerciseRepository,
} from "@/lib/repositories/exercise";
import { requireViewerAthlete } from "@/lib/services/context";
import { toExerciseDTO, toNumber, type ExerciseDTO } from "@/lib/dto";
import { describeProgression, type ProgressionSummary } from "@/lib/workout-engine";
import { isAssistedExercise, isBetterLoad } from "@/lib/progression-type";

/** Epley estimated one-rep max: weight * (1 + reps / 30). Analytical only. */
export function estimatedStrength(weightKg: number, reps: number): number {
  const v = reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
  return Math.round(v * 10) / 10;
}

export interface PerformanceRef {
  weightKg: number;
  reps: number;
  date: string;
}

export interface ProgressionPoint {
  date: string; // ISO (session day)
  topWeight: number;
  maxReps: number;
  estStrength: number;
}

export interface ExerciseSetRow {
  id: string;
  date: string;
  reps: number;
  weightKg: number;
  estStrength: number;
  source: string;
}

export interface LatestProgression extends ProgressionSummary {
  fromDate: string;
  toDate: string;
}

export interface ExerciseDetailDTO {
  exercise: ExerciseDTO;
  /**
   * Assisted exercise: weights are assistance, so "max weight" is the LOWEST
   * assistance, estimated strength is not computed and charts read "lower = stronger".
   */
  assisted: boolean;
  /** Last session vs the one before it: load and rep progression. */
  latestProgression: LatestProgression | null;
  currentBest: { weightKg: number; reps: number } | null;
  maxWeight: PerformanceRef | null;
  maxReps: PerformanceRef | null;
  maxEstStrength: (PerformanceRef & { value: number }) | null;
  latest: PerformanceRef | null;
  best: PerformanceRef | null;
  totalSessions: number;
  totalSets: number;
  progression: ProgressionPoint[];
  history: ExerciseSetRow[];
}

export const exerciseDetailService = {
  async get(exerciseId: string): Promise<ExerciseDetailDTO | null> {
    const { athleteId } = await requireViewerAthlete();
    const exercise = await exerciseRepository.getById(athleteId, exerciseId);
    if (!exercise) return null;

    const entries = await exerciseEntryRepository.listForExercise(
      athleteId,
      exerciseId
    );

    const assisted = isAssistedExercise(exercise);
    const detail: ExerciseDetailDTO = {
      exercise: toExerciseDTO(exercise),
      assisted,
      latestProgression: null,
      currentBest: null,
      maxWeight: null,
      maxReps: null,
      maxEstStrength: null,
      latest: null,
      best: null,
      totalSessions: 0,
      totalSets: entries.length,
      progression: [],
      history: [],
    };

    if (entries.length === 0) return detail;

    // Aggregate per session day for the progression chart.
    const byDay = new Map<
      string,
      { date: string; topWeight: number; maxReps: number; estStrength: number }
    >();

    for (const e of entries) {
      const weightKg = toNumber(e.weightKg);
      const reps = e.reps;
      const iso = e.date.toISOString();
      const est = assisted ? 0 : estimatedStrength(weightKg, reps);

      detail.history.push({
        id: e.id,
        date: iso,
        reps,
        weightKg,
        estStrength: est,
        source: e.source,
      });

      // Max weight (heaviest, or lowest assistance; tie -> more reps).
      if (
        !detail.maxWeight ||
        isBetterLoad(weightKg, detail.maxWeight.weightKg, assisted) ||
        (weightKg === detail.maxWeight.weightKg &&
          reps > detail.maxWeight.reps)
      ) {
        detail.maxWeight = { weightKg, reps, date: iso };
      }
      // Max reps (most; tie -> heavier).
      if (
        !detail.maxReps ||
        reps > detail.maxReps.reps ||
        (reps === detail.maxReps.reps && isBetterLoad(weightKg, detail.maxReps.weightKg, assisted))
      ) {
        detail.maxReps = { reps, weightKg, date: iso };
      }
      // Highest estimated strength.
      if (!assisted && (!detail.maxEstStrength || est > detail.maxEstStrength.value)) {
        detail.maxEstStrength = { value: est, weightKg, reps, date: iso };
      }

      const day = iso.slice(0, 10);
      const agg = byDay.get(day) ?? {
        date: iso,
        topWeight: weightKg,
        maxReps: 0,
        estStrength: 0,
      };
      agg.topWeight = assisted ? Math.min(agg.topWeight, weightKg) : Math.max(agg.topWeight, weightKg);
      agg.maxReps = Math.max(agg.maxReps, reps);
      agg.estStrength = Math.max(agg.estStrength, est);
      byDay.set(day, agg);
    }

    // Entries are ascending, so the last is the latest performance.
    const last = entries[entries.length - 1];
    detail.latest = {
      weightKg: toNumber(last.weightKg),
      reps: last.reps,
      date: last.date.toISOString(),
    };

    detail.best = detail.maxEstStrength
      ? {
          weightKg: detail.maxEstStrength.weightKg,
          reps: detail.maxEstStrength.reps,
          date: detail.maxEstStrength.date,
        }
      : detail.maxWeight;

    detail.currentBest = detail.maxWeight
      ? { weightKg: detail.maxWeight.weightKg, reps: detail.maxWeight.reps }
      : null;

    // Last session vs the previous one (working sets only).
    const days = new Map<string, { weightKg: number; reps: number }[]>();
    for (const e of entries) {
      if (e.setType === "WARMUP") continue;
      const d = e.date.toISOString().slice(0, 10);
      const list = days.get(d) ?? [];
      list.push({ weightKg: toNumber(e.weightKg), reps: e.reps });
      days.set(d, list);
    }
    const dayKeys = Array.from(days.keys()).sort();
    if (dayKeys.length >= 2) {
      const [fromDate, toDate] = dayKeys.slice(-2);
      const p = describeProgression(days.get(fromDate)!, days.get(toDate)!, assisted);
      if (p.load || p.reps) detail.latestProgression = { ...p, fromDate, toDate };
    }

    detail.totalSessions = byDay.size;
    detail.progression = Array.from(byDay.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return detail;
  },
};
