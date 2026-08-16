import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const gymBranchRepository = {
  list() {
    return prisma.gymBranch.findMany({ orderBy: [{ state: "asc" }, { name: "asc" }] });
  },

  getById(id: string) {
    return prisma.gymBranch.findUnique({ where: { id } });
  },

  search(query: string) {
    return prisma.gymBranch.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { city: { contains: query } },
          { state: { contains: query } },
        ],
      },
      orderBy: { name: "asc" },
      take: 25,
    });
  },
};

export const gymVisitRepository = {
  list(athleteId: string) {
    return prisma.gymVisit.findMany({
      where: { athleteId },
      orderBy: { visitedAt: "asc" },
    });
  },

  create(data: Prisma.GymVisitUncheckedCreateInput) {
    return prisma.gymVisit.create({ data });
  },

  countForBranch(athleteId: string, gymBranchId: string) {
    return prisma.gymVisit.count({ where: { athleteId, gymBranchId } });
  },

  async deleteForBranch(athleteId: string, gymBranchId: string) {
    const result = await prisma.gymVisit.deleteMany({
      where: { athleteId, gymBranchId },
    });
    return result.count;
  },
};
