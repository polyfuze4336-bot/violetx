"use server";

import { revalidatePath } from "next/cache";

import { measurementService } from "@/lib/services/measurement";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { MeasurementEntryDTO, MeasurementTypeDTO } from "@/lib/dto";
import type {
  CreateMeasurementEntryInput,
  CreateMeasurementTypeInput,
  UpdateMeasurementEntryInput,
  UpdateMeasurementTypeInput,
} from "@/lib/schemas";

function revalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/measurements");
  revalidatePath("/dashboard/settings");
}

export async function createMeasurementTypeAction(
  input: CreateMeasurementTypeInput
): Promise<ActionResult<MeasurementTypeDTO>> {
  const result = await runAction(() => measurementService.createType(input));
  if (result.ok) revalidate();
  return result;
}

export async function updateMeasurementTypeAction(
  input: UpdateMeasurementTypeInput
): Promise<ActionResult> {
  const result = await runAction(() => measurementService.updateType(input));
  if (result.ok) revalidate();
  return result;
}

export async function deleteMeasurementTypeAction(
  id: string
): Promise<ActionResult> {
  const result = await runAction(() => measurementService.deleteType(id));
  if (result.ok) revalidate();
  return result;
}

export async function createMeasurementEntryAction(
  input: CreateMeasurementEntryInput
): Promise<ActionResult<MeasurementEntryDTO>> {
  const result = await runAction(() => measurementService.createEntry(input));
  if (result.ok) revalidate();
  return result;
}

export async function updateMeasurementEntryAction(
  input: UpdateMeasurementEntryInput
): Promise<ActionResult> {
  const result = await runAction(() => measurementService.updateEntry(input));
  if (result.ok) revalidate();
  return result;
}

export async function deleteMeasurementEntryAction(
  id: string
): Promise<ActionResult> {
  const result = await runAction(() => measurementService.deleteEntry(id));
  if (result.ok) revalidate();
  return result;
}
