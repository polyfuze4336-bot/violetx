import { requireAuth, requireOwner, requireOwnerOrDemo, type AuthContext } from "@/lib/auth";
import { NotFoundError } from "@/lib/rbac";

export interface AthleteContext {
  actor: AuthContext;
  athleteId: string;
}

/**
 * Require an OWNER with an active athlete. Used for all write operations.
 * Enforced at the service boundary so coaches can never mutate data.
 */
export async function requireOwnerAthlete(): Promise<AthleteContext> {
  const actor = await requireOwner();
  if (!actor.athleteId) {
    throw new NotFoundError("No athlete profile is configured.");
  }
  return { actor, athleteId: actor.athleteId };
}

/**
 * READ-ONLY owner-style access (owner or demo viewer) with an active athlete.
 * Only for methods that never write, e.g. asking Violet a question.
 */
export async function requireOwnerOrDemoAthlete(): Promise<AthleteContext> {
  const actor = await requireOwnerOrDemo();
  if (!actor.athleteId) {
    throw new NotFoundError("No athlete profile is configured.");
  }
  return { actor, athleteId: actor.athleteId };
}

/**
 * Require any authenticated user (OWNER or COACH) with an active athlete.
 * Used for read operations.
 */
export async function requireViewerAthlete(): Promise<AthleteContext> {
  const actor = await requireAuth();
  if (!actor.athleteId) {
    throw new NotFoundError("No athlete data is available yet.");
  }
  return { actor, athleteId: actor.athleteId };
}
