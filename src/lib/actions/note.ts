"use server";

import { revalidatePath } from "next/cache";

import { noteService } from "@/lib/services/note";
import { athleteService } from "@/lib/services/athlete";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { AthleteProfileDTO, NoteDTO } from "@/lib/dto";
import type {
  CreateNoteInput,
  UpdateAthleteProfileInput,
  UpdateNoteInput,
} from "@/lib/schemas";

function revalidateNotes() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notes");
}

export async function createNoteAction(
  input: CreateNoteInput
): Promise<ActionResult<NoteDTO>> {
  const result = await runAction(() => noteService.create(input));
  if (result.ok) revalidateNotes();
  return result;
}

export async function updateNoteAction(
  input: UpdateNoteInput
): Promise<ActionResult> {
  const result = await runAction(() => noteService.update(input));
  if (result.ok) revalidateNotes();
  return result;
}

export async function deleteNoteAction(id: string): Promise<ActionResult> {
  const result = await runAction(() => noteService.delete(id));
  if (result.ok) revalidateNotes();
  return result;
}

export async function updateAthleteProfileAction(
  input: UpdateAthleteProfileInput
): Promise<ActionResult<AthleteProfileDTO>> {
  const result = await runAction(() => athleteService.updateProfile(input));
  if (result.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
  }
  return result;
}
