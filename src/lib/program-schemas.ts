import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const PROGRAM_TYPES = ["PPL", "UPPER_LOWER", "FULL_BODY", "CUSTOM"] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const programExerciseSchema = z
  .object({
    exerciseId: z.string().min(1).optional(),
    exerciseName: text(150).min(1, "Exercise name is required"),
    targetSets: z.coerce.number().int().min(1).max(10).default(3),
    repMin: z.coerce.number().int().min(1).max(50).default(8),
    repMax: z.coerce.number().int().min(1).max(100).default(12),
    restSec: z.coerce.number().int().min(15).max(600).nullish(),
    notes: text(512).optional(),
  })
  .refine((e) => e.repMax >= e.repMin, {
    message: "Max reps must be at least min reps",
    path: ["repMax"],
  });
export type ProgramExerciseInput = z.input<typeof programExerciseSchema>;

export const programTemplateSchema = z.object({
  id: z.string().min(1).optional(),
  name: text(120).min(1, "Day name is required"),
  weekday: z.coerce.number().int().min(0).max(6).nullish(),
  notes: text(1024).optional(),
  exercises: z.array(programExerciseSchema).min(1, "Add at least one exercise").max(15),
});

export const programSchema = z.object({
  id: z.string().min(1).optional(),
  name: text(120).min(1, "Program name is required"),
  programType: z.enum(PROGRAM_TYPES).default("CUSTOM"),
  description: text(1024).optional(),
  templates: z.array(programTemplateSchema).min(1, "Add at least one workout day").max(7),
});
export type ProgramInput = z.input<typeof programSchema>;
export type ParsedProgram = z.output<typeof programSchema>;

/** Shape the AI must return — validated before the athlete ever sees it. */
export const programProposalSchema = z.object({
  summary: text(600).min(1),
  program: programSchema,
});
export type ProgramProposal = z.output<typeof programProposalSchema>;
