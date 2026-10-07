import { z } from "zod";

const id = z.string().min(1, "Required");
const note = z.string().trim().max(1024).optional().or(z.literal("").transform(() => undefined));

export const SET_TYPES = ["WORK", "WARMUP", "DROP", "FAILURE"] as const;
export type SetType = (typeof SET_TYPES)[number];

/** yyyy-mm-dd from the athlete's device, so "today" is the athlete's day. */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .transform((v) => new Date(`${v}T00:00:00.000Z`));

export const startWorkoutSchema = z.object({
  date: localDateSchema,
  name: z.string().trim().max(120).optional(),
  templateId: id.optional(),
  gymBranchId: id.optional(),
  exerciseIds: z.array(id).max(30).default([]),
});
export type StartWorkoutInput = z.input<typeof startWorkoutSchema>;

export const logSetSchema = z.object({
  workoutExerciseId: id,
  weightKg: z.coerce.number().min(0, "Weight cannot be negative").max(2000),
  reps: z.coerce.number().int("Reps must be a whole number").min(1, "Enter at least 1 rep").max(1000),
  rpe: z.coerce.number().min(1).max(10).optional(),
  rir: z.coerce.number().int().min(0).max(10).optional(),
  setType: z.enum(SET_TYPES).default("WORK"),
});
export type LogSetInput = z.input<typeof logSetSchema>;

export const updateSetSchema = z.object({
  setId: id,
  weightKg: z.coerce.number().min(0).max(2000).optional(),
  reps: z.coerce.number().int().min(1).max(1000).optional(),
  rpe: z.coerce.number().min(1).max(10).nullable().optional(),
  rir: z.coerce.number().int().min(0).max(10).nullable().optional(),
  setType: z.enum(SET_TYPES).optional(),
});
export type UpdateSetInput = z.input<typeof updateSetSchema>;

export const finishWorkoutSchema = z.object({
  sessionRpe: z.coerce.number().int().min(1).max(10).optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  note,
  gymBranchId: id.optional(),
  name: z.string().trim().max(120).optional(),
});
export type FinishWorkoutInput = z.input<typeof finishWorkoutSchema>;

export const workoutExerciseNotesSchema = z.object({
  workoutExerciseId: id,
  notes: z.string().trim().max(1024),
});
