import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const measurementTypeRepository = {
  list(athleteId: string) {
    return prisma.measurementType.findMany({
      where: { athleteId },
      orderBy: { name: "asc" },
    });
  },

  getById(athleteId: string, id: string) {
    return prisma.measurementType.findFirst({ where: { id, athleteId } });
  },

  findByName(athleteId: string, name: string) {
    return prisma.measurementType.findFirst({
      where: { athleteId, name: { equals: name } },
    });
  },

  create(data: Prisma.MeasurementTypeUncheckedCreateInput) {
    return prisma.measurementType.create({ data });
  },

  async update(
    athleteId: string,
    id: string,
    data: Prisma.MeasurementTypeUncheckedUpdateInput
  ) {
    const result = await prisma.measurementType.updateMany({
      where: { id, athleteId },
      data,
    });
    return result.count;
  },

  countEntries(athleteId: string, typeId: string) {
    return prisma.measurementEntry.count({ where: { athleteId, typeId } });
  },

  async delete(athleteId: string, id: string) {
    const result = await prisma.measurementType.deleteMany({
      where: { id, athleteId },
    });
    return result.count;
  },
};

export const measurementEntryRepository = {
  list(athleteId: string, typeId?: string) {
    return prisma.measurementEntry.findMany({
      where: { athleteId, ...(typeId ? { typeId } : {}) },
      orderBy: { date: "asc" },
      include: { type: true },
    });
  },

  getById(athleteId: string, id: string) {
    return prisma.measurementEntry.findFirst({ where: { id, athleteId } });
  },

  create(data: Prisma.MeasurementEntryUncheckedCreateInput) {
    return prisma.measurementEntry.create({ data });
  },

  async update(
    athleteId: string,
    id: string,
    data: Prisma.MeasurementEntryUncheckedUpdateInput
  ) {
    const result = await prisma.measurementEntry.updateMany({
      where: { id, athleteId },
      data,
    });
    return result.count;
  },

  async delete(athleteId: string, id: string) {
    const result = await prisma.measurementEntry.deleteMany({
      where: { id, athleteId },
    });
    return result.count;
  },
};
