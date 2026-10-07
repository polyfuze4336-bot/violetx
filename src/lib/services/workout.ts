import { workoutRepository, type SessionWithDetails } from "@/lib/repositories/workout";
import { exerciseRepository } from "@/lib/repositories/exercise";
import { programRepository } from "@/lib/repositories/program";
import { requireOwnerAthlete, requireViewerAthlete } from "@/lib/services/context";
import { toNumber } from "@/lib/dto";
import { AuthorizationError, NotFoundError } from "@/lib/rbac";
import {
  detectSetPrs,
  setVolume,
  summarizeSessions,
  suggestProgression,
  workingSets,
  exerciseBests,
  type LoggedSet,
  type OverloadSuggestion,
  type PrAchievement,
} from "@/lib/workout-engine";
import {
  finishWorkoutSchema,
  logSetSchema,
  startWorkoutSchema,
  updateSetSchema,
  workoutExerciseNotesSchema,
  type FinishWorkoutInput,
  type LogSetInput,
  type StartWorkoutInput,
  type UpdateSetInput,
} from "@/lib/workout-schemas";
import { resolveMuscleGroup } from "@/lib/training-analytics";

export interface ActiveSetDTO {
  id: string;
  setType: string;
  weightKg: number;
  reps: number;
  rpe: number | null;
  rir: number | null;
}

export interface ActiveExerciseDTO {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  notes: string | null;
  skipped: boolean;
  supersetGroup: number | null;
  /** Programmed targets from a template, when started from one. */
  target: { sets: number; repMin: number; repMax: number; restSec: number | null } | null;
  sets: ActiveSetDTO[];
  previous: { date: string; sets: { weightKg: number; reps: number }[] } | null;
  suggestion: OverloadSuggestion;
  bests: { maxWeightKg: number; maxE1rm: number };
}

export interface ActiveWorkoutDTO {
  id: string;
  name: string | null;
  date: string;
  startedAt: string | null;
  gym: { id: string; name: string } | null;
  exercises: ActiveExerciseDTO[];
}

export interface LoggedSetResult {
  set: ActiveSetDTO;
  prs: PrAchievement[];
}

export interface WorkoutSummaryDTO {
  sessionId: string;
  discarded: boolean;
  durationMin: number | null;
  totalSets: number;
  totalVolumeKg: number;
  exerciseCount: number;
  prs: { exerciseName: string; achievements: PrAchievement[] }[];
}

export interface WorkoutListItemDTO {
  id: string;
  date: string;
  name: string | null;
  status: string;
  durationMin: number | null;
  sets: number;
  volumeKg: number;
  exercises: string[];
  gym: string | null;
  sessionRpe: number | null;
}

const toSetDTO = (e: {
  id: string;
  setType: string;
  weightKg: unknown;
  reps: number;
  rpe: unknown;
  rir: number | null;
}): ActiveSetDTO => ({
  id: e.id,
  setType: e.setType,
  weightKg: toNumber(e.weightKg as number),
  reps: e.reps,
  rpe: e.rpe === null || e.rpe === undefined ? null : toNumber(e.rpe as number),
  rir: e.rir,
});

function toLogged(e: {
  date: Date;
  weightKg: unknown;
  reps: number;
  setType: string;
  rpe: unknown;
  sessionId: string | null;
}): LoggedSet {
  return {
    date: e.date.toISOString(),
    weightKg: toNumber(e.weightKg as number),
    reps: e.reps,
    setType: e.setType,
    rpe: e.rpe === null || e.rpe === undefined ? null : toNumber(e.rpe as number),
    sessionId: e.sessionId,
  };
}

function durationMin(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
}

