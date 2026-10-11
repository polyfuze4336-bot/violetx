// Creates an additional OWNER login with its OWN private athlete (separate data).
// It never touches an existing account and never gives access to another
// athlete's data. See scripts/create-owner-account.ts and
// .github/workflows/create-user.yml.

import type { PrismaClient } from "@prisma/client";

import { hashPassword } from "@/lib/password";
import { ROLES } from "@/lib/rbac";
import { PATIENT_LABEL } from "@/lib/constants";

export const MIN_PASSWORD_LENGTH = 12;

export type ProvisionResult = { created: true; userId: string; athleteId: string } | { created: false; reason: "EXISTS" };

export class ProvisionError extends Error {}

export async function createOwnerAccount(
  db: PrismaClient,
  input: { email: string; password: string }
): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ProvisionError("A valid email is required.");
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ProvisionError(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  // Never modify an existing account (owner, coach or demo).
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { created: false, reason: "EXISTS" };

  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: { email, name: PATIENT_LABEL, role: ROLES.OWNER, passwordHash, active: true },
    select: { id: true },
  });
  const athlete = await db.athlete.create({
    data: {
      ownerUserId: user.id,
      displayName: PATIENT_LABEL,
      defaultWeightUnit: "KG",
      defaultMeasurementUnit: "CM",
    },
    select: { id: true },
  });
  return { created: true, userId: user.id, athleteId: athlete.id };
}
