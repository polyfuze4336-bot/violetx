// Removes everything an athlete has recorded (workouts, sets, body weight,
// measurements, nutrition, check-ins, goals, notes, gym visits, share links,
// programs, imports and exercises) while keeping the sign-in account and the
// athlete profile. Scoped to ONE athlete and to OWNER accounts only; it never
// touches another user's rows, the demo account or a coach. Used by
// scripts/wipe-account-data.ts (manual workflow only).

import type { PrismaClient } from "@prisma/client";

import { STARTER_EXERCISES, starterCreateData } from "@/lib/exercise-library";
import { ROLES } from "@/lib/rbac";

export class WipeError extends Error {}

export type WipeCounts = Record<string, number>;

export interface WipeTarget {
  userId: string;
  athleteId: string;
}

/** The OWNER account and its athlete, refusing anything else. */
export async function resolveWipeTarget(db: PrismaClient, emailRaw: string): Promise<WipeTarget> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) throw new WipeError("An email is required.");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new WipeError("No account with that email.");
  if (user.role !== ROLES.OWNER) throw new WipeError(`That account is a ${user.role}. Only OWNER accounts can be wiped.`);
  const athlete = await db.athlete.findUnique({ where: { ownerUserId: user.id } });
  if (!athlete) throw new WipeError("That account has no athlete profile.");
  return { userId: user.id, athleteId: athlete.id };
}

/** How many rows of each kind belong to the athlete (nothing is changed). */
export async function countAthleteData(db: PrismaClient, athleteId: string): Promise<WipeCounts> {
  const where = { athleteId };
  const templates = await db.workoutTemplate.findMany({ where, select: { id: true } });
  const batches = await db.importBatch.findMany({ where, select: { id: true } });
  return {
    exerciseEntries: await db.exerciseEntry.count({ where }),
    workoutSessions: await db.workoutSession.count({ where }),
    workoutExercises: await db.workoutExercise.count({ where }),
    exercises: await db.exercise.count({ where }),
    bodyWeights: await db.bodyWeightEntry.count({ where }),
    measurements: await db.measurementEntry.count({ where }),
    measurementTypes: await db.measurementType.count({ where }),
    nutrition: await db.nutritionEntry.count({ where }),
    checkIns: await db.dailyCheckIn.count({ where }),
    goals: await db.goal.count({ where }),
    notes: await db.note.count({ where }),
    gymVisits: await db.gymVisit.count({ where }),
    shareLinks: await db.coachShareLink.count({ where }),
    programs: await db.workoutProgram.count({ where }),
    templates: templates.length,
    imports: batches.length,
    aiLogs: await db.aIProposalLog.count({ where }),
  };
}

/**
 * Delete the athlete's data in one transaction (children before parents), then
 * optionally restore the canonical starter exercise library so names start clean.
 */
export async function wipeAthleteData(db: PrismaClient, athleteId: string, options: { reseedStarter?: boolean } = {}): Promise<WipeCounts> {
  const before = await countAthleteData(db, athleteId);
  const where = { athleteId };
  const templateIds = (await db.workoutTemplate.findMany({ where, select: { id: true } })).map((t) => t.id);
  const batchIds = (await db.importBatch.findMany({ where, select: { id: true } })).map((b) => b.id);

  await db.$transaction([
    db.aIAction.deleteMany({ where: { importBatchId: { in: batchIds } } }),
    db.aIProposalLog.deleteMany({ where }),
    db.dailyCheckIn.deleteMany({ where }),
    db.goal.deleteMany({ where }),
    db.gymVisit.deleteMany({ where }),
    db.nutritionEntry.deleteMany({ where }),
    db.note.deleteMany({ where }),
    db.coachShareLink.deleteMany({ where }),
    db.exerciseEntry.deleteMany({ where }),
    db.workoutExercise.deleteMany({ where }),
    db.workoutSession.deleteMany({ where }),
    db.workoutTemplateExercise.deleteMany({ where: { templateId: { in: templateIds } } }),
    db.workoutTemplate.deleteMany({ where }),
    db.workoutProgram.deleteMany({ where }),
    db.exercise.deleteMany({ where }),
    db.measurementEntry.deleteMany({ where }),
    db.measurementType.deleteMany({ where }),
    db.bodyWeightEntry.deleteMany({ where }),
    db.importBatch.deleteMany({ where }),
  ]);

  if (options.reseedStarter) {
    for (const ex of STARTER_EXERCISES) await db.exercise.create({ data: { athleteId, ...starterCreateData(ex) } });
  }
  return before;
}
