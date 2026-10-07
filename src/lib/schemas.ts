import { z } from "zod";

// Shared primitives -----------------------------------------------------------

export const unitSchema = z.enum(["CM", "INCH"]);
export type Unit = z.infer<typeof unitSchema>;

/** Where a record originated. */
export const sourceSchema = z.enum(["MANUAL", "WHATSAPP"]);
export type Source = z.infer<typeof sourceSchema>;

export const idSchema = z.string().min(1, "Required");

// Accept Date objects or ISO/date-like strings and coerce to a Date.
export const dateSchema = z.coerce.date({
  message: "A valid date is required",
});

const optionalNote = z
  .string()
  .trim()
  .max(1024)
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalLong = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const optionalShort = z
  .string()
  .trim()
  .max(60)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const EXERCISE_CATEGORIES = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Legs",
  "Glutes",
  "Core",
  "Full Body",
] as const;

// Body weight -----------------------------------------------------------------

export const createBodyWeightSchema = z.object({
  date: dateSchema,
  weightKg: z.coerce
    .number()
    .positive("Weight must be greater than 0")
    .max(1000, "Weight looks too large"),
  note: optionalNote,
});
export type CreateBodyWeightInput = z.infer<typeof createBodyWeightSchema>;

export const updateBodyWeightSchema = createBodyWeightSchema.partial().extend({
  id: idSchema,
});
export type UpdateBodyWeightInput = z.infer<typeof updateBodyWeightSchema>;

// Measurement types -----------------------------------------------------------

export const createMeasurementTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  defaultUnit: unitSchema.default("CM"),
});
export type CreateMeasurementTypeInput = z.infer<
  typeof createMeasurementTypeSchema
>;

export const updateMeasurementTypeSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(100).optional(),
  defaultUnit: unitSchema.optional(),
  active: z.coerce.boolean().optional(),
});
export type UpdateMeasurementTypeInput = z.infer<
  typeof updateMeasurementTypeSchema
>;

// Measurement entries ---------------------------------------------------------

export const createMeasurementEntrySchema = z.object({
  typeId: idSchema,
  date: dateSchema,
  value: z.coerce.number().positive("Value must be greater than 0").max(1000),
  unit: unitSchema,
  note: optionalNote,
});
export type CreateMeasurementEntryInput = z.infer<
  typeof createMeasurementEntrySchema
>;

export const updateMeasurementEntrySchema = createMeasurementEntrySchema
  .partial()
  .extend({ id: idSchema });
export type UpdateMeasurementEntryInput = z.infer<
  typeof updateMeasurementEntrySchema
>;

// Exercises -------------------------------------------------------------------

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  category: optionalShort,
  muscleGroup: optionalShort,
  equipment: optionalShort,
  aliases: optionalLong(400),
  secondaryMuscles: optionalLong(200),
  movementPattern: optionalShort,
  instructions: optionalLong(4000),
  tips: optionalLong(1000),
  active: z.coerce.boolean().default(true),
});
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const updateExerciseSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(150).optional(),
  category: optionalShort,
  muscleGroup: optionalShort,
  equipment: optionalShort,
  aliases: optionalLong(400),
  secondaryMuscles: optionalLong(200),
  movementPattern: optionalShort,
  instructions: optionalLong(4000),
  tips: optionalLong(1000),
  active: z.coerce.boolean().optional(),
});
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

// Exercise entries (sets) -----------------------------------------------------

export const createExerciseEntrySchema = z.object({
  exerciseId: idSchema,
  date: dateSchema,
  reps: z.coerce
    .number()
    .int("Reps must be a whole number")
    .min(0)
    .max(10000),
  weightKg: z.coerce.number().min(0, "Weight cannot be negative").max(2000),
  sets: z.coerce.number().int().min(1).max(100).optional(),
  sessionId: idSchema.optional(),
  position: z.coerce.number().int().min(0).default(0),
  note: optionalNote,
});
export type CreateExerciseEntryInput = z.infer<
  typeof createExerciseEntrySchema
>;

export const updateExerciseEntrySchema = createExerciseEntrySchema
  .partial()
  .extend({ id: idSchema });
export type UpdateExerciseEntryInput = z.infer<
  typeof updateExerciseEntrySchema
>;

// Notes -----------------------------------------------------------------------

export const createNoteSchema = z.object({
  date: dateSchema,
  title: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  body: z.string().trim().min(1, "Note cannot be empty").max(8000),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = createNoteSchema.partial().extend({
  id: idSchema,
});
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

// Athlete profile -------------------------------------------------------------

export const updateAthleteProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  heightCm: z.coerce.number().positive().max(300).optional(),
  birthDate: dateSchema.optional(),
  sex: z
    .string()
    .trim()
    .max(16)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  defaultMeasurementUnit: unitSchema.optional(),
  trustedAiImports: z.coerce.boolean().optional(),
});
export type UpdateAthleteProfileInput = z.infer<
  typeof updateAthleteProfileSchema
>;

// WhatsApp import -------------------------------------------------------------

export const parsedMeasurementSchema = z.object({
  name: z.string().trim().min(1),
  value: z.coerce.number().positive().max(1000),
  unit: unitSchema,
});

export const parsedExerciseSetSchema = z.object({
  exercise: z.string().trim().min(1),
  reps: z.coerce.number().int().min(0).max(10000),
  weightKg: z.coerce.number().min(0).max(2000),
});

/** How to resolve a record that duplicates an existing one. */
export const resolutionSchema = z
  .enum(["IMPORT", "SKIP", "REPLACE"])
  .default("IMPORT");
export type Resolution = z.infer<typeof resolutionSchema>;

export const findDuplicatesSchema = z.object({
  date: dateSchema,
  weightKg: z.coerce.number().positive().max(1000).optional(),
  measurements: z.array(parsedMeasurementSchema).default([]),
  sets: z.array(parsedExerciseSetSchema).default([]),
});
export type FindDuplicatesInput = z.infer<typeof findDuplicatesSchema>;

export const commitImportSchema = z.object({
  rawText: z.string().max(20000).optional(),
  date: dateSchema,
  weightKg: z.coerce.number().positive().max(1000).optional(),
  weightResolution: resolutionSchema,
  measurements: z
    .array(parsedMeasurementSchema.extend({ resolution: resolutionSchema }))
    .default([]),
  sets: z
    .array(parsedExerciseSetSchema.extend({ resolution: resolutionSchema }))
    .default([]),
});
export type CommitImportInput = z.infer<typeof commitImportSchema>;

// Authentication --------------------------------------------------------------

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

export const requestResetSchema = z.object({ email: z.string().email() });
export type RequestResetInput = z.infer<typeof requestResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const setCoachSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
});
export type SetCoachInput = z.infer<typeof setCoachSchema>;

// Nutrition -------------------------------------------------------------------

const optionalMacro = z.coerce.number().min(0).max(100000).optional();

export const createNutritionSchema = z.object({
  entryDate: dateSchema,
  calories: z.coerce.number().int().min(0).max(100000).optional(),
  protein: optionalMacro,
  carbohydrates: optionalMacro,
  fat: optionalMacro,
  fibre: optionalMacro,
  water: optionalMacro,
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type CreateNutritionInput = z.infer<typeof createNutritionSchema>;

// Coach share links ------------------------------------------------------------

export const createShareLinkSchema = z.object({
  label: z.string().trim().max(100).optional(),
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
});
export type CreateShareLinkInput = z.input<typeof createShareLinkSchema>;
