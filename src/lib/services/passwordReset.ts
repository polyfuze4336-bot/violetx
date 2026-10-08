import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ROLES } from "@/lib/rbac";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface RequestResetResult {
  // In non-production, the caller may surface the link since no email is wired.
  devToken?: string;
}

export const passwordResetService = {
  /**
   * Create a reset token for the email if a matching active user exists. Always
   * returns without revealing whether the email exists (no user enumeration).
   */
  async requestReset(emailRaw: string): Promise<RequestResetResult> {
    const email = emailRaw.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    // The shared demo account's password can never be changed.
    if (!user || !user.active || user.role === ROLES.DEMO_VIEWER) return {};

    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    return process.env.NODE_ENV !== "production" ? { devToken: token } : {};
  },

  /** Consume a valid token and set a new password hash. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new Error("This reset link is invalid or has expired.");
    }

    const target = await prisma.user.findUnique({ where: { id: record.userId } });
    if (target?.role === ROLES.DEMO_VIEWER) {
      throw new Error("This reset link is invalid or has expired.");
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
  },
};
