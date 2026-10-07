"use server";

import { z } from "zod";

import { trainingProgressService, type AiTipsDTO } from "@/lib/services/trainingProgress";
import { runAction, type ActionResult } from "@/lib/actions/helpers";

const periodSchema = z.enum(["week", "month"]);

export async function generateAiCoachTipsAction(
  period: "week" | "month"
): Promise<ActionResult<AiTipsDTO>> {
  return runAction(() => trainingProgressService.aiTips(periodSchema.parse(period)));
}
