import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const noteRepository = {
  list(athleteId: string) {
    return prisma.note.findMany({
      where: { athleteId },
      orderBy: { date: "desc" },
    });
  },

  getById(athleteId: string, id: string) {
    return prisma.note.findFirst({ where: { id, athleteId } });
  },

  create(data: Prisma.NoteUncheckedCreateInput) {
    return prisma.note.create({ data });
  },

  async update(
    athleteId: string,
    id: string,
    data: Prisma.NoteUncheckedUpdateInput
  ) {
    const result = await prisma.note.updateMany({
      where: { id, athleteId },
      data,
    });
    return result.count;
  },

  async delete(athleteId: string, id: string) {
    const result = await prisma.note.deleteMany({ where: { id, athleteId } });
    return result.count;
  },
};

export const athleteRepository = {
  getById(athleteId: string) {
    return prisma.athlete.findUnique({ where: { id: athleteId } });
  },

  update(athleteId: string, data: Prisma.AthleteUncheckedUpdateInput) {
    return prisma.athlete.update({ where: { id: athleteId }, data });
  },
};
