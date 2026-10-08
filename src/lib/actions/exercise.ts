"use server";

import { revalidatePath } from "next/cache";

import {
  exerciseEntryService,
  exerciseService,
} from "@/lib/services/exercise";
import {
  exerciseMatchService,
  type ExerciseChoiceDTO,
  type ExerciseSuggestionDTO,
} from "@/lib/services/exerciseMatch";
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

/** Propose canonical exercises for typed/imported names (read-only). */
export async function suggestExercisesAction(
  names: string[]
): Promise<ActionResult<ExerciseSuggestionDTO[]>> {
  return runAction(() => exerciseMatchService.suggest(names));
}

export async function addStarterExerciseAction(name: string): Promise<ActionResult<ExerciseDTO>> {
  const result = await runAction(() => exerciseService.addFromStarter(name));
  if (result.ok) revalidate();
  return result;
}

export async function exerciseChoicesAction(): Promise<ActionResult<ExerciseChoiceDTO[]>> {
  return runAction(() => exerciseMatchService.choices());
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

export async function seedStarterLibraryAction(): Promise<
  ActionResult<{ created: number; skipped: number }>
> {
  const result = await runAction(() => exerciseService.seedStarterLibrary());
  if (result.ok) {
    revalidatePath("/dashboard/exercises");
    revalidatePath("/dashboard/settings");
  }
  return result;
}
