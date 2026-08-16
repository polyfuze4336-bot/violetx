"use server";

import { revalidatePath } from "next/cache";

import { nutritionService } from "@/lib/services/nutrition";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { CreateNutritionInput } from "@/lib/schemas";

export async function createNutritionAction(
  input: CreateNutritionInput
): Promise<ActionResult> {
  const result = await runAction(() => nutritionService.create(input));
  if (result.ok) revalidatePath("/dashboard/nutrition");
  return result;
}

export async function deleteNutritionAction(
  id: string
): Promise<ActionResult> {
  const result = await runAction(() => nutritionService.delete(id));
  if (result.ok) revalidatePath("/dashboard/nutrition");
  return result;
}
