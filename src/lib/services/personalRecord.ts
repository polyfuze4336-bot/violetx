import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { requireViewerAthlete } from "@/lib/services/context";
import { toNumber } from "@/lib/dto";
import { detectPrEvents, type PrEvent } from "@/lib/analytics";

export type PrEventDTO = PrEvent;

export interface PersonalRecordDTO {
  exerciseId: string;
  exerciseName: string;
  maxWeightKg: number;
  maxWeightReps: number;
  maxWeightDate: string;
  maxReps: number;
  maxRepsWeightKg: number;
  maxRepsDate: string;
  /** Best estimated one-rep max across all sets (Epley formula). */
  estimatedOneRepMaxKg: number;
  totalSets: number;
  lastPerformed: string;
}

/** Epley estimated one-rep max: weight * (1 + reps / 30). */
function epley(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export const personalRecordService = {
  /**
   * Derive personal records per exercise from the raw set history so they are
   * always consistent with the underlying data.
   */
  async list(): Promise<PersonalRecordDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const entries = await exerciseEntryRepository.list(athleteId);
    return derivePersonalRecords(entries);
  },

  /**
   * Chronological personal-record achievements (most recent first): new maximum
   * loads and rep PRs at the same load.
   */
  async prEvents(): Promise<PrEventDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const entries = await exerciseEntryRepository.list(athleteId);
    return derivePrEvents(entries);
  },
};

export type ExerciseEntryRows = Awaited<
  ReturnType<typeof exerciseEntryRepository.list>
>;

/** Session-free derivation, also used by the read-only coach share view. */
export function derivePersonalRecords(
  allEntries: ExerciseEntryRows
): PersonalRecordDTO[] {
  const entries = allEntries.filter((e) => e.setType !== "WARMUP");
  const byExercise = new Map<
    string,
    {
      name: string;
      maxWeight: { weightKg: number; reps: number; date: Date };
      maxReps: { reps: number; weightKg: number; date: Date };
      best1rm: number;
      totalSets: number;
      lastPerformed: Date;
    }
  >();

  for (const e of entries) {
    const weightKg = toNumber(e.weightKg);
    const reps = e.reps;
    const name = e.exercise?.name ?? "";
    const existing = byExercise.get(e.exerciseId);
    const oneRm = epley(weightKg, reps);

    if (!existing) {
      byExercise.set(e.exerciseId, {
        name,
        maxWeight: { weightKg, reps, date: e.date },
        maxReps: { reps, weightKg, date: e.date },
        best1rm: oneRm,
        totalSets: 1,
        lastPerformed: e.date,
      });
      continue;
    }

    existing.totalSets += 1;
    if (e.date > existing.lastPerformed) existing.lastPerformed = e.date;
    if (oneRm > existing.best1rm) existing.best1rm = oneRm;

    const mw = existing.maxWeight;
    if (
      weightKg > mw.weightKg ||
      (weightKg === mw.weightKg && reps > mw.reps)
    ) {
      existing.maxWeight = { weightKg, reps, date: e.date };
    }

    const mr = existing.maxReps;
    if (reps > mr.reps || (reps === mr.reps && weightKg > mr.weightKg)) {
      existing.maxReps = { reps, weightKg, date: e.date };
    }
  }

  const records: PersonalRecordDTO[] = [];
  for (const [exerciseId, r] of Array.from(byExercise.entries())) {
    records.push({
      exerciseId,
      exerciseName: r.name,
      maxWeightKg: r.maxWeight.weightKg,
      maxWeightReps: r.maxWeight.reps,
      maxWeightDate: r.maxWeight.date.toISOString(),
      maxReps: r.maxReps.reps,
      maxRepsWeightKg: r.maxReps.weightKg,
      maxRepsDate: r.maxReps.date.toISOString(),
      estimatedOneRepMaxKg: Math.round(r.best1rm * 10) / 10,
      totalSets: r.totalSets,
      lastPerformed: r.lastPerformed.toISOString(),
    });
  }

  records.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
  return records;
}

export function derivePrEvents(entries: ExerciseEntryRows): PrEventDTO[] {
  return detectPrEvents(
    entries
      .filter((e) => e.setType !== "WARMUP")
      .map((e) => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exercise?.name ?? "",
      date: e.date.toISOString(),
      weightKg: toNumber(e.weightKg),
      reps: e.reps,
      position: e.position,
    }))
  );
}
