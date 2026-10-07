// Pure goal-progress and trajectory logic. Progress always comes from recorded
// data; projections are only offered when there is enough data to be honest.

export const GOAL_TYPES = [
  "BODY_WEIGHT",
  "WAIST",
  "STRENGTH",
  "WORKOUT_FREQUENCY",
  "CONSISTENCY",
  "CUSTOM",
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export interface DatedValue {
  date: string; // ISO date or timestamp
  value: number;
}

export interface GoalSpec {
  type: GoalType;
  startValue: number | null;
  targetValue: number;
  currentValue?: number | null;
  weeklyTarget?: number | null;
  startDate: string;
  targetDate?: string | null;
}

export interface GoalData {
  /** Chronological readings for BODY_WEIGHT / WAIST / STRENGTH goals. */
  series?: DatedValue[];
  /** Distinct training days (yyyy-mm-dd) for frequency / consistency goals. */
  trainingDays?: string[];
}

export type Trajectory =
  | { kind: "insufficient" }
  | { kind: "achieved" }
  | { kind: "moving_away" }
  | { kind: "projected"; date: string; onTrack: boolean | null; ratePerWeek: number };

export interface GoalProgress {
  current: number | null;
  start: number | null;
  target: number;
  /** 0–100, clamped. */
  pct: number;
  achieved: boolean;
  trajectory: Trajectory;
  /** Frequency / consistency detail. */
  detail?: string;
}

const DAY_MS = 86_400_000;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const day = (s: string) => s.slice(0, 10);
const t = (s: string) => new Date(`${day(s)}T00:00:00Z`).getTime();

/** Monday (UTC) of the week containing the date. */
export function weekStart(iso: string): string {
  const d = new Date(`${day(iso)}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
}

/** Least-squares slope in units per day over the points, or null if unreliable. */
export function slopePerDay(points: DatedValue[]): number | null {
  if (points.length < 3) return null;
  const xs = points.map((p) => t(p.date) / DAY_MS);
  const span = Math.max(...xs) - Math.min(...xs);
  if (span < 7) return null;
  const n = points.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = points.reduce((a, p) => a + p.value, 0) / n;
  let num = 0;
  let den = 0;
  points.forEach((p, i) => {
    num += (xs[i] - mx) * (p.value - my);
    den += (xs[i] - mx) ** 2;
  });
  return den === 0 ? null : num / den;
}

function seriesProgress(spec: GoalSpec, series: DatedValue[], now: Date): GoalProgress {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1]?.value ?? null;
  const start = spec.startValue ?? sorted[0]?.value ?? null;
  const target = spec.targetValue;

  if (latest === null || start === null) {
    return { current: latest, start, target, pct: 0, achieved: false, trajectory: { kind: "insufficient" } };
  }
  const down = target < start;
  const achieved = down ? latest <= target : latest >= target;
  const total = target - start;
  const pct = achieved ? 100 : total === 0 ? 100 : clamp(((latest - start) / total) * 100);

  let trajectory: Trajectory = { kind: "insufficient" };
  if (achieved) trajectory = { kind: "achieved" };
  else {
    const recent = sorted.filter((p) => t(p.date) >= now.getTime() - 56 * DAY_MS);
    const slope = slopePerDay(recent.length >= 3 ? recent : sorted.slice(-6));
    if (slope !== null && slope !== 0) {
      const towards = down ? slope < 0 : slope > 0;
      if (!towards) trajectory = { kind: "moving_away" };
      else {
        const daysLeft = (target - latest) / slope;
        if (daysLeft > 0 && daysLeft < 365 * 5) {
          const date = new Date(now.getTime() + daysLeft * DAY_MS).toISOString().slice(0, 10);
          trajectory = {
            kind: "projected",
            date,
            ratePerWeek: round1(slope * 7),
            onTrack: spec.targetDate ? date <= day(spec.targetDate) : null,
          };
        }
      }
    }
  }
  return { current: round1(latest), start: round1(start), target, pct: Math.round(pct), achieved, trajectory };
}

function frequencyProgress(spec: GoalSpec, days: string[], now: Date): GoalProgress {
  const today = now.toISOString().slice(0, 10);
  const thisWeek = weekStart(today);
  const counts = new Map<string, number>();
  for (const d of new Set(days.map(day))) counts.set(weekStart(d), (counts.get(weekStart(d)) ?? 0) + 1);
  const current = counts.get(thisWeek) ?? 0;
  const target = spec.targetValue;

  // Average over the last four completed weeks, for a steadier trajectory.
  const prev: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const w = new Date(t(thisWeek) - i * 7 * DAY_MS).toISOString().slice(0, 10);
    prev.push(counts.get(w) ?? 0);
  }
  const avg = round1(prev.reduce((a, b) => a + b, 0) / prev.length);
  const achieved = current >= target;
  return {
    current,
    start: null,
    target,
    pct: Math.round(clamp((current / target) * 100)),
    achieved,
    trajectory: achieved ? { kind: "achieved" } : { kind: "insufficient" },
    detail: `Last 4 weeks averaged ${avg} / week`,
  };
}

function consistencyProgress(spec: GoalSpec, days: string[], now: Date): GoalProgress {
  const weeklyTarget = spec.weeklyTarget && spec.weeklyTarget > 0 ? spec.weeklyTarget : 3;
  const thisWeek = weekStart(now.toISOString());
  const counts = new Map<string, number>();
  for (const d of new Set(days.map(day))) counts.set(weekStart(d), (counts.get(weekStart(d)) ?? 0) + 1);

  // Consecutive completed weeks (ending last week) meeting the weekly target;
  // the current week counts once it has already met the target.
  let streak = (counts.get(thisWeek) ?? 0) >= weeklyTarget ? 1 : 0;
  for (let i = 1; i <= 104; i++) {
    const w = new Date(t(thisWeek) - i * 7 * DAY_MS).toISOString().slice(0, 10);
    if ((counts.get(w) ?? 0) >= weeklyTarget) streak += 1;
    else break;
  }
  const achieved = streak >= spec.targetValue;
  return {
    current: streak,
    start: 0,
    target: spec.targetValue,
    pct: Math.round(clamp((streak / spec.targetValue) * 100)),
    achieved,
    trajectory: achieved ? { kind: "achieved" } : { kind: "insufficient" },
    detail: `${weeklyTarget}+ sessions per week`,
  };
}

export function computeGoalProgress(spec: GoalSpec, data: GoalData, now: Date = new Date()): GoalProgress {
  switch (spec.type) {
    case "BODY_WEIGHT":
    case "WAIST":
    case "STRENGTH":
      return seriesProgress(spec, data.series ?? [], now);
    case "WORKOUT_FREQUENCY":
      return frequencyProgress(spec, data.trainingDays ?? [], now);
    case "CONSISTENCY":
      return consistencyProgress(spec, data.trainingDays ?? [], now);
    case "CUSTOM": {
      const current = spec.currentValue ?? spec.startValue;
      const start = spec.startValue ?? 0;
      if (current === null || current === undefined) {
        return { current: null, start, target: spec.targetValue, pct: 0, achieved: false, trajectory: { kind: "insufficient" } };
      }
      const total = spec.targetValue - start;
      const down = spec.targetValue < start;
      const achieved = down ? current <= spec.targetValue : current >= spec.targetValue;
      return {
        current,
        start,
        target: spec.targetValue,
        pct: achieved ? 100 : total === 0 ? 100 : Math.round(clamp(((current - start) / total) * 100)),
        achieved,
        trajectory: achieved ? { kind: "achieved" } : { kind: "insufficient" },
      };
    }
  }
}

export function trajectoryText(tr: Trajectory, unit: string): string {
  switch (tr.kind) {
    case "achieved":
      return "Goal reached";
    case "moving_away":
      return "Recent trend is moving away from the target";
    case "projected": {
      const when = new Date(`${tr.date}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
      const rate = `${tr.ratePerWeek > 0 ? "+" : ""}${tr.ratePerWeek}${unit ? ` ${unit}` : ""}/week`;
      const track = tr.onTrack === null ? "" : tr.onTrack ? " · on track" : " · behind target date";
      return `At ${rate} you'd reach it around ${when}${track}`;
    }
    default:
      return "Not enough data to project yet";
  }
}
