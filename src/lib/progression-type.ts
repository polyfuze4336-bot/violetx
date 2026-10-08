// How an exercise's logged weight should be read.
//   WEIGHTED: the weight is external load, so more weight = progression.
//   ASSISTED: the weight is the assistance given by a machine/band (assisted
//             pull-up, chin-up, dip), so LESS assistance = progression.
// Derived from existing Exercise metadata (equipment, then name) in this one
// place, so no schema change is needed and imported exercises are covered.

export type ProgressionType = "WEIGHTED" | "ASSISTED";

export const ASSISTED_EQUIPMENT = "Assisted Machine";

const ASSISTED = /\bassist(ed|ance)?\b/i;

type ExerciseMeta = { name?: string | null; equipment?: string | null } | null | undefined;

export function progressionTypeOf(exercise: ExerciseMeta): ProgressionType {
  if (!exercise) return "WEIGHTED";
  if (exercise.equipment && ASSISTED.test(exercise.equipment)) return "ASSISTED";
  // Free-text names from imports ("Dip Assisted"). Aliases are deliberately
  // ignored: "Assisted Pull-Up" is a legacy alias of the weighted Pull-Up.
  if (exercise.name && ASSISTED.test(exercise.name)) return "ASSISTED";
  return "WEIGHTED";
}

export const isAssistedExercise = (exercise: ExerciseMeta): boolean =>
  progressionTypeOf(exercise) === "ASSISTED";

/** True when `a` is a better load than `b` for this kind of exercise. */
export function isBetterLoad(a: number, b: number, assisted: boolean): boolean {
  return assisted ? a < b : a > b;
}
