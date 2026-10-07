import { bodyWeightRepository } from "@/lib/repositories/bodyWeight";
import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { measurementEntryRepository } from "@/lib/repositories/measurement";
import { programRepository } from "@/lib/repositories/program";
import { workoutRepository } from "@/lib/repositories/workout";
import { requireViewerAthlete } from "@/lib/services/context";
import { derivePrEvents } from "@/lib/services/personalRecord";
import { toNumber } from "@/lib/dto";
import { buildAnalytics, type AnalyticsResult, type RangeKey } from "@/lib/analytics-engine";

export const analyticsService = {
  async get(range: RangeKey, now: Date = new Date()): Promise<AnalyticsResult> {
    const { athleteId } = await requireViewerAthlete();
    const [entries, sessions, weights, measurements, programs] = await Promise.all([
      exerciseEntryRepository.list(athleteId),
      workoutRepository.completedSessionsForAnalytics(athleteId),
      bodyWeightRepository.list(athleteId),
      measurementEntryRepository.list(athleteId),
      programRepository.list(athleteId),
    ]);
    const active = programs.find((p) => p.isActive);

    return buildAnalytics(
      {
        sets: entries.map((e) => ({
          date: e.date.toISOString(),
          exerciseId: e.exerciseId,
          exerciseName: e.exercise?.name ?? "",
          muscleGroup: e.exercise?.muscleGroup ?? null,
          reps: e.reps,
          weightKg: toNumber(e.weightKg),
          sets: e.sets ?? null,
          setType: e.setType,
          sessionId: e.sessionId,
        })),
        sessions: sessions.map((s) => ({
          id: s.id,
          date: s.date.toISOString(),
          durationMin:
            s.startedAt && s.endedAt
              ? Math.max(1, Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60_000))
              : null,
          sessionRpe: s.sessionRpe,
        })),
        weights: weights.map((w) => ({ date: w.date.toISOString(), value: toNumber(w.weightKg) })),
        measurements: measurements.map((m) => ({
          name: m.type?.name ?? "",
          unit: m.unit,
          date: m.date.toISOString(),
          value: toNumber(m.value),
        })),
        prs: derivePrEvents(entries).map((p) => ({
          date: p.date,
          exerciseName: p.exerciseName,
          type: p.type,
          weightKg: p.weightKg,
          reps: p.reps,
        })),
        plannedPerWeek: active ? active.templates.length : null,
      },
      range,
      now
    );
  },
};
