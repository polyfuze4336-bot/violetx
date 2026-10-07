// Pure weekly review builder. Everything shown is derived from recorded data
// for the Monday–Sunday week; recommendations are proposals, never actions.

import { resolveMuscleGroup, type TrainingSet } from "@/lib/training-analytics";

const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const day = (s: string) => s.slice(0, 10);
const add = (iso: string, days: number) => new Date(new Date(`${day(iso)}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

export function mondayOf(iso: string): string {
  const d = new Date(`${day(iso)}T00:00:00Z`);
  return add(iso, -((d.getUTCDay() + 6) % 7));
}

export interface ReviewSet extends TrainingSet {
  setType?: string | null;
}

export interface ReviewInput {
  weekStart: string;
  sets: ReviewSet[];
  prs: { date: string; exerciseName: string; type: "WEIGHT" | "REPS"; weightKg: number; reps: number; prevWeightKg: number | null; prevReps?: number | null }[];
  weights: { date: string; value: number }[];
  waistCm: { date: string; value: number }[];
  checkIns: { date: string; score: number }[];
  nutrition: { date: string; calories: number | null; protein: number | null; water: number | null }[];
  targets: { calories: number | null; protein: number | null; waterL: number | null } | null;
  plannedPerWeek: number | null;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  hasData: boolean;
  training: { workouts: number; sets: number; volumeKg: number; prevVolumeKg: number; volumeChangePct: number | null };
  strength: { prs: { exerciseName: string; label: string }[] };
  body: { weightChangeKg: number | null; waistChangeCm: number | null; latestWeightKg: number | null };
  recovery: { avgReadiness: number | null; checkIns: number };
  consistency: { done: number; planned: number };
  nutrition: { daysLogged: number; avgCalories: number | null; avgProtein: number | null; avgWaterL: number | null; targets: ReviewInput["targets"] } | null;
  observation: string;
  nextWeek: string[];
}

const LOWER = ["Quads", "Hamstrings", "Glutes & Hips", "Calves"];
const UPPER = ["Chest", "Back", "Shoulders", "Biceps", "Triceps"];

function weekSets(sets: ReviewSet[], start: string) {
  const end = add(start, 6);
  return sets.filter((s) => s.setType !== "WARMUP" && day(s.date) >= start && day(s.date) <= end);
}

const rowSets = (s: TrainingSet) => (s.sets && s.sets > 0 ? s.sets : 1);
const volume = (rows: TrainingSet[]) => rows.reduce((a, s) => a + s.reps * s.weightKg * rowSets(s), 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function regionSets(rows: TrainingSet[], names: string[]): number {
  return rows
    .filter((s) => names.includes(resolveMuscleGroup(s.exerciseName, s.muscleGroup)))
    .reduce((a, s) => a + rowSets(s), 0);
}

export function buildWeeklyReview(i: ReviewInput): WeeklyReview {
  const start = mondayOf(i.weekStart);
  const end = add(start, 6);
  const prevStart = add(start, -7);
  const inWeek = (d: string) => day(d) >= start && day(d) <= end;

  const rows = weekSets(i.sets, start);
  const prev = weekSets(i.sets, prevStart);
  const workouts = new Set(rows.map((s) => day(s.date))).size;
  const vol = Math.round(volume(rows));
  const prevVol = Math.round(volume(prev));

  const prs = i.prs.filter((p) => inWeek(p.date));
  const strengthPrs = prs.map((p) => ({
    exerciseName: p.exerciseName,
    label:
      p.type === "WEIGHT"
        ? p.prevWeightKg !== null
          ? `+${round1(p.weightKg - p.prevWeightKg)} kg (${p.weightKg} kg × ${p.reps})`
          : `${p.weightKg} kg × ${p.reps}`
        : p.prevReps != null
          ? `+${p.reps - p.prevReps} rep${p.reps - p.prevReps === 1 ? "" : "s"} at ${p.weightKg} kg (${p.prevReps} → ${p.reps})`
          : `${p.reps} reps at ${p.weightKg} kg`,
  }));

  // Body: compare the last reading in the week with the last one before it.
  const lastIn = (pts: { date: string; value: number }[]) => {
    const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
    const inW = sorted.filter((p) => inWeek(p.date));
    const before = sorted.filter((p) => day(p.date) < start);
    if (inW.length === 0) return { latest: null as number | null, change: null as number | null };
    const latest = inW[inW.length - 1].value;
    const reference = before.length ? before[before.length - 1].value : inW.length > 1 ? inW[0].value : null;
    return { latest, change: reference === null ? null : round1(latest - reference) };
  };
  const w = lastIn(i.weights);
  const waist = lastIn(i.waistCm);

  const scores = i.checkIns.filter((c) => inWeek(c.date)).map((c) => c.score);

  const planned = i.plannedPerWeek && i.plannedPerWeek > 0 ? i.plannedPerWeek : 0;

  const nutRows = i.nutrition.filter((n) => inWeek(n.date));
  const nutrition =
    nutRows.length > 0
      ? {
          daysLogged: new Set(nutRows.map((n) => day(n.date))).size,
          avgCalories: (() => { const v = avg(nutRows.map((n) => n.calories).filter((x): x is number => x !== null)); return v === null ? null : Math.round(v); })(),
          avgProtein: (() => { const v = avg(nutRows.map((n) => n.protein).filter((x): x is number => x !== null)); return v === null ? null : Math.round(v); })(),
          avgWaterL: (() => { const v = avg(nutRows.map((n) => n.water).filter((x): x is number => x !== null)); return v === null ? null : round1(v); })(),
          targets: i.targets,
        }
      : null;

  // Lower-body trend over the last three weeks (observation only).
  const lowerSeries = [add(start, -14), prevStart, start].map((s) => regionSets(weekSets(i.sets, s), LOWER));
  const upperNow = regionSets(rows, UPPER);
  const lowerNow = lowerSeries[2];
  const lowerFlat = lowerSeries.every((v) => v > 0) && Math.max(...lowerSeries) - Math.min(...lowerSeries) <= Math.max(1, Math.max(...lowerSeries) * 0.1);

  const hasData = workouts > 0 || w.latest !== null || waist.latest !== null || scores.length > 0 || nutRows.length > 0;

  // Observation (deterministic, evidence-based).
  const obs: string[] = [];
  if (planned > 0 && workouts >= planned) obs.push("Excellent consistency this week.");
  else if (workouts > 0) obs.push(`${workouts} workout${workouts === 1 ? "" : "s"} recorded this week.`);
  else obs.push("No workouts were recorded this week.");
  if (strengthPrs.length > 0) obs.push(`Strength is moving up with ${strengthPrs.length} PR${strengthPrs.length === 1 ? "" : "s"}.`);
  if (w.change !== null && w.change < 0) obs.push("Body weight is trending down.");
  else if (w.change !== null && w.change > 0) obs.push("Body weight ticked up.");
  if (lowerFlat) obs.push("Lower-body volume has been relatively flat for three weeks.");
  else if (upperNow > 0 && lowerNow < upperNow * 0.6) obs.push("Lower-body volume is noticeably lower than upper-body this week.");

  // Next week proposals.
  const next: string[] = [];
  if (planned > 0) next.push(`Aim for ${planned} sessions`);
  else if (workouts > 0) next.push(`Maintain ${Math.max(workouts, 3)} sessions`);
  else next.push("Schedule 3 sessions to get back into rhythm");
  const progressed = Array.from(new Set(prs.filter((p) => p.type === "WEIGHT").map((p) => p.exerciseName)));
  if (progressed.length > 0) next.push(`Consider progression on ${progressed.slice(0, 2).join(" and ")}`);
  if (lowerFlat || (upperNow > 0 && lowerNow < upperNow * 0.6)) next.push("Monitor lower-body volume");
  const readiness = avg(scores);
  if (readiness !== null && readiness < 65) next.push("Prioritise recovery: sleep and lighter sessions if needed");
  else if (readiness !== null) next.push("Maintain recovery habits");
  if (nutrition?.targets?.protein && nutrition.avgProtein !== null && nutrition.avgProtein < nutrition.targets.protein * 0.95) next.push("Close the protein gap");

  return {
    weekStart: start,
    weekEnd: end,
    hasData,
    training: {
      workouts,
      sets: rows.reduce((a, s) => a + rowSets(s), 0),
      volumeKg: vol,
      prevVolumeKg: prevVol,
      volumeChangePct: prevVol > 0 ? Math.round(((vol - prevVol) / prevVol) * 100) : null,
    },
    strength: { prs: strengthPrs },
    body: { weightChangeKg: w.change, waistChangeCm: waist.change, latestWeightKg: w.latest },
    recovery: { avgReadiness: readiness === null ? null : Math.round(readiness), checkIns: scores.length },
    consistency: { done: workouts, planned },
    nutrition,
    observation: obs.join(" "),
    nextWeek: next,
  };
}