async function buildActiveView(
  athleteId: string,
  session: SessionWithDetails
): Promise<ActiveWorkoutDTO> {
  const exercises = await Promise.all(
    session.exercises.map(async (we): Promise<ActiveExerciseDTO> => {
      const all = (await workoutRepository.exerciseHistory(athleteId, we.exerciseId)).map(toLogged);
      const prior = all.filter((s) => s.sessionId !== session.id);
      const lastSession = summarizeSessions(prior)[0];
      return {
        id: we.id,
        exerciseId: we.exerciseId,
        name: we.exercise.name,
        muscleGroup: resolveMuscleGroup(we.exercise.name, we.exercise.muscleGroup),
        equipment: we.exercise.equipment,
        notes: we.notes,
        skipped: we.skipped,
        supersetGroup: we.supersetGroup,
        target:
          we.targetSets && we.repMin && we.repMax
            ? { sets: we.targetSets, repMin: we.repMin, repMax: we.repMax, restSec: we.restSec }
            : null,
        sets: we.sets.map(toSetDTO),
        previous: lastSession
          ? {
              date: lastSession.date,
              sets: lastSession.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
            }
          : null,
        suggestion: suggestProgression(
          prior,
          we.repMin && we.repMax ? { repMin: we.repMin, repMax: we.repMax } : {}
        ),
        bests: (() => {
          const b = exerciseBests(prior);
          return { maxWeightKg: b.maxWeightKg, maxE1rm: b.maxE1rm };
        })(),
      };
    })
  );
  return {
    id: session.id,
    name: session.name,
    date: session.date.toISOString(),
    startedAt: session.startedAt?.toISOString() ?? null,
    gym: session.gymBranch ? { id: session.gymBranch.id, name: session.gymBranch.name } : null,
    exercises,
  };
}

async function requireActiveSession(athleteId: string) {
  const session = await workoutRepository.findActive(athleteId);
  if (!session) throw new NotFoundError("No workout in progress.");
  return session;
}

