"use server";

import { revalidatePath } from "next/cache";

import { bodyWeightService } from "@/lib/services/bodyWeight";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { BodyWeightDTO } from "@/lib/dto";
import type {
  CreateBodyWeightInput,
  UpdateBodyWeightInput,
} from "@/lib/schemas";

function revalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/weight");
}

export async function createBodyWeightAction(
  input: CreateBodyWeightInput
): Promise<ActionResult<BodyWeightDTO>> {
  const result = await runAction(() => bodyWeightService.create(input));
  if (result.ok) revalidate();
  return result;
}

export async function updateBodyWeightAction(
  input: UpdateBodyWeightInput
): Promise<ActionResult> {
  const result = await runAction(() => bodyWeightService.update(input));
  if (result.ok) revalidate();
  return result;
}

export async function deleteBodyWeightAction(
  id: string
): Promise<ActionResult> {
  const result = await runAction(() => bodyWeightService.delete(id));
  if (result.ok) revalidate();
  return result;
}
