// Rep gains get their own blue so they read differently from load PRs.

/** Filled badge classes for a PR type (rep PRs blue, everything else the brand gradient). */
export function prBadgeClass(type: string): string {
  return type === "REPS" ? "bg-rep text-white" : "bg-brand-gradient text-white";
}

/** Icon / text colour for a PR type. */
export function prIconClass(type: string): string {
  return type === "REPS" ? "text-rep" : "text-primary";
}
