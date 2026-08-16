import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const exerciseRepository = {
  list(athleteId: string) {
    return prisma.exercise.findMany({
      where: { athleteId },
      orderBy: { name: "asc" },
    });
  },

  getById(athleteId: string, id: string) {
    return prisma.exercise.findFirst({ where: { id, athleteId } });
  },

  findByName(athleteId: string, name: string) {
    return prisma.exercise.findFirst({
      where: { athleteId, name: { equals: name } },
    });
  },

  create(data: Prisma.ExerciseUncheckedCreateInput) {
    return prisma.exercise.create({ data });
  },

  async update(
    athleteId: string,
    id: string,
    data: Prisma.ExerciseUncheckedUpdateInput
  ) {
    const result = await prisma.exercise.updateMany({
      where: { id, athleteId },
      data,
    });
    return result.count;
  },

  countEntries(athleteId: string, exerciseId: string) {
    return prisma.exerciseEntry.count({ where: { athleteId, exerciseId } });
  },

  async delete(athleteId: string, id: string) {
    const result = await prisma.exercise.deleteMany({
      where: { id, athleteId },
    });
    return result.count;
  },
};

export const exerciseEntryRepository = {
  list(
    athleteId: string,
    options?: { exerciseId?: string; take?: number }
  ) {
    return prisma.exerciseEntry.findMany({
      where: {
        athleteId,
        ...(options?.exerciseId ? { exerciseId: options.exerciseId } : {}),
      },
      orderBy: [{ date: "desc" }, { position: "asc" }],
      take: options?.take,
      include: { exercise: true },
    });
  },

  listForExercise(athleteId: string, exerciseId: string) {
    return prisma.exerciseEntry.findMany({
      where: { athleteId, exerciseId },
      orderBy: [{ date: "asc" }, { position: "asc" }],
    });
  },

  getById(athleteId: string, id: string) {
    return prisma.exerciseEntry.findFirst({ where: { id, athleteId } });
  },

  create(data: Prisma.ExerciseEntryUncheckedCreateInput) {
    return prisma.exerciseEntry.create({ data });
  },

  async update(
    athleteId: string,
    id: string,
    data: Prisma.ExerciseEntryUncheckedUpdateInput
  ) {
    const result = await prisma.exerciseEntry.updateMany({
      where: { id, athleteId },
      data,
    });
    return result.count;
  },

  async delete(athleteId: string, id: string) {
    const result = await prisma.exerciseEntry.deleteMany({
      where: { id, athleteId },
    });
    return result.count;
  },
};
