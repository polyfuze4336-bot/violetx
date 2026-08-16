"use server";

import { revalidatePath } from "next/cache";

import { gymService } from "@/lib/services/gym";
import { runAction, type ActionResult } from "@/lib/actions/helpers";

export async function markGymVisitedAction(
  gymBranchId: string,
  visitedAt?: string
): Promise<ActionResult> {
  const result = await runAction(() =>
    gymService.markVisited(gymBranchId, visitedAt ? new Date(visitedAt) : undefined)
  );
  if (result.ok) revalidatePath("/dashboard/gym");
  return result;
}

export async function removeGymVisitAction(
  gymBranchId: string
): Promise<ActionResult> {
  const result = await runAction(() => gymService.removeVisit(gymBranchId));
  if (result.ok) revalidatePath("/dashboard/gym");
  return result;
}
