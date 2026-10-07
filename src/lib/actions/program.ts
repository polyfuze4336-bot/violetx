"use server";

import { revalidatePath } from "next/cache";

import {
  programService,
  type ProgramDTO,
  type ProgramProposalDTO,
} from "@/lib/services/program";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { ProgramInput } from "@/lib/program-schemas";

function revalidate() {
  revalidatePath("/dashboard/programs");
  revalidatePath("/dashboard/workout");
  revalidatePath("/dashboard");
}

export async function createProgramAction(input: ProgramInput): Promise<ActionResult<ProgramDTO>> {
  const result = await runAction(() => programService.create(input));
  if (result.ok) revalidate();
  return result;
}

export async function updateProgramAction(input: ProgramInput): Promise<ActionResult<ProgramDTO>> {
  const result = await runAction(() => programService.update(input));
  if (result.ok) revalidate();
  return result;
}

export async function duplicateProgramAction(id: string): Promise<ActionResult<ProgramDTO>> {
  const result = await runAction(() => programService.duplicate(id));
  if (result.ok) revalidate();
  return result;
}

export async function archiveProgramAction(id: string, archived: boolean): Promise<ActionResult> {
  const result = await runAction(() => programService.setArchived(id, archived));
  if (result.ok) revalidate();
  return result;
}

export async function setActiveProgramAction(id: string): Promise<ActionResult> {
  const result = await runAction(() => programService.setActive(id));
  if (result.ok) revalidate();
  return result;
}

/** Proposal only — nothing is saved by this action. */
export async function proposeProgramAction(
  request: string,
  days?: number
): Promise<ActionResult<ProgramProposalDTO>> {
  return runAction(() => programService.propose(request, days));
}

export async function confirmProposalAction(
  input: ProgramInput,
  source: "ai" | "rules"
): Promise<ActionResult<ProgramDTO>> {
  const result = await runAction(() => programService.confirmProposal(input, source));
  if (result.ok) revalidate();
  return result;
}
