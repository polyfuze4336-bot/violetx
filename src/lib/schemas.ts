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
  /**
   * The user's confirmed choice from the exercise-name review ("id:<id>" or
   * "starter:<name>"). Validated server-side; absent means exact-match-or-custom.
   */
  exerciseRef: z.string().max(200).optional(),
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

/**
 * What a WhatsApp import represents. PARTIAL is the default when a caller does
 * not say: missing exercises are unknown, never "skipped", so an unlabelled
 * import must not look like a completed workout.
 */
export const importTypeSchema = z.enum(["PR_UPDATE", "PARTIAL", "FULL"]).default("PARTIAL");

export const assessImportSchema = z.object({
  date: dateSchema,
  sets: z
    .array(
      parsedExerciseSetSchema.extend({
        prClaim: z.boolean().optional(),
        /** The exercise name still waits for the user's confirmation. */
        unresolved: z.boolean().optional(),
      })
    )
    .max(500)
    .default([]),
});
export type AssessImportInput = z.input<typeof assessImportSchema>;

export const commitImportSchema = z.object({
  rawText: z.string().max(20000).optional(),
  importType: importTypeSchema,
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
export type CommitImportInput = z.input<typeof commitImportSchema>;

// Registration and password change -----------------------------------------------

const COMMON_PASSWORDS = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwerty123", "iloveyou", "violetx", "violetx123", "letmein123"]);

/** New passwords: 10+ characters, a letter and a number, not trivially common. */
export const newPasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "That password is too long.")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include at least one letter and one number.")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "That password is too common.");

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
    password: newPasswordSchema,
    confirmPassword: z.string(),
    /** Honeypot: real people never fill this in. */
    website: z.string().max(200).optional(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." })
  .refine((d) => d.password.toLowerCase() !== d.email, { path: ["password"], message: "The password cannot be your email." });
export type RegisterInput = z.input<typeof registerSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." })
  .refine((d) => d.newPassword !== d.currentPassword, { path: ["newPassword"], message: "Choose a password you have not used just now." });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

// Feedback -------------------------------------------------------------------

export const FEEDBACK_KINDS = ["BUG", "FEATURE"] as const;
export const FEEDBACK_STATUSES = ["OPEN", "PLANNED", "DONE", "DECLINED"] as const;

export const submitFeedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  title: z.string().trim().min(3, "Add a short title.").max(120),
  details: z.string().trim().min(10, "Describe it in at least a sentence.").max(2000),
  /** Where it happened. Only an in-app path is kept; query strings are dropped. */
  page: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((p) => {
      if (!p || !p.startsWith("/") || p.startsWith("//")) return undefined;
      return p.split("?")[0].split("#")[0];
    }),
});
export type SubmitFeedbackInput = z.input<typeof submitFeedbackSchema>;

export const setFeedbackStatusSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(FEEDBACK_STATUSES),
});

// Authentication --------------------------------------------------------------

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

export const requestResetSchema = z.object({ email: z.string().email() });
export type RequestResetInput = z.infer<typeof requestResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: newPasswordSchema,
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
  /** Days until expiry (1-365), or "never". */
  expiresInDays: z
    .union([z.literal("never"), z.coerce.number().int().min(1).max(365)])
    .default(30),
});
export type CreateShareLinkInput = z.input<typeof createShareLinkSchema>;

// Nutrition targets -----------------------------------------------------------

const optionalTarget = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().positive().max(max).optional()
  );

export const nutritionTargetsSchema = z.object({
  calories: optionalTarget(20000).transform((v) => (v === undefined ? undefined : Math.round(v))),
  protein: optionalTarget(1000).transform((v) => (v === undefined ? undefined : Math.round(v))),
  carbohydrates: optionalTarget(2000).transform((v) => (v === undefined ? undefined : Math.round(v))),
  fat: optionalTarget(1000).transform((v) => (v === undefined ? undefined : Math.round(v))),
  waterL: optionalTarget(20),
});
export type NutritionTargetsInput = z.input<typeof nutritionTargetsSchema>;
