import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const bodyWeightRepository = {
  list(athleteId: string) {
    return prisma.bodyWeightEntry.findMany({
      where: { athleteId },
      orderBy: { date: "asc" },
    });
  },

  latest(athleteId: string) {
    return prisma.bodyWeightEntry.findFirst({
      where: { athleteId },
      orderBy: { date: "desc" },
    });
  },

  getById(athleteId: string, id: string) {
    return prisma.bodyWeightEntry.findFirst({ where: { id, athleteId } });
  },

  create(data: Prisma.BodyWeightEntryUncheckedCreateInput) {
    return prisma.bodyWeightEntry.create({ data });
  },

  async update(
    athleteId: string,
    id: string,
    data: Prisma.BodyWeightEntryUncheckedUpdateInput
  ) {
    const result = await prisma.bodyWeightEntry.updateMany({
      where: { id, athleteId },
      data,
    });
    return result.count;
  },

  async delete(athleteId: string, id: string) {
    const result = await prisma.bodyWeightEntry.deleteMany({
      where: { id, athleteId },
    });
    return result.count;
  },
};
