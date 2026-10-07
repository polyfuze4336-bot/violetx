// Pure nutrition intelligence: progress against configurable targets and
// descriptive weekly trends. Never invents unrecorded intake and never claims
// causation from small samples.

export interface NutritionDay {
  date: string;
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  water: number | null; // litres
}

export interface NutritionTargets {
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  waterL: number | null;
}

export interface TargetProgress {
  key: "calories" | "protein" | "carbohydrates" | "fat" | "water";
  label: string;
  unit: string;
  current: number | null;
  target: number | null;
  /** 0–100+ (can exceed 100). Null without both values. */
  pct: number | null;
}

const sum = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Totals for one day (several entries may exist) against the targets. */
export function dayProgress(entries: NutritionDay[], targets: NutritionTargets | null): TargetProgress[] {
  const totals = {
    calories: sum(entries.map((e) => e.calories)),
    protein: sum(entries.map((e) => e.protein)),
    carbohydrates: sum(entries.map((e) => e.carbohydrates)),
    fat: sum(entries.map((e) => e.fat)),
    water: sum(entries.map((e) => e.water)),
  };
  const row = (key: TargetProgress["key"], label: string, unit: string, target: number | null): TargetProgress => {
    const current = totals[key] === null ? null : round1(totals[key]!);
    return { key, label, unit, current, target, pct: current !== null && target ? Math.round((current / target) * 100) : null };
  };
  return [
    row("calories", "Calories", "kcal", targets?.calories ?? null),
    row("protein", "Protein", "g", targets?.protein ?? null),
    row("carbohydrates", "Carbs", "g", targets?.carbohydrates ?? null),
    row("fat", "Fat", "g", targets?.fat ?? null),
    row("water", "Water", "L", targets?.waterL ?? null),
  ];
}

export interface WeekPoint {
  label: string;
  daysLogged: number;
  avgCalories: number | null;
  avgProtein: number | null;
  avgWeightKg: number | null;
  workouts: number;
}

/**
 * Descriptive comparison of the earlier vs later half of the weeks that have
 * enough nutrition data (≥3 logged days). Associations only — no causation.
 */
export function nutritionObservations(weeks: WeekPoint[]): string[] {
  const usable = weeks.filter((w) => w.daysLogged >= 3 && w.avgCalories !== null);
  if (usable.length < 4) return [];
  const half = Math.floor(usable.length / 2);
  const first = usable.slice(0, half);
  const last = usable.slice(-half);
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const out: string[] = [];
  const cal1 = mean(first.map((w) => w.avgCalories));
  const cal2 = mean(last.map((w) => w.avgCalories));
  const wt1 = mean(first.map((w) => w.avgWeightKg));
  const wt2 = mean(last.map((w) => w.avgWeightKg));
  if (cal1 && cal2 && Math.abs(cal2 - cal1) / cal1 >= 0.05) {
    const pct = Math.round(Math.abs((cal2 - cal1) / cal1) * 100);
    const weight = wt1 !== null && wt2 !== null ? ` while average weight moved ${round1(wt2 - wt1) > 0 ? "+" : ""}${round1(wt2 - wt1)} kg` : "";
    out.push(`Logged calories ${cal2 < cal1 ? "fell" : "rose"} about ${pct}% in recent weeks${weight}. This is an association in your own data, not proof of cause.`);
  }
  const p1 = mean(first.map((w) => w.avgProtein));
  const p2 = mean(last.map((w) => w.avgProtein));
  const wo1 = mean(first.map((w) => w.workouts));
  const wo2 = mean(last.map((w) => w.workouts));
  if (p1 && p2 && Math.abs(p2 - p1) / p1 >= 0.08 && wo1 !== null && wo2 !== null) {
    out.push(`Average protein ${p2 > p1 ? "increased" : "decreased"} (${Math.round(p1)} → ${Math.round(p2)} g/day) while workouts per week went ${round1(wo1)} → ${round1(wo2)}.`);
  }
  return out;
}
