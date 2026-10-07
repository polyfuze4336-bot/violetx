import { generateCoachTipsWithAi, type CoachAiContext } from "@/ai/coach";
import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { requireViewerAthlete } from "@/lib/services/context";
import { toNumber } from "@/lib/dto";
import { derivePrEvents } from "@/lib/services/personalRecord";
import {
  buildExerciseSeries,
  buildRuleBasedTips,
  periodStart,
  rollingWindow,
  setsPerDay,
  summarizeExercises,
  summarizePeriods,
  type CoachTip,
  type ExerciseProgress,
  type ExerciseSeries,
  type Period,
  type PeriodSummary,
  type RollingWindow,
  type TrainingSet,
} from "@/lib/training-analytics";

export interface TrainingProgressDTO {
  period: Period;
  periods: (PeriodSummary & { prs: number })[];
  window: RollingWindow;
  exercises: ExerciseProgress[];
  tips: CoachTip[];
  lastTrainingDate: string | null;
  series: ExerciseSeries[];
}

export interface TrainingHistoryDTO {
  series: ExerciseSeries[];
  perDay: Record<string, number>;
  months: (PeriodSummary & { prs: number })[];
  prEvents: ReturnType<typeof derivePrEvents>;
}

export interface AiTipsDTO {
  source: "ai" | "rules";
  summary: string | null;
  tips: CoachTip[];
}

const PERIOD_COUNT: Record<Period, number> = { week: 12, month: 12 };

// Exercise names are free text: keep them short and single-line before they
// are shown to the model.
function safeName(name: string): string {
  return name.replace(/[\r\n\t]+/g, " ").slice(0, 60);
}

async function loadRows(): Promise<{ rows: TrainingSet[]; prEvents: ReturnType<typeof derivePrEvents> }> {
  const { athleteId } = await requireViewerAthlete();
  const entries = await exerciseEntryRepository.list(athleteId);
  return {
    rows: entries.map((e) => ({
      date: e.date.toISOString(),
      exerciseId: e.exerciseId,
      exerciseName: e.exercise?.name ?? "",
      muscleGroup: e.exercise?.muscleGroup ?? null,
      reps: e.reps,
      weightKg: toNumber(e.weightKg),
      sets: e.sets ?? null,
    })),
    prEvents: derivePrEvents(entries),
  };
}

function compute(
  rows: TrainingSet[],
  prEvents: ReturnType<typeof derivePrEvents>,
  period: Period,
  now: Date
) {
  const periods = summarizePeriods(rows, period, PERIOD_COUNT[period], now);
  const prsByKey = new Map<string, number>();
  for (const p of prEvents) {
    const key = periodStart(p.date, period);
    prsByKey.set(key, (prsByKey.get(key) ?? 0) + 1);
  }
  const weeks =
    period === "week" ? periods : summarizePeriods(rows, "week", 8, now);
  const window = rollingWindow(rows, now);
  const exercises = summarizeExercises(rows, now);
  const lastTrainingDate =
    rows.map((r) => r.date.slice(0, 10)).sort().pop() ?? null;
  const tips = buildRuleBasedTips({ weeks, window, exercises, lastTrainingDate, now });
  return {
    periods: periods.map((p) => ({ ...p, prs: prsByKey.get(p.key) ?? 0 })),
    window,
    exercises,
    tips,
    lastTrainingDate,
    series: buildExerciseSeries(rows),
  };
}

export const trainingProgressService = {
  async get(period: Period, now: Date = new Date()): Promise<TrainingProgressDTO> {
    const { rows, prEvents } = await loadRows();
    return { period, ...compute(rows, prEvents, period, now) };
  },

  /** Chart data for the Records and History pages. */
  async history(now: Date = new Date()): Promise<TrainingHistoryDTO> {
    const { rows, prEvents } = await loadRows();
    const { periods } = compute(rows, prEvents, "month", now);
    return {
      series: buildExerciseSeries(rows),
      perDay: setsPerDay(rows),
      months: periods,
      prEvents,
    };
  },

  /** AI tips from aggregated numbers only; falls back to the rule-based tips. */
  async aiTips(period: Period, now: Date = new Date()): Promise<AiTipsDTO> {
    const { rows, prEvents } = await loadRows();
    const data = compute(rows, prEvents, period, now);

    const ctx: CoachAiContext = {
      period,
      recentPeriods: data.periods.slice(-8).map((p) => ({
        label: p.label,
        sessions: p.sessions,
        sets: p.sets,
        volumeKg: p.volumeKg,
      })),
      weeklySetsByMuscle: data.window.weeklySetsByMuscle as Record<string, number>,
      sessionsPerWeek: data.window.sessionsPerWeek,
      exercises: data.exercises.slice(0, 12).map((e) => ({
        name: safeName(e.name),
        muscleGroup: e.muscleGroup,
        sessions: e.sessions,
        estStrengthFirstKg: e.firstE1rm,
        estStrengthLatestKg: e.latestE1rm,
        changePct: e.changePct,
        status: e.status,
      })),
    };

    if (data.window.totalSets === 0) {
      return { source: "rules", summary: null, tips: data.tips };
    }
    const ai = await generateCoachTipsWithAi(ctx);
    return ai
      ? { source: "ai", summary: ai.summary, tips: ai.tips }
      : { source: "rules", summary: null, tips: data.tips };
  },
};
