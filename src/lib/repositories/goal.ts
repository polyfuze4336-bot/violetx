import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const goalRepository = {
  list(athleteId: string, includeArchived = false) {
    return prisma.goal.findMany({
      where: { athleteId, ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  },
  getById(athleteId: string, id: string) {
    return prisma.goal.findFirst({ where: { id, athleteId } });
  },
  create(data: Prisma.GoalUncheckedCreateInput) {
    return prisma.goal.create({ data });
  },
  async update(athleteId: string, id: string, data: Prisma.GoalUncheckedUpdateInput) {
    const r = await prisma.goal.updateMany({ where: { id, athleteId }, data });
    return r.count;
  },
};

export const checkInRepository = {
  list(athleteId: string, since: Date) {
    return prisma.dailyCheckIn.findMany({
      where: { athleteId, date: { gte: since } },
      orderBy: { date: "asc" },
    });
  },
  getByDate(athleteId: string, date: Date) {
    return prisma.dailyCheckIn.findUnique({ where: { athleteId_date: { athleteId, date } } });
  },
  upsert(athleteId: string, date: Date, data: Omit<Prisma.DailyCheckInUncheckedCreateInput, "athleteId" | "date">) {
    return prisma.dailyCheckIn.upsert({
      where: { athleteId_date: { athleteId, date } },
      create: { athleteId, date, ...data },
      update: data,
    });
  },
};
