import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const activeInclude = {
  gymBranch: { select: { id: true, name: true, state: true } },
  exercises: {
    orderBy: { sortOrder: "asc" },
    include: {
      exercise: true,
      sets: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
  },
} satisfies Prisma.WorkoutSessionInclude;

export type SessionWithDetails = Prisma.WorkoutSessionGetPayload<{
  include: typeof activeInclude;
}>;

export const workoutRepository = {
  findActive(athleteId: string) {
    return prisma.workoutSession.findFirst({
      where: { athleteId, status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      include: activeInclude,
    });
  },

  getById(athleteId: string, id: string) {
    return prisma.workoutSession.findFirst({
      where: { id, athleteId },
      include: activeInclude,
    });
  },

  createSession(data: Prisma.WorkoutSessionUncheckedCreateInput) {
    return prisma.workoutSession.create({ data });
  },

  async updateSession(
    athleteId: string,
    id: string,
    data: Prisma.WorkoutSessionUncheckedUpdateInput
  ) {
    const r = await prisma.workoutSession.updateMany({ where: { id, athleteId }, data });
    return r.count;
  },

  createWorkoutExercise(data: Prisma.WorkoutExerciseUncheckedCreateInput) {
    return prisma.workoutExercise.create({ data });
  },

  getWorkoutExercise(athleteId: string, id: string) {
    return prisma.workoutExercise.findFirst({
      where: { id, athleteId },
      include: { session: true, sets: true },
    });
  },

  async updateWorkoutExercise(
    athleteId: string,
    id: string,
    data: Prisma.WorkoutExerciseUncheckedUpdateInput
  ) {
    const r = await prisma.workoutExercise.updateMany({ where: { id, athleteId }, data });
    return r.count;
  },

  async maxSortOrder(sessionId: string): Promise<number> {
    const r = await prisma.workoutExercise.aggregate({
      where: { sessionId },
      _max: { sortOrder: true },
    });
    return r._max.sortOrder ?? -1;
  },

  /** Every working/warm-up set for an exercise, newest first. */
  exerciseHistory(athleteId: string, exerciseId: string) {
    return prisma.exerciseEntry.findMany({
      where: { athleteId, exerciseId },
      orderBy: [{ date: "desc" }, { position: "asc" }],
    });
  },

  createSet(data: Prisma.ExerciseEntryUncheckedCreateInput) {
    return prisma.exerciseEntry.create({ data });
  },

  getSet(athleteId: string, id: string) {
    return prisma.exerciseEntry.findFirst({
      where: { id, athleteId },
      include: { session: true },
    });
  },

  async updateSet(
    athleteId: string,
    id: string,
    data: Prisma.ExerciseEntryUncheckedUpdateInput
  ) {
    const r = await prisma.exerciseEntry.updateMany({ where: { id, athleteId }, data });
    return r.count;
  },

  async deleteSet(athleteId: string, id: string) {
    const r = await prisma.exerciseEntry.deleteMany({ where: { id, athleteId } });
    return r.count;
  },

  countSessionSets(sessionId: string) {
    return prisma.exerciseEntry.count({ where: { sessionId } });
  },

  /** Remove an unfinished workout and everything logged in it. */
  async discardSession(athleteId: string, sessionId: string) {
    await prisma.$transaction([
      prisma.exerciseEntry.deleteMany({ where: { athleteId, sessionId } }),
      prisma.workoutExercise.deleteMany({ where: { athleteId, sessionId } }),
      prisma.workoutSession.deleteMany({ where: { id: sessionId, athleteId } }),
    ]);
  },

  async deleteWorkoutExercise(athleteId: string, id: string) {
    const r = await prisma.workoutExercise.deleteMany({ where: { id, athleteId } });
    return r.count;
  },

  listSessions(athleteId: string, take: number) {
    return prisma.workoutSession.findMany({
      where: { athleteId, status: { in: ["COMPLETED", "IN_PROGRESS"] } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take,
      include: {
        gymBranch: { select: { id: true, name: true } },
        entries: { include: { exercise: { select: { name: true } } } },
      },
    });
  },

  /** Completed sessions with timing/effort for analytics. */
  completedSessionsForAnalytics(athleteId: string) {
    return prisma.workoutSession.findMany({
      where: { athleteId, status: "COMPLETED" },
      select: { id: true, date: true, startedAt: true, endedAt: true, sessionRpe: true },
      orderBy: { date: "asc" },
    });
  },

  /** Completed workouts with the gym they were done at. */
  gymSessions(athleteId: string) {
    return prisma.workoutSession.findMany({
      where: { athleteId, status: "COMPLETED" },
      select: { date: true, gymBranchId: true },
      orderBy: { date: "asc" },
    });
  },

  findGymVisitOnDay(athleteId: string, gymBranchId: string, day: Date) {
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    return prisma.gymVisit.findFirst({
      where: { athleteId, gymBranchId, visitedAt: { gte: day, lt: next } },
    });
  },

  createGymVisit(data: Prisma.GymVisitUncheckedCreateInput) {
    return prisma.gymVisit.create({ data });
  },

  gymBranchExists(id: string) {
    return prisma.gymBranch.findUnique({ where: { id }, select: { id: true } });
  },
};
