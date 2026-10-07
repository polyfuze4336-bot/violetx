"use server";

import { revalidatePath } from "next/cache";

import { goalService, type GoalDTO } from "@/lib/services/goal";
import { checkInService, type CheckInDTO } from "@/lib/services/checkin";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { CheckInFormInput, CreateGoalInput, UpdateGoalInput } from "@/lib/goal-schemas";

function revalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/goals");
  revalidatePath("/dashboard/recovery");
}

export async function createGoalAction(input: CreateGoalInput): Promise<ActionResult<GoalDTO>> {
  const result = await runAction(() => goalService.create(input));
  if (result.ok) revalidate();
  return result;
}

export async function updateGoalAction(input: UpdateGoalInput): Promise<ActionResult> {
  const result = await runAction(() => goalService.update(input));
  if (result.ok) revalidate();
  return result;
}

export async function saveCheckInAction(input: CheckInFormInput): Promise<ActionResult<CheckInDTO>> {
  const result = await runAction(() => checkInService.upsert(input));
  if (result.ok) revalidate();
  return result;
}
