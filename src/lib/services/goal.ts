import { bodyWeightRepository } from "@/lib/repositories/bodyWeight";
import { exerciseEntryRepository, exerciseRepository } from "@/lib/repositories/exercise";
import { goalRepository } from "@/lib/repositories/goal";
import { measurementEntryRepository } from "@/lib/repositories/measurement";
import { requireOwnerAthlete, requireViewerAthlete } from "@/lib/services/context";
import { toNumber } from "@/lib/dto";
import { NotFoundError } from "@/lib/rbac";
import {
  computeGoalProgress,
  type DatedValue,
  type GoalData,
  type GoalProgress,
  type GoalType,
} from "@/lib/goals";
import {
  createGoalSchema,
  updateGoalSchema,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "@/lib/goal-schemas";
import { epley } from "@/lib/training-analytics";

export interface GoalDTO {
  id: string;
  type: GoalType;
  title: string;
  exerciseId: string | null;
  exerciseName: string | null;
  unit: string;
  status: string;
  targetDate: string | null;
  weeklyTarget: number | null;
  notes: string | null;
  progress: GoalProgress;
}

interface Sources {
  weights: DatedValue[];
  waistCm: DatedValue[];
  entries: Awaited<ReturnType<typeof exerciseEntryRepository.list>>;
  trainingDays: string[];
}

async function loadSources(athleteId: string): Promise<Sources> {
  const [weights, measurements, entries] = await Promise.all([
    bodyWeightRepository.list(athleteId),
    measurementEntryRepository.list(athleteId),
    exerciseEntryRepository.list(athleteId),
  ]);
  const waistCm = measurements
    .filter((m) => /waist/i.test(m.type?.name ?? ""))
    .map((m) => ({
      date: m.date.toISOString(),
      value: toNumber(m.value) * (m.unit === "INCH" ? 2.54 : 1),
    }));
  const trainingDays = Array.from(
    new Set(entries.filter((e) => e.setType !== "WARMUP").map((e) => e.date.toISOString().slice(0, 10)))
  );
  return {
    weights: weights.map((w) => ({ date: w.date.toISOString(), value: toNumber(w.weightKg) })),
    waistCm,
    entries,
    trainingDays,
  };
}

function strengthSeries(entries: Sources["entries"], exerciseId: string): DatedValue[] {
  const perDay = new Map<string, number>();
  for (const e of entries) {
    if (e.exerciseId !== exerciseId || e.setType === "WARMUP") continue;
    const day = e.date.toISOString().slice(0, 10);
    perDay.set(day, Math.max(perDay.get(day) ?? 0, epley(toNumber(e.weightKg), e.reps)));
  }
  return Array.from(perDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

/** Readings for a goal in the goal's own unit. */
function dataFor(type: GoalType, unit: string, exerciseId: string | null, s: Sources): GoalData {
  if (type === "BODY_WEIGHT") return { series: s.weights };
  if (type === "WAIST") {
    const factor = unit === "in" ? 1 / 2.54 : 1;
    return { series: s.waistCm.map((p) => ({ ...p, value: p.value * factor })) };
  }
  if (type === "STRENGTH" && exerciseId) return { series: strengthSeries(s.entries, exerciseId) };
  return { trainingDays: s.trainingDays };
}

const DEFAULT_UNIT: Partial<Record<GoalType, string>> = {
  BODY_WEIGHT: "kg",
  WAIST: "cm",
  STRENGTH: "kg",
  WORKOUT_FREQUENCY: "/week",
  CONSISTENCY: "weeks",
};

const DEFAULT_TITLE: Record<GoalType, string> = {
  BODY_WEIGHT: "Body weight",
  WAIST: "Waist",
  STRENGTH: "Strength",
  WORKOUT_FREQUENCY: "Weekly workouts",
  CONSISTENCY: "Training consistency",
  CUSTOM: "Custom goal",
};

/** Session-free goal loader (also used by the token-authorised coach view). */
export async function loadGoals(athleteId: string, includeArchived = false): Promise<GoalDTO[]> {
    const [goals, sources, exercises] = await Promise.all([
      goalRepository.list(athleteId, includeArchived),
      loadSources(athleteId),
      exerciseRepository.list(athleteId),
    ]);
    const names = new Map(exercises.map((e) => [e.id, e.name]));
    return goals.map((g) => {
      const type = g.type as GoalType;
      const progress = computeGoalProgress(
        {
          type,
          startValue: g.startValue === null ? null : toNumber(g.startValue),
          targetValue: toNumber(g.targetValue),
          currentValue: g.currentValue === null ? null : toNumber(g.currentValue),
          weeklyTarget: g.weeklyTarget,
          startDate: g.startDate.toISOString(),
          targetDate: g.targetDate?.toISOString() ?? null,
        },
        dataFor(type, g.unit, g.exerciseId, sources)
      );
      return {
        id: g.id,
        type,
        title: g.title,
        exerciseId: g.exerciseId,
        exerciseName: g.exerciseId ? (names.get(g.exerciseId) ?? null) : null,
        unit: g.unit,
        status: g.status,
        targetDate: g.targetDate?.toISOString() ?? null,
        weeklyTarget: g.weeklyTarget,
        notes: g.notes,
        progress,
      };
    });
}

export const goalService = {
  async list(includeArchived = false): Promise<GoalDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    return loadGoals(athleteId, includeArchived);
  },

  /** Goal summary for dashboards (active goals only). */
  async active(): Promise<GoalDTO[]> {
    return (await goalService.list()).filter((g) => g.status === "ACTIVE");
  },

  async create(input: CreateGoalInput): Promise<GoalDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = createGoalSchema.parse(input);
    const sources = await loadSources(athleteId);

    if (data.exerciseId && !(await exerciseRepository.getById(athleteId, data.exerciseId))) {
      throw new NotFoundError("Exercise not found.");
    }
    const unit = data.unit || DEFAULT_UNIT[data.type] || "";
    const series = dataFor(data.type, unit, data.exerciseId ?? null, sources).series;
    // Fixed reference point for the trajectory: the reading at creation time.
    const startValue =
      data.type === "CUSTOM"
        ? (data.currentValue ?? 0)
        : series && series.length > 0
          ? series[series.length - 1].value
          : data.type === "CONSISTENCY"
            ? 0
            : null;
    const exercise = data.exerciseId ? await exerciseRepository.getById(athleteId, data.exerciseId) : null;
    const created = await goalRepository.create({
      athleteId,
      type: data.type,
      title: data.title || (exercise ? `${exercise.name} estimated 1RM` : DEFAULT_TITLE[data.type]),
      exerciseId: data.exerciseId ?? null,
      startValue: startValue === null ? null : Math.round(startValue * 100) / 100,
      targetValue: data.targetValue,
      currentValue: data.type === "CUSTOM" ? (data.currentValue ?? 0) : null,
      weeklyTarget: data.type === "CONSISTENCY" ? (data.weeklyTarget ?? 3) : null,
      unit,
      startDate: new Date(),
      targetDate: data.targetDate ?? null,
      notes: data.notes ?? null,
    });
    return (await goalService.list(true)).find((g) => g.id === created.id)!;
  },

  async update(input: UpdateGoalInput): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = updateGoalSchema.parse(input);
    const count = await goalRepository.update(athleteId, data.id, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.targetValue !== undefined ? { targetValue: data.targetValue } : {}),
      ...(data.currentValue !== undefined ? { currentValue: data.currentValue } : {}),
      ...(data.targetDate !== undefined ? { targetDate: data.targetDate } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
    });
    if (count === 0) throw new NotFoundError("Goal not found.");
  },
};
