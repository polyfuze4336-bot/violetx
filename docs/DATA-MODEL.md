# Data model (VioletX V2)

All tables live in Azure SQL via Prisma (`prisma/schema.prisma`). V2 changes are **additive**
migrations `0007`–`0010`; nothing was dropped or renamed, so every historical record keeps working.

## Existing model (unchanged semantics)

| Model | Purpose |
| --- | --- |
| `User`, `PasswordResetToken` | Database-authenticated identities (OWNER / COACH). |
| `Athlete` | The single tracked athlete (always displayed as "Patient X"). |
| `BodyWeightEntry`, `MeasurementType`, `MeasurementEntry` | Body data with real `date` (not `createdAt`). |
| `Exercise`, `ExerciseEntry` | Exercise library and **sets** (`ExerciseEntry` = one performed set). |
| `WorkoutSession` | A training day (created by imports, now also by live workouts). |
| `Note`, `NutritionEntry`, `ImportBatch`, `AIAction` | Notes, nutrition, import audit trail. |
| `GymBranch`, `GymVisit` | Gym Journey (totals come from the branch table, never hardcoded). |
| `CoachShareLink` | Hashed, expiring, revocable coach links. |

## V2 additions

### Exercise library (0007)
`Exercise` gained `aliases`, `secondaryMuscles`, `movementPattern`, `instructions`, `tips`,
`isCustom`. The spec's separate `ExerciseMuscle` table was intentionally **not** created: a primary
muscle (`muscleGroup`) plus a comma list of secondary muscles is enough for every V2 feature and keeps
queries simple.

### Workout sessions (0007, 0008)
* `WorkoutSession` gained `name`, `status` (`IN_PROGRESS | COMPLETED | SKIPPED`, default `COMPLETED` so
  imported/legacy sessions stay valid), `startedAt`, `endedAt`, `gymBranchId`, `programId`, `templateId`,
  `sessionRpe`, `difficulty`. Duration is derived from start/end.
* `WorkoutExercise` — an exercise within a live workout: order, optional `supersetGroup`, notes,
  `skipped`, and **targets copied from the template** (`targetSets`, `repMin`, `repMax`, `restSec`) so
  editing a program never rewrites history.
* `ExerciseEntry` (the "WorkoutSet") gained `setType` (`WORK | WARMUP | DROP | FAILURE`), `rpe`, `rir`,
  `completedAt`, `workoutExerciseId`. A set row exists only once it is completed, so a separate
  `completed` flag was not needed.

**Backward compatibility:** `ExerciseEntry` rows without a session/RPE/type (legacy + WhatsApp imports)
behave exactly as before. Warm-up sets are excluded from PRs, volume and analytics.

### Programs (0008)
`WorkoutProgram` → `WorkoutTemplate` → `WorkoutTemplateExercise`. Programs are archived, never deleted;
templates still referenced by past sessions are archived instead of removed.

### AI audit (0008)
`AIProposalLog` records confirmed AI-assisted changes (kind, provider, model, payload, who approved).
Import proposals continue to use `ImportBatch`/`AIAction`.

### Goals & recovery (0009)
* `Goal` — type (`BODY_WEIGHT | WAIST | STRENGTH | WORKOUT_FREQUENCY | CONSISTENCY | CUSTOM`), target,
  fixed `startValue` captured at creation, optional target date. Progress is **computed**, not stored.
* `DailyCheckIn` — one per athlete per day (sleep, energy, soreness, stress, motivation, optional resting
  HR, notes). The readiness score is derived.

### Nutrition targets (0010)
Nullable `calorieTarget`, `proteinTarget`, `carbTarget`, `fatTarget`, `waterTargetL` on `Athlete`.

## Derived, not stored
Personal records, estimated 1RM (Epley), volume, readiness, goal progress, analytics, achievements and
the weekly review are all computed from recorded data so they can never drift out of sync.

## Dates
`measuredAt` / `performedAt` semantics are preserved: records keep their real date separate from
`createdAt`. "Today" is the athlete's calendar day (`APP_TIMEZONE`, default `Asia/Kuala_Lumpur`).

## Migrations
`0006` coach share link · `0007` workout engine foundation · `0008` programs + AI audit ·
`0009` goals + check-ins · `0010` nutrition targets. They run via `prisma migrate deploy` in the deploy
workflow before the new code is published.
