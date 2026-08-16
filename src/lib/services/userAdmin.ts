import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { ROLES } from "@/lib/rbac";
import { setCoachSchema, type SetCoachInput } from "@/lib/schemas";

export interface CoachInfo {
  email: string;
  active: boolean;
  lastLoginAt: string | null;
}

export const userAdminService = {
  /** Owner-only: view the configured coach account, if any. */
  async getCoach(): Promise<CoachInfo | null> {
    await requireOwner();
    const coach = await prisma.user.findFirst({
      where: { role: ROLES.COACH },
      orderBy: { createdAt: "asc" },
    });
    if (!coach) return null;
    return {
      email: coach.email,
      active: coach.active,
      lastLoginAt: coach.lastLoginAt?.toISOString() ?? null,
    };
  },

  /** Owner-only: create or update the coach's credentials (read-only account). */
  async setCoach(input: SetCoachInput): Promise<void> {
    await requireOwner();
    const data = setCoachSchema.parse(input);
    const email = data.email.trim().toLowerCase();
    const passwordHash = await hashPassword(data.password);

    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: ROLES.COACH, active: true },
      create: { email, passwordHash, role: ROLES.COACH, name: "Coach" },
    });
  },
};
