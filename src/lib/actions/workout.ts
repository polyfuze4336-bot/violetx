"use server";

import { revalidatePath } from "next/cache";

import {
  workoutService,
  type ActiveWorkoutDTO,
  type LoggedSetResult,
  type WorkoutSummaryDTO,
} from "@/lib/services/workout";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type {
  FinishWorkoutInput,
  LogSetInput,
  StartWorkoutInput,
  UpdateSetInput,
} from "@/lib/workout-schemas";

function revalidateAll() {
  for (const p of [
    "/dashboard",
    "/dashboard/workout",
    "/dashboard/workouts",
    "/dashboard/progress",
    "/dashboard/strength",
    "/dashboard/records",
    "/dashboard/history",
    "/dashboard/gym",
  ]) {
    revalidatePath(p);
  }
}

export async function startWorkoutAction(
  input: StartWorkoutInput
): Promise<ActionResult<ActiveWorkoutDTO>> {
  const result = await runAction(() => workoutService.start(input));
  if (result.ok) revalidatePath("/dashboard/workout");
  return result;
}

export async function addWorkoutExerciseAction(
  exerciseId: string
): Promise<ActionResult<ActiveWorkoutDTO>> {
  return runAction(() => workoutService.addExercise(exerciseId));
}

export async function replaceWorkoutExerciseAction(
  workoutExerciseId: string,
  newExerciseId: string
): Promise<ActionResult<ActiveWorkoutDTO>> {
  return runAction(() => workoutService.replaceExercise(workoutExerciseId, newExerciseId));
}

export async function skipWorkoutExerciseAction(
  workoutExerciseId: string,
  skipped: boolean
): Promise<ActionResult> {
  return runAction(() => workoutService.setSkipped(workoutExerciseId, skipped));
}

export async function removeWorkoutExerciseAction(
  workoutExerciseId: string
): Promise<ActionResult> {
  return runAction(() => workoutService.removeExercise(workoutExerciseId));
}

export async function setWorkoutExerciseNotesAction(input: {
  workoutExerciseId: string;
  notes: string;
}): Promise<ActionResult> {
  return runAction(() => workoutService.setExerciseNotes(input));
}

export async function logSetAction(
  input: LogSetInput
): Promise<ActionResult<LoggedSetResult>> {
  return runAction(() => workoutService.logSet(input));
}

export async function updateSetAction(input: UpdateSetInput): Promise<ActionResult> {
  return runAction(() => workoutService.updateSet(input));
}

export async function deleteSetAction(setId: string): Promise<ActionResult> {
  return runAction(() => workoutService.deleteSet(setId));
}

export async function finishWorkoutAction(
  input: FinishWorkoutInput
): Promise<ActionResult<WorkoutSummaryDTO>> {
  const result = await runAction(() => workoutService.finish(input));
  if (result.ok) revalidateAll();
  return result;
}

export async function discardWorkoutAction(): Promise<ActionResult> {
  const result = await runAction(() => workoutService.discard());
  if (result.ok) revalidateAll();
  return result;
}
