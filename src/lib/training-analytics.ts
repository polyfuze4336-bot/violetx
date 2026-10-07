// Pure training-progress analytics (weekly / monthly) and rule-based
// hypertrophy coaching tips. No IO so it stays unit-testable. Dates are ISO
// strings; all bucketing uses the UTC calendar date (entries are stored as the
// athlete's calendar day at UTC midnight).

export type Period = "week" | "month";

export interface TrainingSet {
  /** ISO timestamp or yyyy-mm-dd. */
  date: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  reps: number;
  weightKg: number;
  /** Number of sets this row represents (null = 1). */
  sets: number | null;
}

export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Quads",
  "Hamstrings",
  "Glutes & Hips",
  "Calves",
  "Core",
  "Other",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

// Order matters: more specific patterns first ("leg curl" before "curl").
const MUSCLE_RULES: [MuscleGroup, RegExp][] = [
  ["Triceps", /tricep|pushdown|push-down|skull|close[- ]grip|kickback/],
  ["Hamstrings", /leg curl|hamstring|romanian|rdl|stiff[- ]leg|good morning/],
  ["Biceps", /bicep|curl|preacher|hammer/],
  ["Shoulders", /shoulder|overhead|\bohp\b|military|lateral raise|front raise|rear delt|face pull|arnold|upright row|shrug/],
  ["Back", /\brow\b|rows\b|pull[- ]?down|pull[- ]?up|chin[- ]?up|\blat\b|deadlift|back ext|hyperext/],
  ["Chest", /bench|chest|\bpec|\bfly\b|flye|push[- ]?up|\bdip|incline|decline|crossover/],
  ["Quads", /squat|leg press|leg extension|lunge|hack|step[- ]?up|quad/],
  ["Calves", /calf|calves/],
  ["Glutes & Hips", /glute|hip|bridge|abduct|adduct/],
  ["Core", /crunch|plank|\babs?\b|sit[- ]?up|leg raise|core|russian twist|woodchop/],
];

/** Use the exercise's own muscle group when set, else infer from the name. */
export function resolveMuscleGroup(
  name: string,
  muscleGroup: string | null | undefined
): MuscleGroup {
  const explicit = muscleGroup?.trim().toLowerCase();
  if (explicit) {
    const hit = MUSCLE_GROUPS.find((g) => g.toLowerCase() === explicit);
    if (hit) return hit;
    const inferredFromLabel = inferMuscleGroup(explicit);
    if (inferredFromLabel !== "Other") return inferredFromLabel;
  }
  return inferMuscleGroup(name);
}

export function inferMuscleGroup(name: string): MuscleGroup {
  const n = name.toLowerCase();
  for (const [group, re] of MUSCLE_RULES) if (re.test(n)) return group;
  return "Other";
}

