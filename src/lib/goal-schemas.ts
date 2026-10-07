import { z } from "zod";

import { GOAL_TYPES } from "@/lib/goals";
import { localDateSchema } from "@/lib/workout-schemas";

const id = z.string().min(1);
const optNote = z.string().trim().max(1024).optional().or(z.literal("").transform(() => undefined));

export const createGoalSchema = z
  .object({
    type: z.enum(GOAL_TYPES),
    title: z.string().trim().max(120).optional(),
    exerciseId: id.optional(),
    targetValue: z.coerce.number().positive("Target must be greater than 0").max(100000),
    currentValue: z.coerce.number().min(0).max(100000).optional(),
    weeklyTarget: z.coerce.number().int().min(1).max(14).optional(),
    unit: z.string().trim().max(16).optional(),
    targetDate: localDateSchema.optional(),
    notes: optNote,
  })
  .superRefine((g, ctx) => {
    if (g.type === "STRENGTH" && !g.exerciseId) {
      ctx.addIssue({ code: "custom", path: ["exerciseId"], message: "Choose an exercise" });
    }
    if (g.type === "CUSTOM" && !g.title) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Give the goal a name" });
    }
  });
export type CreateGoalInput = z.input<typeof createGoalSchema>;

export const updateGoalSchema = z.object({
  id,
  title: z.string().trim().min(1).max(120).optional(),
  targetValue: z.coerce.number().positive().max(100000).optional(),
  currentValue: z.coerce.number().min(0).max(100000).optional(),
  targetDate: localDateSchema.nullable().optional(),
  status: z.enum(["ACTIVE", "ACHIEVED", "ARCHIVED"]).optional(),
  notes: optNote,
});
export type UpdateGoalInput = z.input<typeof updateGoalSchema>;

const scale = z.coerce.number().int().min(1).max(5);
export const checkInSchema = z.object({
  date: localDateSchema,
  sleepHours: z.coerce.number().min(0).max(16),
  sleepQuality: scale,
  energy: scale,
  soreness: scale,
  stress: scale,
  motivation: scale,
  restingHr: z.coerce.number().int().min(30).max(220).optional(),
  notes: optNote,
});
export type CheckInFormInput = z.input<typeof checkInSchema>;
