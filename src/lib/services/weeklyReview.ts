import { bodyWeightRepository } from "@/lib/repositories/bodyWeight";
import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { checkInRepository } from "@/lib/repositories/goal";
import { measurementEntryRepository } from "@/lib/repositories/measurement";
import { programRepository } from "@/lib/repositories/program";
import { requireViewerAthlete } from "@/lib/services/context";
import { nutritionService } from "@/lib/services/nutrition";
import { toNumber } from "@/lib/dto";
import { detectPrEvents } from "@/lib/analytics";
import { computeReadiness } from "@/lib/readiness";
import { buildWeeklyReview, mondayOf, type WeeklyReview } from "@/lib/weekly-review";
import { todayIso } from "@/lib/dates";

export const weeklyReviewService = {
  /** Review for the Monday–Sunday week containing `weekOf` (default: this week). */
  async get(weekOf: string = todayIso()): Promise<WeeklyReview> {
    const { athleteId, actor } = await requireViewerAthlete();
    const isOwner = actor.role === "OWNER";
    const weekStart = mondayOf(weekOf);
    const since = new Date(new Date(`${weekStart}T00:00:00Z`).getTime() - 21 * 86_400_000);

    const [entries, weights, measurements, checkIns, programs, nutrition, targets] = await Promise.all([
      exerciseEntryRepository.list(athleteId),
      bodyWeightRepository.list(athleteId),
      measurementEntryRepository.list(athleteId),
      checkInRepository.list(athleteId, since),
      programRepository.list(athleteId),
      // Nutrition is private to the athlete.
      isOwner ? nutritionService.list() : Promise.resolve([]),
      isOwner ? nutritionService.getTargets() : Promise.resolve(null),
    ]);
    const active = programs.find((p) => p.isActive);

    const working = entries.filter((e) => e.setType !== "WARMUP");
    const prs = detectPrEvents(
      working.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exercise?.name ?? "",
        date: e.date.toISOString(),
        weightKg: toNumber(e.weightKg),
        reps: e.reps,
        position: e.position,
      }))
    );

    return buildWeeklyReview({
      weekStart,
      sets: working.map((e) => ({
        date: e.date.toISOString(),
        exerciseId: e.exerciseId,
        exerciseName: e.exercise?.name ?? "",
        muscleGroup: e.exercise?.muscleGroup ?? null,
        reps: e.reps,
        weightKg: toNumber(e.weightKg),
        sets: e.sets ?? null,
        setType: e.setType,
      })),
      prs: prs.map((p) => ({
        date: p.date,
        exerciseName: p.exerciseName,
        type: p.type,
        weightKg: p.weightKg,
        reps: p.reps,
        prevWeightKg: p.prevWeightKg,
        prevReps: p.prevReps,
      })),
      weights: weights.map((w) => ({ date: w.date.toISOString(), value: toNumber(w.weightKg) })),
      waistCm: measurements
        .filter((m) => /waist/i.test(m.type?.name ?? ""))
        .map((m) => ({ date: m.date.toISOString(), value: toNumber(m.value) * (m.unit === "INCH" ? 2.54 : 1) })),
      checkIns: checkIns.map((c) => ({
        date: c.date.toISOString(),
        score: computeReadiness({
          sleepHours: toNumber(c.sleepHours),
          sleepQuality: c.sleepQuality,
          energy: c.energy,
          soreness: c.soreness,
          stress: c.stress,
          motivation: c.motivation,
        }).score,
      })),
      nutrition: nutrition.map((n) => ({ date: n.entryDate, calories: n.calories, protein: n.protein, water: n.water })),
      targets: targets ? { calories: targets.calories, protein: targets.protein, waterL: targets.waterL } : null,
      plannedPerWeek: active ? active.templates.length : null,
    });
  },
};
