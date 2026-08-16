"use server";

import { revalidatePath } from "next/cache";

import {
  exerciseEntryService,
  exerciseService,
} from "@/lib/services/exercise";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { ExerciseDTO, ExerciseEntryDTO } from "@/lib/dto";
import type {
  CreateExerciseEntryInput,
  CreateExerciseInput,
  UpdateExerciseEntryInput,
  UpdateExerciseInput,
} from "@/lib/schemas";

function revalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/strength");
  revalidatePath("/dashboard/records");
  revalidatePath("/dashboard/settings");
}

export async function createExerciseAction(
  input: CreateExerciseInput
): Promise<ActionResult<ExerciseDTO>> {
  const result = await runAction(() => exerciseService.create(input));
  if (result.ok) revalidate();
  return result;
}

export async function updateExerciseAction(
  input: UpdateExerciseInput
): Promise<ActionResult> {
  const result = await runAction(() => exerciseService.update(input));
  if (result.ok) revalidate();
  return result;
}

export async function deleteExerciseAction(id: string): Promise<ActionResult> {
  const result = await runAction(() => exerciseService.delete(id));
  if (result.ok) revalidate();
  return result;
}

export async function createExerciseEntryAction(
  input: CreateExerciseEntryInput
): Promise<ActionResult<ExerciseEntryDTO>> {
  const result = await runAction(() => exerciseEntryService.create(input));
  if (result.ok) revalidate();
  return result;
}

export async function updateExerciseEntryAction(
  input: UpdateExerciseEntryInput
): Promise<ActionResult> {
  const result = await runAction(() => exerciseEntryService.update(input));
  if (result.ok) revalidate();
  return result;
}

export async function deleteExerciseEntryAction(
  id: string
): Promise<ActionResult> {
  const result = await runAction(() => exerciseEntryService.delete(id));
  if (result.ok) revalidate();
  return result;
}
