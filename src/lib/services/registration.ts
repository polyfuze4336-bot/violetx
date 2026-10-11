import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { DEMO_EMAIL } from "@/lib/demo-mode";
import { PATIENT_LABEL } from "@/lib/constants";
import { hashPassword, verifyPassword } from "@/lib/password";
import { AuthorizationError, ROLES, ValidationError } from "@/lib/rbac";
import { changePasswordSchema, registerSchema, type ChangePasswordInput, type RegisterInput } from "@/lib/schemas";

/** Sign-up is on unless it is switched off with REGISTRATION_ENABLED=false. */
export function isRegistrationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REGISTRATION_ENABLED?.trim().toLowerCase() !== "false";
}

/** New accounts per hour across the whole app: a brake on scripted sign-ups. */
const HOURLY_SIGNUP_CAP = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export const registrationService = {
  /**
   * Public sign-up. Creates an account that owns its OWN private athlete: it can
   * never see or change anyone else's data. The primary owner's email and the
   * demo account cannot be registered here.
   */
  async register(input: RegisterInput): Promise<{ email: string }> {
    if (!isRegistrationEnabled()) throw new AuthorizationError("Registration is closed at the moment.");
    const data = registerSchema.parse(input);
    // A bot filled the hidden field: pretend it worked and do nothing.
    if (data.website) return { email: data.email };

    const reserved = [process.env.OWNER_EMAIL, DEMO_EMAIL].filter(Boolean).map((e) => (e as string).trim().toLowerCase());
    if (reserved.includes(data.email)) throw new ValidationError("That email cannot be used to register.");

    const recent = await prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
    if (recent >= HOURLY_SIGNUP_CAP) throw new AuthorizationError("Registration is busy right now. Please try again in a little while.");

    if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
      throw new ValidationError("An account with this email already exists. Sign in instead.");
    }

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: { email: data.email, name: PATIENT_LABEL, role: ROLES.OWNER, passwordHash, active: true, failedLoginAttempts: 0, createdAt: new Date() },
      select: { id: true },
    });
    await prisma.athlete.create({
      data: { ownerUserId: user.id, displayName: PATIENT_LABEL, defaultWeightUnit: "KG", defaultMeasurementUnit: "CM" },
    });
    return { email: data.email };
  },

  /**
   * A signed-in user changes their own password. The current password is
   * required, wrong guesses count towards the same lock-out as sign-in, and the
   * shared demo account can never change its password.
   */
  async changePassword(input: ChangePasswordInput): Promise<void> {
    const actor = await requireAuth();
    if (actor.role === ROLES.DEMO_VIEWER) throw new AuthorizationError("Demo mode is read only.");
    const data = changePasswordSchema.parse(input);

    const user = await prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user || !user.active || !user.passwordHash) throw new AuthorizationError("This account cannot change its password.");
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AuthorizationError("Too many attempts. Please wait a few minutes and try again.");
    }

    if (!(await verifyPassword(data.currentPassword, user.passwordHash))) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null },
      });
      throw new ValidationError("Your current password is not correct.");
    }

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } }),
      // Any reset link issued before this change stops working.
      prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
  },
};
