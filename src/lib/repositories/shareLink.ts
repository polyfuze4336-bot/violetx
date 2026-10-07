import { prisma } from "@/lib/db";

export const shareLinkRepository = {
  list(athleteId: string) {
    return prisma.coachShareLink.findMany({
      where: { athleteId },
      orderBy: { createdAt: "desc" },
    });
  },

  async create(data: {
    athleteId: string;
    tokenHash: string;
    label: string | null;
    expiresAt: Date;
  }) {
    return prisma.coachShareLink.create({ data });
  },

  async findByTokenHash(tokenHash: string) {
    return prisma.coachShareLink.findUnique({ where: { tokenHash } });
  },

  async revoke(athleteId: string, id: string) {
    const result = await prisma.coachShareLink.updateMany({
      where: { id, athleteId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  },

  async touch(id: string) {
    await prisma.coachShareLink.update({
      where: { id },
      data: { lastViewedAt: new Date() },
    });
  },
};
