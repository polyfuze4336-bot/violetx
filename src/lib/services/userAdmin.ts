import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { AuthorizationError, ROLES } from "@/lib/rbac";
import { setCoachSchema, type SetCoachInput } from "@/lib/schemas";

export interface CoachInfo {
  email: string;
  active: boolean;
  lastLoginAt: string | null;
}

/**
 * Coach accounts are global (a coach reads the athlete of OWNER_EMAIL), so only
 * that primary owner may see or change them. Any other OWNER account has its own
 * private athlete and must never reach the primary owner's coach.
 */
export function isPrimaryOwner(email: string | null | undefined): boolean {
  const primary = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(primary && email && email.trim().toLowerCase() === primary);
}

export const userAdminService = {
  /** Whether the signed-in owner may manage the coach account. */
  async canManageCoach(): Promise<boolean> {
    const actor = await requireOwner();
    return isPrimaryOwner(actor.email);
  },

  /** Owner-only: view the configured coach account, if any. */
  async getCoach(): Promise<CoachInfo | null> {
    const actor = await requireOwner();
    if (!isPrimaryOwner(actor.email)) return null;
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
    const actor = await requireOwner();
    if (!isPrimaryOwner(actor.email)) {
      throw new AuthorizationError("Only the primary owner can manage coach access.");
    }
    const data = setCoachSchema.parse(input);
    const email = data.email.trim().toLowerCase();
    // Never repurpose (or demote) an existing owner or demo account.
    const existing = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    if (existing && existing.role !== ROLES.COACH) {
      throw new AuthorizationError("That account cannot be used as a coach.");
    }
    const passwordHash = await hashPassword(data.password);

    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: ROLES.COACH, active: true },
      create: { email, passwordHash, role: ROLES.COACH, name: "Coach" },
    });
  },
};
