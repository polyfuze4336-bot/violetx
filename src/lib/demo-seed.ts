// Core of the prototype demo seed (see scripts/seed-demo.ts). Kept separate
// from the CLI so the idempotency and safety rules are unit-testable.

import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { buildDemoDataset, type DemoDataset } from "@/lib/demo-data";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-mode";
import { ROLES } from "@/lib/rbac";

export const DEMO_USER_ID = "demo-user";
export const DEMO_ATHLETE_ID = "demo-athlete";
const CHUNK = 100;

type Tx = PrismaClient;

export class DemoSeedError extends Error {}

/** Delete every row that belongs to ONE athlete (scoped, never global). */
async function wipeAthlete(tx: Tx, athleteId: string) {
  const where = { athleteId };
  await tx.aIProposalLog.deleteMany({ where });
  await tx.dailyCheckIn.deleteMany({ where });
  await tx.goal.deleteMany({ where });
  await tx.gymVisit.deleteMany({ where });
  await tx.nutritionEntry.deleteMany({ where });
  await tx.note.deleteMany({ where });
  await tx.coachShareLink.deleteMany({ where });
  await tx.exerciseEntry.deleteMany({ where });
  await tx.workoutExercise.deleteMany({ where });
  await tx.workoutSession.deleteMany({ where });
  await tx.workoutTemplateExercise.deleteMany({ where: { template: { athleteId } } });
  await tx.workoutTemplate.deleteMany({ where });
  await tx.workoutProgram.deleteMany({ where });
  await tx.exercise.deleteMany({ where });
  await tx.measurementEntry.deleteMany({ where });
  await tx.measurementType.deleteMany({ where });
  await tx.bodyWeightEntry.deleteMany({ where });
}

async function insertAll(tx: Tx, data: DemoDataset) {
  const insert = async <T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
  };
  await insert(data.exercises, (d) => tx.exercise.createMany({ data: d }));
  await insert(data.measurementTypes, (d) => tx.measurementType.createMany({ data: d }));
  await insert(data.programs, (d) => tx.workoutProgram.createMany({ data: d }));
  await insert(data.templates, (d) => tx.workoutTemplate.createMany({ data: d }));
  await insert(data.templateExercises, (d) => tx.workoutTemplateExercise.createMany({ data: d }));
  await insert(data.sessions, (d) => tx.workoutSession.createMany({ data: d }));
  await insert(data.workoutExercises, (d) => tx.workoutExercise.createMany({ data: d }));
  await insert(data.sets, (d) => tx.exerciseEntry.createMany({ data: d }));
  await insert(data.bodyWeights, (d) => tx.bodyWeightEntry.createMany({ data: d }));
  await insert(data.measurements, (d) => tx.measurementEntry.createMany({ data: d }));
  await insert(data.nutrition, (d) => tx.nutritionEntry.createMany({ data: d }));
  await insert(data.checkIns, (d) => tx.dailyCheckIn.createMany({ data: d }));
  await insert(data.goals, (d) => tx.goal.createMany({ data: d }));
  await insert(data.notes, (d) => tx.note.createMany({ data: d }));
  await insert(data.gymVisits, (d) => tx.gymVisit.createMany({ data: d }));
  await insert(data.aiProposals, (d) => tx.aIProposalLog.createMany({ data: d }));
}

/** Find the demo identity, refusing to touch any non-demo account. */
async function loadDemoIdentity(db: PrismaClient) {
  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (user && user.role !== ROLES.DEMO_VIEWER) {
    throw new DemoSeedError(`${DEMO_EMAIL} exists with role ${user.role}, not ${ROLES.DEMO_VIEWER}. Refusing to modify it.`);
  }
  const athlete = user ? await db.athlete.findUnique({ where: { ownerUserId: user.id } }) : null;
  return { user, athlete };
}

/** Create or refresh the demo account and rebuild its fictional history. Idempotent. */
export async function seedDemo(db: PrismaClient, today: Date = new Date()): Promise<DemoDataset> {
  const { user, athlete } = await loadDemoIdentity(db);
  const userId = user?.id ?? DEMO_USER_ID;
  const athleteId = athlete?.id ?? DEMO_ATHLETE_ID;

  const passwordHash =
    user?.passwordHash && (await bcrypt.compare(DEMO_PASSWORD, user.passwordHash))
      ? user.passwordHash
      : await bcrypt.hash(DEMO_PASSWORD, 12);
  await db.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { role: ROLES.DEMO_VIEWER, passwordHash, active: true, failedLoginAttempts: 0, lockedUntil: null, name: "Demo" },
    create: { id: userId, email: DEMO_EMAIL, name: "Demo", role: ROLES.DEMO_VIEWER, passwordHash, active: true },
  });

  // Real gym branches (global reference data) make the Gym Journey meaningful.
  const branches = await db.gymBranch.findMany({ where: { active: true }, select: { id: true, name: true, state: true }, take: 600 });
  const data = buildDemoDataset({ athleteId, userId, branches, today });

  await db.$transaction(
    async (tx) => {
      const t = tx as unknown as Tx;
      await wipeAthlete(t, athleteId);
      const a = data.athlete;
      await t.athlete.upsert({
        where: { ownerUserId: userId },
        update: { ...a },
        create: { id: athleteId, ownerUserId: userId, ...a },
      });
      await insertAll(t, data);
    },
    { timeout: 300_000, maxWait: 30_000 }
  );
  return data;
}

/** Delete the demo account and all of its data. */
export async function removeDemo(db: PrismaClient): Promise<boolean> {
  const { user, athlete } = await loadDemoIdentity(db);
  if (!user) return false;
  await db.$transaction(
    async (tx) => {
      const t = tx as unknown as Tx;
      if (athlete) {
        await wipeAthlete(t, athlete.id);
        await t.athlete.delete({ where: { id: athlete.id } });
      }
      await t.user.delete({ where: { id: user.id } });
    },
    { timeout: 120_000, maxWait: 20_000 }
  );
  return true;
}
