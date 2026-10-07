"use server";

import { revalidatePath } from "next/cache";

import { shareLinkService, type CreatedShareLinkDTO } from "@/lib/services/shareLink";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { CreateShareLinkInput } from "@/lib/schemas";

export async function createShareLinkAction(
  input: CreateShareLinkInput
): Promise<ActionResult<CreatedShareLinkDTO>> {
  const result = await runAction(() => shareLinkService.create(input));
  if (result.ok) revalidatePath("/dashboard/settings");
  return result;
}

export async function revokeShareLinkAction(id: string): Promise<ActionResult> {
  const result = await runAction(() => shareLinkService.revoke(id));
  if (result.ok) revalidatePath("/dashboard/settings");
  return result;
}