/** Epley estimated one-rep max: weight * (1 + reps / 30). Never an actual 1RM. */
export function epley(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

// --- Date helpers (UTC calendar dates as yyyy-mm-dd) -------------------------

const DAY_MS = 86_400_000;

export function isoDay(date: string | Date): string {
  return (typeof date === "string" ? date : date.toISOString()).slice(0, 10);
}

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First day of the week (Monday) or month containing the date. */
export function periodStart(iso: string, period: Period): string {
  const d = toUtc(isoDay(iso));
  if (period === "month") {
    return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  }
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  return fmt(new Date(d.getTime() - offset * DAY_MS));
}

export function addPeriods(start: string, period: Period, n: number): string {
  const d = toUtc(start);
  if (period === "month") {
    return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
  }
  return fmt(new Date(d.getTime() + n * 7 * DAY_MS));
}

function periodDays(start: string, period: Period): number {
  if (period === "week") return 7;
  const d = toUtc(start);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodLabel(start: string, period: Period): string {
  const d = toUtc(start);
  return period === "month"
    ? `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`
    : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// --- Period summaries --------------------------------------------------------

export interface PeriodSummary {
  key: string;
  label: string;
  sessions: number;
  sets: number;
  reps: number;
  volumeKg: number;
  setsByMuscle: Partial<Record<MuscleGroup, number>>;
  isCurrent: boolean;
}

function rowSets(s: TrainingSet): number {
  return s.sets && s.sets > 0 ? s.sets : 1;
}

/** Summaries for the last `count` periods ending with the one containing `now`. */
export function summarizePeriods(
  rows: TrainingSet[],
  period: Period,
  count: number,
  now: Date = new Date()
): PeriodSummary[] {
  const currentStart = periodStart(fmt(now), period);
  const starts: string[] = [];
  for (let i = count - 1; i >= 0; i--) starts.push(addPeriods(currentStart, period, -i));

  const map = new Map<string, PeriodSummary & { days: Set<string> }>();
  for (const key of starts) {
    map.set(key, {
      key,
      label: periodLabel(key, period),
      sessions: 0,
      sets: 0,
      reps: 0,
      volumeKg: 0,
      setsByMuscle: {},
      isCurrent: key === currentStart,
      days: new Set(),
    });
  }

  for (const r of rows) {
    const day = isoDay(r.date);
    const p = map.get(periodStart(day, period));
    if (!p) continue;
    const n = rowSets(r);
    const muscle = resolveMuscleGroup(r.exerciseName, r.muscleGroup);
    p.days.add(day);
    p.sets += n;
    p.reps += r.reps * n;
    p.volumeKg += r.reps * r.weightKg * n;
    p.setsByMuscle[muscle] = (p.setsByMuscle[muscle] ?? 0) + n;
  }

  return starts.map((k) => {
    const { days, ...rest } = map.get(k)!;
    return { ...rest, sessions: days.size, volumeKg: Math.round(rest.volumeKg) };
  });
}

/** Number of days a period spans, for averaging to a weekly rate. */
export function weeksInPeriod(key: string, period: Period): number {
  return periodDays(key, period) / 7;
}

// --- Exercise progression ----------------------------------------------------

export type ExerciseStatus = "progressing" | "stalled" | "regressing" | "new" | "inactive";

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  sessions: number;
  totalSets: number;
  firstE1rm: number;
  latestE1rm: number;
  bestE1rm: number;
  changePct: number | null;
  lastPerformed: string;
  status: ExerciseStatus;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeExercises(
  rows: TrainingSet[],
  now: Date = new Date()
): ExerciseProgress[] {
  const byExercise = new Map<string, TrainingSet[]>();
  for (const r of rows) {
    const list = byExercise.get(r.exerciseId) ?? [];
    list.push(r);
    byExercise.set(r.exerciseId, list);
  }

  const out: ExerciseProgress[] = [];
  for (const [exerciseId, list] of Array.from(byExercise.entries())) {
    const perDay = new Map<string, number>();
    let totalSets = 0;
    for (const r of list) {
      const day = isoDay(r.date);
      perDay.set(day, Math.max(perDay.get(day) ?? 0, epley(r.weightKg, r.reps)));
      totalSets += rowSets(r);
    }
    const days = Array.from(perDay.keys()).sort();
    const values = days.map((d) => perDay.get(d)!);
    const first = values[0];
    const latest = values[values.length - 1];
    const best = Math.max(...values);
    const lastPerformed = days[days.length - 1];

    let status: ExerciseStatus = "new";
    const idleDays = (now.getTime() - toUtc(lastPerformed).getTime()) / DAY_MS;
    if (idleDays > 21) {
      status = "inactive";
    } else if (values.length >= 4) {
      const recent = Math.max(...values.slice(-3));
      const prior = Math.max(...values.slice(0, -3));
      if (recent > prior * 1.0075) status = "progressing";
      else if (recent < prior * 0.95) status = "regressing";
      else status = "stalled";
    }

    out.push({
      exerciseId,
      name: list[0].exerciseName,
      muscleGroup: resolveMuscleGroup(list[0].exerciseName, list[0].muscleGroup),
      sessions: days.length,
      totalSets,
      firstE1rm: round1(first),
      latestE1rm: round1(latest),
      bestE1rm: round1(best),
      changePct: days.length > 1 && first > 0 ? round1(((latest - first) / first) * 100) : null,
      lastPerformed,
      status,
    });
  }
  return out.sort((a, b) => b.totalSets - a.totalSets);
}

// --- Rolling 4-week view used for coaching ----------------------------------

export interface RollingWindow {
  days: number;
  sessionsPerWeek: number;
  weeklySetsByMuscle: Partial<Record<MuscleGroup, number>>;
  /** Distinct training days per muscle per week. */
  weeklyDaysByMuscle: Partial<Record<MuscleGroup, number>>;
  repRangeShare: { low: number; moderate: number; high: number };
  totalSets: number;
}

export function rollingWindow(
  rows: TrainingSet[],
  now: Date = new Date(),
  days = 28
): RollingWindow {
  const end = toUtc(fmt(now)).getTime();
  const start = end - (days - 1) * DAY_MS;
  const weeks = days / 7;
  const sessionDays = new Set<string>();
  const muscleSets: Partial<Record<MuscleGroup, number>> = {};
  const muscleDays: Partial<Record<MuscleGroup, Set<string>>> = {};
  let low = 0;
  let moderate = 0;
  let high = 0;
  let total = 0;

  for (const r of rows) {
    const day = isoDay(r.date);
    const t = toUtc(day).getTime();
    if (t < start || t > end) continue;
    const n = rowSets(r);
    const muscle = resolveMuscleGroup(r.exerciseName, r.muscleGroup);
    sessionDays.add(day);
    muscleSets[muscle] = (muscleSets[muscle] ?? 0) + n;
    (muscleDays[muscle] ??= new Set()).add(day);
    total += n;
    if (r.reps <= 5) low += n;
    else if (r.reps <= 15) moderate += n;
    else high += n;
  }

  const weeklySetsByMuscle: RollingWindow["weeklySetsByMuscle"] = {};
  const weeklyDaysByMuscle: RollingWindow["weeklyDaysByMuscle"] = {};
  for (const g of MUSCLE_GROUPS) {
    if (muscleSets[g]) weeklySetsByMuscle[g] = round1(muscleSets[g]! / weeks);
    if (muscleDays[g]) weeklyDaysByMuscle[g] = round1(muscleDays[g]!.size / weeks);
  }
  const share = (n: number) => (total ? n / total : 0);
  return {
    days,
    sessionsPerWeek: round1(sessionDays.size / weeks),
    weeklySetsByMuscle,
    weeklyDaysByMuscle,
    repRangeShare: { low: share(low), moderate: share(moderate), high: share(high) },
    totalSets: total,
  };
}

// --- Rule-based coaching tips -----------------------------------------------

export type TipCategory =
  | "volume"
  | "frequency"
  | "progression"
  | "recovery"
  | "consistency"
  | "balance"
  | "nutrition"
  | "motivation";

export interface CoachTip {
  category: TipCategory;
  title: string;
  detail: string;
  /** 1 = act on first, 3 = nice to know. */
  priority: 1 | 2 | 3;
}

export const HYPERTROPHY_SETS_MIN = 10;
export const HYPERTROPHY_SETS_MAX = 20;
const MAJOR_GROUPS: MuscleGroup[] = ["Chest", "Back", "Shoulders", "Quads", "Hamstrings", "Glutes & Hips"];

export function buildRuleBasedTips(input: {
  weeks: PeriodSummary[]; // weekly summaries, ascending, last one is current week
  window: RollingWindow;
  exercises: ExerciseProgress[];
  lastTrainingDate: string | null;
  now?: Date;
}): CoachTip[] {
  const { weeks, window, exercises, lastTrainingDate } = input;
  const now = input.now ?? new Date();
  const tips: CoachTip[] = [];

  if (!lastTrainingDate || window.totalSets === 0) {
    return [
      {
        category: "consistency",
        priority: 1,
        title: "Get the first sessions logged",
        detail:
          "No training was recorded in the last 4 weeks. Log (or import) your workouts so progress, volume and personal records can be tracked, then aim for 3 sessions per week to start.",
      },
    ];
  }

  const idle = Math.floor((toUtc(fmt(now)).getTime() - toUtc(isoDay(lastTrainingDate)).getTime()) / DAY_MS);
  if (idle >= 7) {
    tips.push({
      category: "consistency",
      priority: 1,
      title: `Back to the gym — ${idle} days since the last session`,
      detail:
        "Consistency drives hypertrophy more than any single workout. Ease back in with 2–3 full-body sessions at about 80% of your previous loads before progressing again.",
    });
  }

  if (window.sessionsPerWeek < 2) {
    tips.push({
      category: "frequency",
      priority: 1,
      title: "Train at least 3 times per week",
      detail: `You averaged ${window.sessionsPerWeek} sessions/week over the last 4 weeks. Muscle growth responds best to training each muscle about twice weekly — a full-body or upper/lower split across 3–4 sessions is a simple way to get there.`,
    });
  } else if (window.sessionsPerWeek >= 6) {
    tips.push({
      category: "recovery",
      priority: 2,
      title: "Schedule recovery days",
      detail: `${window.sessionsPerWeek} sessions/week leaves little recovery. Keep at least 1–2 rest days, sleep 7–9 hours, and plan a lighter deload week every 4–8 weeks.`,
    });
  }

  // Weekly sets per muscle group vs the 10–20 hypertrophy range.
  for (const g of MAJOR_GROUPS) {
    const sets = window.weeklySetsByMuscle[g] ?? 0;
    if (sets === 0) {
      tips.push({
        category: "balance",
        priority: 2,
        title: `${g} not trained in 4 weeks`,
        detail: `No ${g.toLowerCase()} work was logged recently. For balanced development and joint health, include 10–16 hard sets per week for each major muscle group.`,
      });
    } else if (sets < HYPERTROPHY_SETS_MIN) {
      tips.push({
        category: "volume",
        priority: 1,
        title: `${g}: add ${Math.ceil(HYPERTROPHY_SETS_MIN - sets)}–${Math.ceil(HYPERTROPHY_SETS_MIN - sets) + 2} weekly sets`,
        detail: `${g} averages ${sets} sets/week. Research-backed hypertrophy volume is roughly ${HYPERTROPHY_SETS_MIN}–${HYPERTROPHY_SETS_MAX} hard sets per muscle per week — add 2–4 sets per session, taken close to failure (1–3 reps in reserve).`,
      });
    } else if (sets > HYPERTROPHY_SETS_MAX + 2) {
      tips.push({
        category: "volume",
        priority: 2,
        title: `${g}: volume is high (${sets} sets/week)`,
        detail: `Above ~${HYPERTROPHY_SETS_MAX} sets/week returns diminish and recovery suffers. Hold volume steady, focus on adding load or reps, and cut sets if soreness or performance drops.`,
      });
    }
  }

  // Frequency: lots of volume squeezed into one weekly session.
  for (const g of MAJOR_GROUPS) {
    const sets = window.weeklySetsByMuscle[g] ?? 0;
    const daysPerWeek = window.weeklyDaysByMuscle[g] ?? 0;
    if (sets >= 8 && daysPerWeek <= 1.25) {
      tips.push({
        category: "frequency",
        priority: 2,
        title: `Hit ${g} twice a week`,
        detail: `${g} is trained about once weekly. Splitting the same sets across two sessions lets you train each set harder and stimulates growth more often.`,
      });
    }
  }

  // Week-over-week volume trend (last two complete weeks).
  const complete = weeks.filter((w) => !w.isCurrent);
  if (complete.length >= 2) {
    const [prev, last] = [complete[complete.length - 2], complete[complete.length - 1]];
    if (prev.volumeKg > 0 && last.volumeKg > prev.volumeKg * 1.3) {
      tips.push({
        category: "recovery",
        priority: 2,
        title: "Training volume jumped sharply",
        detail: `Last week's volume was ${Math.round((last.volumeKg / prev.volumeKg - 1) * 100)}% higher than the week before. Keep weekly increases under ~10–20% to limit injury risk and plan a deload if you feel run down.`,
      });
    } else if (prev.volumeKg > 0 && last.volumeKg < prev.volumeKg * 0.6) {
      tips.push({
        category: "consistency",
        priority: 3,
        title: "Volume dipped last week",
        detail:
          "Training volume fell noticeably versus the week before. If it wasn't a planned deload, aim to rebuild gradually back to your usual sets per muscle.",
      });
    }
  }

  // Stalled lifts → progressive overload.
  const stalled = exercises.filter((e) => e.status === "stalled" || e.status === "regressing").slice(0, 3);
  for (const e of stalled) {
    tips.push({
      category: "progression",
      priority: 1,
      title: `${e.name}: break the plateau`,
      detail: `Estimated strength has not improved over the last 3 sessions (${e.latestE1rm} kg est. vs ${e.bestE1rm} kg best). Use double progression: stay at the same weight until you hit the top of your rep range (e.g. 12) on all sets, then add 2.5–5% load and drop back to ~8 reps. Check sleep, protein and total weekly sets too.`,
    });
  }

  // Rep ranges.
  if (window.totalSets >= 20) {
    const { low, high } = window.repRangeShare;
    if (low > 0.5) {
      tips.push({
        category: "volume",
        priority: 3,
        title: "Mix in higher-rep work",
        detail: "Most sets are heavy (1–5 reps). Strength is great, but hypertrophy is efficient at 6–15 reps near failure — use that range for accessory lifts.",
      });
    } else if (high > 0.5) {
      tips.push({
        category: "progression",
        priority: 3,
        title: "Add some heavier sets",
        detail: "Most sets are above 15 reps. Higher reps can build muscle but are tough to progress; use 6–12 reps on main lifts and progress the load.",
      });
    }
  }

  // Push / pull balance.
  const sets = window.weeklySetsByMuscle;
  const push = (sets.Chest ?? 0) + (sets.Shoulders ?? 0) + (sets.Triceps ?? 0);
  const pull = (sets.Back ?? 0) + (sets.Biceps ?? 0);
  if (push > 0 && pull > 0 && push / pull > 1.5) {
    tips.push({
      category: "balance",
      priority: 2,
      title: "Add more pulling",
      detail: `Pushing (${round1(push)} sets/wk) outweighs pulling (${round1(pull)}). Add rows, pull-downs and rear-delt work — a ~1:1 ratio supports shoulder health and posture.`,
    });
  }

  const progressing = exercises.filter((e) => e.status === "progressing");
  if (progressing.length > 0) {
    const names = progressing.slice(0, 3).map((e) => e.name).join(", ");
    tips.push({
      category: "motivation",
      priority: 3,
      title: "Strength is trending up",
      detail: `${names} ${progressing.length > 1 ? "are" : "is"} progressing — keep the plan and keep logging every session.`,
    });
  }

  tips.push({
    category: "nutrition",
    priority: 3,
    title: "Fuel growth",
    detail:
      "For muscle gain, aim for roughly 1.6–2.2 g protein per kg body weight daily, a small calorie surplus, and 7–9 hours of sleep. This is general guidance, not medical advice.",
  });

  return tips.sort((a, b) => a.priority - b.priority).slice(0, 8);
}