export const workoutService = {
  // --- Reads (OWNER or COACH) ---
  async listSessions(take = 30): Promise<WorkoutListItemDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const rows = await workoutRepository.listSessions(athleteId, take);
    return rows.map((s) => {
      const work = workingSets(s.entries);
      return {
        id: s.id,
        date: s.date.toISOString(),
        name: s.name,
        status: s.status,
        durationMin: durationMin(s.startedAt, s.endedAt),
        sets: work.length,
        volumeKg: Math.round(work.reduce((a, e) => a + setVolume({ weightKg: toNumber(e.weightKg), reps: e.reps }), 0)),
        exercises: Array.from(new Set(s.entries.map((e) => e.exercise.name))),
        gym: s.gymBranch?.name ?? null,
        sessionRpe: s.sessionRpe,
      };
    });
  },

  // --- Owner-only live workout ---
  async getActive(): Promise<ActiveWorkoutDTO | null> {
    const { athleteId } = await requireOwnerAthlete();
    const session = await workoutRepository.findActive(athleteId);
    return session ? buildActiveView(athleteId, session) : null;
  },

  /** Start a workout, or resume the one already in progress. */
  async start(input: StartWorkoutInput): Promise<ActiveWorkoutDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = startWorkoutSchema.parse(input);

    const existing = await workoutRepository.findActive(athleteId);
    if (existing) return buildActiveView(athleteId, existing);

    if (data.gymBranchId && !(await workoutRepository.gymBranchExists(data.gymBranchId))) {
      throw new NotFoundError("Gym not found.");
    }
    const template = data.templateId
      ? await programRepository.getTemplate(athleteId, data.templateId)
      : null;
    if (data.templateId && !template) throw new NotFoundError("Workout template not found.");

    const session = await workoutRepository.createSession({
      athleteId,
      date: data.date,
      name: data.name ?? template?.name ?? null,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      gymBranchId: data.gymBranchId ?? null,
      programId: template?.program.id ?? null,
      templateId: template?.id ?? null,
    });
    let order = 0;
    // Targets are copied onto the workout so later program edits never
    // change what was planned for this session.
    for (const te of template?.exercises ?? []) {
      await workoutRepository.createWorkoutExercise({
        athleteId,
        sessionId: session.id,
        exerciseId: te.exerciseId,
        sortOrder: order++,
        targetSets: te.targetSets,
        repMin: te.repMin,
        repMax: te.repMax,
        restSec: te.restSec,
        notes: te.notes,
      });
    }
    for (const exerciseId of template ? [] : data.exerciseIds) {
      const exercise = await exerciseRepository.getById(athleteId, exerciseId);
      if (!exercise) continue;
      await workoutRepository.createWorkoutExercise({
        athleteId,
        sessionId: session.id,
        exerciseId,
        sortOrder: order++,
      });
    }
    const full = await workoutRepository.getById(athleteId, session.id);
    return buildActiveView(athleteId, full!);
  },

  async addExercise(exerciseId: string): Promise<ActiveWorkoutDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const session = await requireActiveSession(athleteId);
    const exercise = await exerciseRepository.getById(athleteId, exerciseId);
    if (!exercise) throw new NotFoundError("Exercise not found.");
    await workoutRepository.createWorkoutExercise({
      athleteId,
      sessionId: session.id,
      exerciseId,
      sortOrder: (await workoutRepository.maxSortOrder(session.id)) + 1,
    });
    return buildActiveView(athleteId, (await workoutRepository.getById(athleteId, session.id))!);
  },

  async replaceExercise(workoutExerciseId: string, newExerciseId: string): Promise<ActiveWorkoutDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const session = await requireActiveSession(athleteId);
    const we = await workoutRepository.getWorkoutExercise(athleteId, workoutExerciseId);
    if (!we || we.sessionId !== session.id) throw new NotFoundError("Exercise not found in this workout.");
    if (we.sets.length > 0) {
      throw new AuthorizationError("This exercise already has logged sets. Skip it and add another instead.");
    }
    const exercise = await exerciseRepository.getById(athleteId, newExerciseId);
    if (!exercise) throw new NotFoundError("Exercise not found.");
    await workoutRepository.updateWorkoutExercise(athleteId, workoutExerciseId, { exerciseId: newExerciseId });
    return buildActiveView(athleteId, (await workoutRepository.getById(athleteId, session.id))!);
  },

  async setSkipped(workoutExerciseId: string, skipped: boolean): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const session = await requireActiveSession(athleteId);
    const we = await workoutRepository.getWorkoutExercise(athleteId, workoutExerciseId);
    if (!we || we.sessionId !== session.id) throw new NotFoundError("Exercise not found in this workout.");
    await workoutRepository.updateWorkoutExercise(athleteId, workoutExerciseId, { skipped });
  },

  async removeExercise(workoutExerciseId: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const session = await requireActiveSession(athleteId);
    const we = await workoutRepository.getWorkoutExercise(athleteId, workoutExerciseId);
    if (!we || we.sessionId !== session.id) throw new NotFoundError("Exercise not found in this workout.");
    if (we.sets.length > 0) throw new AuthorizationError("Remove its sets first, or skip the exercise.");
    await workoutRepository.deleteWorkoutExercise(athleteId, workoutExerciseId);
  },

  async setExerciseNotes(input: { workoutExerciseId: string; notes: string }): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = workoutExerciseNotesSchema.parse(input);
    const count = await workoutRepository.updateWorkoutExercise(athleteId, data.workoutExerciseId, {
      notes: data.notes || null,
    });
    if (count === 0) throw new NotFoundError("Exercise not found.");
  },

  /** Log a completed set and report any PRs it achieved. */
  async logSet(input: LogSetInput): Promise<LoggedSetResult> {
    const { athleteId } = await requireOwnerAthlete();
    const data = logSetSchema.parse(input);
    const session = await requireActiveSession(athleteId);
    const we = await workoutRepository.getWorkoutExercise(athleteId, data.workoutExerciseId);
    if (!we || we.sessionId !== session.id) throw new NotFoundError("Exercise not found in this workout.");
    if (we.skipped) throw new AuthorizationError("This exercise is marked as skipped.");

    const all = (await workoutRepository.exerciseHistory(athleteId, we.exerciseId)).map(toLogged);
    const priorHistory = all.filter((s) => s.sessionId !== session.id);
    const sessionSetsSoFar = we.sets.map((s) => ({
      weightKg: toNumber(s.weightKg),
      reps: s.reps,
      setType: s.setType,
    }));

    const position = await workoutRepository.countSessionSets(session.id);
    const created = await workoutRepository.createSet({
      athleteId,
      exerciseId: we.exerciseId,
      sessionId: session.id,
      workoutExerciseId: we.id,
      date: session.date,
      reps: data.reps,
      weightKg: data.weightKg,
      setType: data.setType,
      rpe: data.rpe ?? null,
      rir: data.rir ?? null,
      completedAt: new Date(),
      position,
      source: "MANUAL",
    });

    const prs = detectSetPrs({
      set: { weightKg: data.weightKg, reps: data.reps, setType: data.setType },
      priorHistory,
      sessionSetsSoFar,
    });
    return { set: toSetDTO(created), prs };
  },

  async updateSet(input: UpdateSetInput): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = updateSetSchema.parse(input);
    const existing = await workoutRepository.getSet(athleteId, data.setId);
    if (!existing) throw new NotFoundError("Set not found.");
    await workoutRepository.updateSet(athleteId, data.setId, {
      ...(data.weightKg !== undefined ? { weightKg: data.weightKg } : {}),
      ...(data.reps !== undefined ? { reps: data.reps } : {}),
      ...(data.rpe !== undefined ? { rpe: data.rpe } : {}),
      ...(data.rir !== undefined ? { rir: data.rir } : {}),
      ...(data.setType !== undefined ? { setType: data.setType } : {}),
    });
  },

  async deleteSet(setId: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const count = await workoutRepository.deleteSet(athleteId, setId);
    if (count === 0) throw new NotFoundError("Set not found.");
  },

  /** Finish the live workout. A workout with no sets is discarded. */
  async finish(input: FinishWorkoutInput = {}): Promise<WorkoutSummaryDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = finishWorkoutSchema.parse(input);
    const session = await requireActiveSession(athleteId);

    const sets = session.exercises.flatMap((e) => e.sets);
    if (sets.length === 0) {
      await workoutRepository.discardSession(athleteId, session.id);
      return {
        sessionId: session.id,
        discarded: true,
        durationMin: null,
        totalSets: 0,
        totalVolumeKg: 0,
        exerciseCount: 0,
        prs: [],
      };
    }

    const gymBranchId = data.gymBranchId ?? session.gymBranchId ?? undefined;
    if (gymBranchId && !(await workoutRepository.gymBranchExists(gymBranchId))) {
      throw new NotFoundError("Gym not found.");
    }

    const endedAt = new Date();
    await workoutRepository.updateSession(athleteId, session.id, {
      status: "COMPLETED",
      endedAt,
      sessionRpe: data.sessionRpe ?? null,
      difficulty: data.difficulty ?? null,
      note: data.note ?? null,
      ...(data.name ? { name: data.name } : {}),
      ...(gymBranchId ? { gymBranchId } : {}),
    });

    // A workout at a gym counts as a gym visit (one per gym per day).
    if (gymBranchId && !(await workoutRepository.findGymVisitOnDay(athleteId, gymBranchId, session.date))) {
      await workoutRepository.createGymVisit({
        athleteId,
        gymBranchId,
        visitedAt: session.date,
        source: "WORKOUT",
        notes: null,
      });
    }

    // Replay PR detection against history that existed before this session.
    const prs: WorkoutSummaryDTO["prs"] = [];
    for (const we of session.exercises) {
      if (we.sets.length === 0) continue;
      const all = (await workoutRepository.exerciseHistory(athleteId, we.exerciseId)).map(toLogged);
      const priorHistory = all.filter((s) => s.sessionId !== session.id);
      const soFar: { weightKg: number; reps: number; setType: string }[] = [];
      const found = new Map<string, PrAchievement>();
      for (const s of we.sets) {
        const w = { weightKg: toNumber(s.weightKg), reps: s.reps, setType: s.setType };
        for (const a of detectSetPrs({ set: w, priorHistory, sessionSetsSoFar: soFar })) {
          const cur = found.get(a.type);
          if (!cur || a.value > cur.value) found.set(a.type, a);
        }
        soFar.push(w);
      }
      if (found.size > 0) prs.push({ exerciseName: we.exercise.name, achievements: Array.from(found.values()) });
    }

    const working = workingSets(sets);
    return {
      sessionId: session.id,
      discarded: false,
      durationMin: durationMin(session.startedAt, endedAt),
      totalSets: working.length,
      totalVolumeKg: Math.round(working.reduce((a, s) => a + setVolume({ weightKg: toNumber(s.weightKg), reps: s.reps }), 0)),
      exerciseCount: session.exercises.filter((e) => e.sets.length > 0).length,
      prs,
    };
  },

  async discard(): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const session = await requireActiveSession(athleteId);
    await workoutRepository.discardSession(athleteId, session.id);
  },
};
