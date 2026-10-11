"use server";

import { revalidatePath } from "next/cache";

import { feedbackService, type FeedbackDTO } from "@/lib/services/feedback";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { SubmitFeedbackInput } from "@/lib/schemas";

export async function submitFeedbackAction(input: SubmitFeedbackInput): Promise<ActionResult<FeedbackDTO>> {
  const result = await runAction(() => feedbackService.submit(input));
  if (result.ok) revalidatePath("/dashboard/feedback");
  return result;
}

export async function setFeedbackStatusAction(input: { id: string; status: string }): Promise<ActionResult> {
  const result = await runAction(() => feedbackService.setStatus(input));
  if (result.ok) revalidatePath("/dashboard/feedback");
  return result;
}
