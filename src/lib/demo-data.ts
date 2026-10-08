// Deterministic, fictional demo dataset for the prototype showcase account.
// Pure (no IO): the seed script turns it into rows, and tests inspect it
// directly. Nothing here is real; all values are invented.
//
// Shape of the story (about 20 weeks): a 6-week full-body starter block, then
// an Upper/Lower program. Body weight drifts down with normal noise and one
// holiday bump, waist shrinks, strength rises through the milestones below,
// adherence varies week to week and recovery dips twice.

import type { Prisma } from "@prisma/client";

import { STARTER_EXERCISES, starterCreateData } from "@/lib/exercise-library";

export const DEMO_WEEKS = 20;
const DAY_MS = 86_400_000;

// --- Deterministic randomness -----------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, step: number) => Math.round(n / step) * step;
const r1 = (n: number) => Math.round(n * 10) / 10;

// --- Featured progressions (taken from the showcase brief) --------------------

export interface Milestone {
  weightKg: number;
  /** Reps of the top set the first time this load/rep target is reached. */
  reps: number;
}

export const BENCH_MILESTONES: Milestone[] = [
  { weightKg: 70, reps: 8 },
  { weightKg: 72.5, reps: 8 },
  { weightKg: 75, reps: 8 },
  { weightKg: 75, reps: 10 },
  { weightKg: 77.5, reps: 8 },
  { weightKg: 80, reps: 8 },
];

/** Weights are ASSISTANCE: lower is stronger. */
export const CHIN_MILESTONES: Milestone[] = [
  { weightKg: 45, reps: 8 },
  { weightKg: 40, reps: 8 },
  { weightKg: 40, reps: 10 },
  { weightKg: 35, reps: 8 },
  { weightKg: 30, reps: 8 },
  { weightKg: 25, reps: 10 },
];

export const SQUAT_MILESTONES: Milestone[] = [
  { weightKg: 80, reps: 8 },
  { weightKg: 85, reps: 8 },
  { weightKg: 90, reps: 6 },
  { weightKg: 90, reps: 8 },
  { weightKg: 95, reps: 6 },
];

// --- Exercises and programs ---------------------------------------------------

interface LiftSpec {
  name: string;
  kind: "milestones" | "double";
  milestones?: Milestone[];
  start?: number;
  end?: number;
  step?: number;
  /** Rep-range floor for this lift. */
  repBase?: number;
  sets: number;
  warmups?: boolean;
  restSec: number;
}

const LIFTS: Record<string, LiftSpec> = {
  "Back Squat": { name: "Back Squat", kind: "milestones", milestones: SQUAT_MILESTONES, sets: 3, warmups: true, restSec: 150 },
  "Barbell Bench Press": { name: "Barbell Bench Press", kind: "milestones", milestones: BENCH_MILESTONES, sets: 3, warmups: true, restSec: 120 },
  "Assisted Chin-Up": { name: "Assisted Chin-Up", kind: "milestones", milestones: CHIN_MILESTONES, sets: 3, restSec: 120 },
  "Barbell Row": { name: "Barbell Row", kind: "double", start: 55, end: 72.5, step: 2.5, sets: 3, restSec: 120 },
  "Overhead Press": { name: "Overhead Press", kind: "double", start: 35, end: 47.5, step: 2.5, sets: 3, restSec: 120 },
  "Romanian Deadlift": { name: "Romanian Deadlift", kind: "double", start: 70, end: 100, step: 5, sets: 3, restSec: 150 },
  "Lat Pulldown": { name: "Lat Pulldown", kind: "double", start: 45, end: 62.5, step: 2.5, sets: 3, restSec: 90 },
  "Triceps Pushdown": { name: "Triceps Pushdown", kind: "double", start: 22.5, end: 35, step: 2.5, repBase: 10, sets: 3, restSec: 75 },
  "Leg Press": { name: "Leg Press", kind: "double", start: 100, end: 160, step: 10, sets: 3, restSec: 120 },
  "Leg Curl": { name: "Leg Curl", kind: "double", start: 30, end: 45, step: 2.5, repBase: 10, sets: 3, restSec: 75 },
  "Standing Calf Raise": { name: "Standing Calf Raise", kind: "double", start: 40, end: 60, step: 5, repBase: 12, sets: 3, restSec: 60 },
  "Incline Dumbbell Press": { name: "Incline Dumbbell Press", kind: "double", start: 20, end: 28, step: 2, sets: 3, restSec: 90 },
  "Seated Cable Row": { name: "Seated Cable Row", kind: "double", start: 45, end: 62.5, step: 2.5, repBase: 10, sets: 3, restSec: 90 },
  "Lateral Raise": { name: "Lateral Raise", kind: "double", start: 8, end: 12, step: 1, repBase: 12, sets: 3, restSec: 60 },
  "Dumbbell Curl": { name: "Dumbbell Curl", kind: "double", start: 10, end: 15, step: 1, repBase: 10, sets: 3, restSec: 60 },
  "Hip Thrust": { name: "Hip Thrust", kind: "double", start: 60, end: 100, step: 10, sets: 3, restSec: 120 },
};

type TemplateKey = "FB_A" | "FB_B" | "UP_A" | "LO_A" | "UP_B" | "LO_B";

const TEMPLATES: Record<TemplateKey, { name: string; program: "FULL" | "UL"; exercises: string[] }> = {
  FB_A: { name: "Full Body A", program: "FULL", exercises: ["Back Squat", "Barbell Bench Press", "Barbell Row", "Lateral Raise"] },
  FB_B: { name: "Full Body B", program: "FULL", exercises: ["Romanian Deadlift", "Overhead Press", "Assisted Chin-Up", "Dumbbell Curl"] },
  UP_A: { name: "Upper A", program: "UL", exercises: ["Barbell Bench Press", "Barbell Row", "Overhead Press", "Lat Pulldown", "Triceps Pushdown"] },
  LO_A: { name: "Lower A", program: "UL", exercises: ["Back Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Standing Calf Raise"] },
  UP_B: { name: "Upper B", program: "UL", exercises: ["Assisted Chin-Up", "Incline Dumbbell Press", "Seated Cable Row", "Lateral Raise", "Dumbbell Curl"] },
  LO_B: { name: "Lower B", program: "UL", exercises: ["Leg Press", "Hip Thrust", "Leg Curl", "Standing Calf Raise"] },
};

/** Share of planned sessions actually trained, per week (real life: varies). */
const WEEK_ADHERENCE = [1, 1, 0.67, 1, 1, 1, 1, 0.75, 1, 1, 0.5, 1, 1, 0.75, 1, 1, 0.75, 1, 1, 1];

// --- Dataset ------------------------------------------------------------------

export interface DemoBranch {
  id: string;
  name: string;
  state: string;
}

export interface DemoDataset {
  athlete: {
    displayName: string;
    heightCm: number;
    birthDate: Date;
    sex: string;
    calorieTarget: number;
    proteinTarget: number;
    carbTarget: number;
    fatTarget: number;
    waterTargetL: number;
  };
  measurementTypes: Prisma.MeasurementTypeCreateManyInput[];
  exercises: Prisma.ExerciseCreateManyInput[];
  programs: Prisma.WorkoutProgramCreateManyInput[];
  templates: Prisma.WorkoutTemplateCreateManyInput[];
  templateExercises: Prisma.WorkoutTemplateExerciseCreateManyInput[];
  sessions: Prisma.WorkoutSessionCreateManyInput[];
  workoutExercises: Prisma.WorkoutExerciseCreateManyInput[];
  sets: Prisma.ExerciseEntryCreateManyInput[];
  bodyWeights: Prisma.BodyWeightEntryCreateManyInput[];
  measurements: Prisma.MeasurementEntryCreateManyInput[];
  nutrition: Prisma.NutritionEntryCreateManyInput[];
  checkIns: Prisma.DailyCheckInCreateManyInput[];
  goals: Prisma.GoalCreateManyInput[];
  notes: Prisma.NoteCreateManyInput[];
  gymVisits: Prisma.GymVisitCreateManyInput[];
  aiProposals: Prisma.AIProposalLogCreateManyInput[];
}

export interface DemoOptions {
  athleteId: string;
  userId: string;
  branches: DemoBranch[];
  /** The last calendar day of history (the demo "today"). */
  today: Date;
}

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const mondayOf = (d: Date) => addDays(d, -((d.getUTCDay() + 6) % 7));

/** Pick the milestone for the k-th of n occurrences (later milestones get fewer sessions). */
function milestoneFor(k: number, n: number, count: number): { index: number; first: boolean } {
  // Boundaries spread the milestones across the history, with the final one lasting a few sessions.
  const p = n <= 1 ? 1 : k / (n - 1);
  const index = Math.min(count - 1, Math.floor(p * (count - 0.4)));
  const prev = k === 0 ? -1 : Math.min(count - 1, Math.floor(((k - 1) / (n - 1)) * (count - 0.4)));
  return { index, first: index !== prev };
}

function milestoneSets(m: Milestone, first: boolean, count: number): number[] {
  // First time at a target: top set then slightly fewer reps. After that: solid straight sets.
  const sets = first && m.reps > 8 ? [m.reps, m.reps - 1, m.reps - 2] : first ? [m.reps, m.reps, Math.max(m.reps - 1, 5)] : Array(count).fill(m.reps);
  return sets.slice(0, count);
}

export function buildDemoDataset(opts: DemoOptions): DemoDataset {
  const { athleteId, userId, branches } = opts;
  const today = utcDay(opts.today);
  const rand = mulberry32(20261008);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 0.58; // ~N(0,1)
  const id = (kind: string, n: number | string) => `demo-${kind}-${n}`;

  const start = mondayOf(addDays(today, -(DEMO_WEEKS * 7 - 1)));
  const totalDays = Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1;
  const t = (day: number) => day / Math.max(1, totalDays - 1);

  // ----- Exercises (canonical starter library data) -----
  const starterByName = new Map(STARTER_EXERCISES.map((e) => [e.name, e]));
  const exerciseId = (name: string) => id("ex", name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const exercises: DemoDataset["exercises"] = Object.keys(LIFTS).map((name) => {
    const starter = starterByName.get(name);
    if (!starter) throw new Error(`Demo exercise "${name}" is not in the starter library`);
    return { id: exerciseId(name), athleteId, ...starterCreateData(starter) };
  });

  // ----- Programs / templates -----
  const programs: DemoDataset["programs"] = [
    { id: id("prog", "full"), athleteId, name: "Full Body Starter", programType: "FULL_BODY", description: "Three full-body days a week to build the habit and a base.", isActive: false, archived: true, source: "MANUAL", createdAt: start },
    { id: id("prog", "ul"), athleteId, name: "Upper / Lower", programType: "UPPER_LOWER", description: "Four days a week: upper and lower body, each twice.", isActive: true, archived: false, source: "AI", createdAt: addDays(start, 6 * 7) },
  ];
  const templates: DemoDataset["templates"] = [];
  const templateExercises: DemoDataset["templateExercises"] = [];
  (Object.keys(TEMPLATES) as TemplateKey[]).forEach((key, ti) => {
    const tpl = TEMPLATES[key];
    templates.push({ id: id("tpl", key), programId: id("prog", tpl.program === "FULL" ? "full" : "ul"), athleteId, name: tpl.name, dayOrder: ti, createdAt: start });
    tpl.exercises.forEach((name, i) => {
      const lift = LIFTS[name];
      templateExercises.push({
        id: id("tplex", `${key}-${i}`),
        templateId: id("tpl", key),
        exerciseId: exerciseId(name),
        sortOrder: i,
        targetSets: lift.sets,
        repMin: lift.repBase ?? 8,
        repMax: (lift.repBase ?? 8) + 2,
        restSec: lift.restSec,
      });
    });
  });

  // ----- Planned sessions (adherence varies; one light holiday week) -----
  const planned: { date: Date; key: TemplateKey }[] = [];
  // Cover every week up to and including the current (possibly partial) one.
  const weekCount = Math.floor((today.getTime() - start.getTime()) / (7 * DAY_MS)) + 1;
  for (let w = 0; w < weekCount; w++) {
    const monday = addDays(start, w * 7);
    const days: [number, TemplateKey][] =
      w < 6
        ? [[0, w % 2 === 0 ? "FB_A" : "FB_B"], [2, w % 2 === 0 ? "FB_B" : "FB_A"], [4, w % 2 === 0 ? "FB_A" : "FB_B"]]
        : [[0, "UP_A"], [1, "LO_A"], [3, "UP_B"], [4, "LO_B"]];
    for (const [offset, key] of days) {
      const date = addDays(monday, offset);
      if (date.getTime() > today.getTime()) continue;
      planned.push({ date, key });
    }
  }
  // Keep sessions by weekly adherence, but never skip a lift's first or last occurrence.
  const kept = planned.filter((p, i) => {
    const w = Math.floor((p.date.getTime() - start.getTime()) / (7 * DAY_MS));
    const weekIdx = Math.min(WEEK_ADHERENCE.length - 1, w);
    const protectedSlot = i < 3 || i >= planned.length - 3;
    return protectedSlot || rand() < WEEK_ADHERENCE[weekIdx];
  });

  // Occurrence counts per lift so milestone progress is spread over real sessions.
  const occurrences = new Map<string, number>();
  for (const p of kept) for (const name of TEMPLATES[p.key].exercises) occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
  const seen = new Map<string, number>();

  // ----- Gym branches -----
  const sortedBranches = [...branches].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  const picked: DemoBranch[] = [];
  if (sortedBranches.length > 0) {
    const stride = Math.max(1, Math.floor(sortedBranches.length / 9));
    for (let i = 0; i < sortedBranches.length && picked.length < 9; i += stride) picked.push(sortedBranches[i]);
  }
  const home = picked[0] ?? null;

  const sessions: DemoDataset["sessions"] = [];
  const workoutExercises: DemoDataset["workoutExercises"] = [];
  const sets: DemoDataset["sets"] = [];
  const gymVisits: DemoDataset["gymVisits"] = [];
  const visitedOn = new Set<string>();
  let setN = 0;
  let weN = 0;

  kept.forEach((p, si) => {
    const tpl = TEMPLATES[p.key];
    const sessionId = id("ses", si);
    const startedAt = new Date(p.date.getTime() + (17 + Math.floor(rand() * 3)) * 3_600_000 + Math.floor(rand() * 4) * 900_000);
    const durationMin = 52 + Math.floor(rand() * 26);
    const endedAt = new Date(startedAt.getTime() + durationMin * 60_000);
    // Always consume both rolls so the rest of the data is identical with or without branches.
    const travelRoll = rand();
    const pickRoll = rand();
    const travel = picked.length > 1 && travelRoll < 0.12;
    const branch = travel ? picked[1 + Math.floor(pickRoll * (picked.length - 1))] : home;
    sessions.push({
      id: sessionId,
      athleteId,
      date: p.date,
      name: tpl.name,
      status: "COMPLETED",
      startedAt,
      endedAt,
      gymBranchId: branch?.id ?? null,
      programId: id("prog", tpl.program === "FULL" ? "full" : "ul"),
      templateId: id("tpl", p.key),
      sessionRpe: 6 + Math.floor(rand() * 4),
      difficulty: 2 + Math.floor(rand() * 3),
      note: rand() < 0.1 ? ["Felt strong today.", "Short on sleep, kept it moderate.", "Great pump, good session."][Math.floor(rand() * 3)] : null,
      createdAt: endedAt,
    });
    if (branch) {
      const key = `${branch.id}|${p.date.toISOString().slice(0, 10)}`;
      if (!visitedOn.has(key)) {
        visitedOn.add(key);
        gymVisits.push({ id: id("visit", gymVisits.length), athleteId, gymBranchId: branch.id, visitedAt: p.date, source: "WORKOUT" });
      }
    }

    let position = 0;
    tpl.exercises.forEach((name, order) => {
      const lift = LIFTS[name];
      const k = seen.get(name) ?? 0;
      seen.set(name, k + 1);
      const n = occurrences.get(name) ?? 1;
      const weId = id("we", weN++);
      workoutExercises.push({
        id: weId,
        athleteId,
        sessionId,
        exerciseId: exerciseId(name),
        sortOrder: order,
        targetSets: lift.sets,
        repMin: lift.repBase ?? 8,
        repMax: (lift.repBase ?? 8) + 2,
        restSec: lift.restSec,
        createdAt: startedAt,
      });

      let working: { weightKg: number; reps: number }[];
      if (lift.kind === "milestones") {
        const { index, first } = milestoneFor(k, n, lift.milestones!.length);
        const m = lift.milestones![index];
        // The very last visit adds a fourth set (a volume PR).
        const setCount = k === n - 1 ? lift.sets + 1 : lift.sets;
        working = milestoneSets(m, first, setCount).map((reps) => ({ weightKg: m.weightKg, reps }));
      } else {
        const stages = (lift.end! - lift.start!) / lift.step!;
        const progress = n <= 1 ? 1 : k / (n - 1);
        const s = progress * stages;
        const weightKg = lift.start! + Math.floor(s + 1e-9) * lift.step!;
        const frac = s - Math.floor(s);
        const topReps = (lift.repBase ?? 8) + Math.round(frac * 2);
        const badDay = rand() < 0.12 ? 1 : 0;
        const count = lift.sets + (rand() < 0.15 ? 1 : 0);
        working = Array.from({ length: count }, (_, i) => ({
          weightKg,
          reps: Math.max(5, topReps - badDay - (i === count - 1 && count > lift.sets ? 1 : 0) - (i > 0 && rand() < 0.3 ? 1 : 0)),
        }));
      }

      const rows: { weightKg: number; reps: number; setType: string }[] = [];
      if (lift.warmups) {
        const w0 = working[0].weightKg;
        rows.push({ weightKg: round(w0 * 0.5, 2.5), reps: 8, setType: "WARMUP" }, { weightKg: round(w0 * 0.75, 2.5), reps: 5, setType: "WARMUP" });
      }
      working.forEach((w) => rows.push({ ...w, setType: "WORK" }));
      rows.forEach((r, i) => {
        sets.push({
          id: id("set", setN++),
          athleteId,
          exerciseId: exerciseId(name),
          sessionId,
          workoutExerciseId: weId,
          date: p.date,
          reps: r.reps,
          weightKg: r.weightKg,
          position: position++,
          setType: r.setType,
          rpe: r.setType === "WORK" ? Math.min(9.5, 7 + (i % 3) * 0.5 + (rand() < 0.2 ? 0.5 : 0)) : null,
          completedAt: new Date(startedAt.getTime() + (order * 12 + i * 3 + 2) * 60_000),
          source: "MANUAL",
          createdAt: startedAt,
        });
      });
    });
  });

  // Travel visits: a few extra branches seen on rest days (gym exploration).
  picked.slice(2).forEach((b, i) => {
    const date = addDays(start, 10 + i * 13);
    if (date.getTime() <= today.getTime() && !visitedOn.has(`${b.id}|${date.toISOString().slice(0, 10)}`)) {
      visitedOn.add(`${b.id}|${date.toISOString().slice(0, 10)}`);
      gymVisits.push({ id: id("visit", gymVisits.length), athleteId, gymBranchId: b.id, visitedAt: date, source: "MANUAL", notes: "Visited while travelling." });
    }
  });

  // ----- Body weight: a downward trend with plateaus, noise and a holiday bump -----
  const bodyWeights: DemoDataset["bodyWeights"] = [];
  for (let d = 0; d < totalDays; d++) {
    if (rand() > 0.78) continue;
    const x = t(d);
    const trend = 86.4 - 6.6 * Math.pow(x, 0.92) + (x > 0.5 && x < 0.66 ? 0.95 * Math.sin(((x - 0.5) / 0.16) * Math.PI) : 0);
    const week = 0.3 * Math.sin((d / 7) * 2 * Math.PI) + gauss() * 0.22;
    bodyWeights.push({ id: id("bw", bodyWeights.length), athleteId, date: addDays(start, d), weightKg: r1(trend + week), source: "MANUAL", createdAt: addDays(start, d) });
  }

  // ----- Measurements (weekly, slightly irregular) -----
  const types = [
    { name: "Waist", from: 94, to: 87.4, noise: 0.35 },
    { name: "Chest", from: 103, to: 104.6, noise: 0.3 },
    { name: "Hips", from: 101, to: 98.2, noise: 0.3 },
    { name: "Thigh", from: 59, to: 60.2, noise: 0.25 },
    { name: "Upper Arm", from: 34.5, to: 36.1, noise: 0.2 },
  ];
  const measurementTypes: DemoDataset["measurementTypes"] = types.map((m) => ({ id: id("mt", m.name.toLowerCase().replace(/\s+/g, "-")), athleteId, name: m.name, defaultUnit: "CM", active: true }));
  const measurements: DemoDataset["measurements"] = [];
  for (let d = 6; d < totalDays; d += 7) {
    if (rand() < 0.1) continue;
    const date = addDays(start, Math.min(totalDays - 1, d + (rand() < 0.3 ? 1 : 0)));
    const x = t(d);
    types.forEach((m, i) => {
      const smooth = m.name === "Waist" ? Math.pow(x, 0.85) : x;
      measurements.push({
        id: id("me", measurements.length),
        athleteId,
        typeId: measurementTypes[i].id as string,
        date,
        value: r1(m.from + (m.to - m.from) * smooth + gauss() * m.noise),
        unit: "CM",
        source: "MANUAL",
        createdAt: date,
      });
    });
  }

  // ----- Nutrition -----
  const nutrition: DemoDataset["nutrition"] = [];
  for (let d = 0; d < totalDays; d++) {
    if (rand() > 0.86) continue;
    const date = addDays(start, d);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const calories = Math.round((2250 + (weekend ? 260 : 0) + gauss() * 170) / 10) * 10;
    const protein = r1(152 + rand() * 24);
    const fat = r1(62 + rand() * 18);
    const carbs = r1(Math.max(150, (calories - protein * 4 - fat * 9) / 4));
    nutrition.push({
      id: id("nu", nutrition.length),
      athleteId,
      entryDate: date,
      calories,
      protein,
      carbohydrates: carbs,
      fat,
      fibre: r1(22 + rand() * 12),
      water: r1(2.2 + rand() * 1.3),
      notes: weekend && rand() < 0.12 ? "Eating out with friends." : null,
      source: "MANUAL",
      createdAt: date,
    });
  }

  // ----- Recovery check-ins (two stressful stretches dip the scores) -----
  const trainedOn = new Set(sessions.map((s) => (s.date as Date).toISOString().slice(0, 10)));
  const checkIns: DemoDataset["checkIns"] = [];
  for (let d = 0; d < totalDays; d++) {
    if (rand() > 0.72) continue;
    const date = addDays(start, d);
    const yesterdayLower = trainedOn.has(addDays(date, -1).toISOString().slice(0, 10));
    const x = t(d);
    const rough = (x > 0.5 && x < 0.58) || (x > 0.82 && x < 0.87);
    const sleep = r1(Math.min(9, Math.max(4.8, (rough ? 5.9 : 7.3) + gauss() * 0.6)));
    const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
    checkIns.push({
      id: id("ci", checkIns.length),
      athleteId,
      date,
      sleepHours: sleep,
      sleepQuality: clamp(sleep >= 7 ? 4 + gauss() * 0.6 : 2.4 + gauss() * 0.6),
      energy: clamp((rough ? 2.4 : 3.8) + gauss() * 0.7),
      soreness: clamp((yesterdayLower ? 3.6 : 2.2) + gauss() * 0.7),
      stress: clamp((rough ? 4.1 : 2.3) + gauss() * 0.7),
      motivation: clamp((rough ? 2.8 : 4) + gauss() * 0.6),
      restingHr: Math.round(56 + (rough ? 3 : 0) + gauss() * 1.6),
      notes: rough && rand() < 0.25 ? "Busy work week, not sleeping well." : null,
      createdAt: date,
    });
  }

  // ----- Goals -----
  const benchId = exerciseId("Barbell Bench Press");
  const goals: DemoDataset["goals"] = [
    { id: id("goal", 0), athleteId, type: "BODY_WEIGHT", title: "Reach 78 kg", startValue: 86.4, targetValue: 78, unit: "kg", startDate: start, targetDate: addDays(today, 60), status: "ACTIVE", createdAt: start },
    { id: id("goal", 1), athleteId, type: "WAIST", title: "Waist under 86 cm", startValue: 94, targetValue: 86, unit: "cm", startDate: start, targetDate: addDays(today, 75), status: "ACTIVE", createdAt: start },
    { id: id("goal", 2), athleteId, type: "STRENGTH", title: "Bench Press estimated 1RM 110 kg", exerciseId: benchId, startValue: 88.7, targetValue: 110, unit: "kg", startDate: start, targetDate: addDays(today, 120), status: "ACTIVE", createdAt: start },
    { id: id("goal", 3), athleteId, type: "WORKOUT_FREQUENCY", title: "Train 4 times a week", targetValue: 4, unit: "/week", startDate: addDays(start, 6 * 7), status: "ACTIVE", createdAt: addDays(start, 6 * 7) },
    { id: id("goal", 4), athleteId, type: "CONSISTENCY", title: "Three-session weeks", targetValue: 6, weeklyTarget: 3, unit: "weeks", startDate: start, status: "ACHIEVED", createdAt: start },
  ];

  // ----- Notes and AI audit -----
  const notes: DemoDataset["notes"] = [
    { id: id("note", 0), athleteId, date: addDays(start, 2), title: "Starting out", body: "First week done. Keeping loads light and learning the movements." },
    { id: id("note", 1), athleteId, date: addDays(start, 6 * 7 + 1), title: "New program", body: "Moved to an upper/lower split. Four days feels sustainable." },
    { id: id("note", 2), athleteId, date: addDays(start, 10 * 7 + 3), title: "Holiday week", body: "Travelling, trained twice and ate out. Back on track next week." },
    { id: id("note", 3), athleteId, date: addDays(today, -10), title: "Chin-ups", body: "Dropped the assistance again. Pull-ups are getting close." },
  ];
  const aiProposals: DemoDataset["aiProposals"] = [
    {
      id: id("ai", 0),
      athleteId,
      kind: "program",
      status: "APPROVED",
      provider: "azure-openai",
      payload: JSON.stringify({ name: "Upper / Lower", note: "Fictional demo proposal reviewed by the athlete." }),
      createdById: userId,
      createdAt: addDays(start, 6 * 7),
    },
  ];

  return {
    athlete: {
      displayName: "Demo Athlete",
      heightCm: 176,
      birthDate: new Date(Date.UTC(1993, 4, 14)),
      sex: "MALE",
      calorieTarget: 2300,
      proteinTarget: 165,
      carbTarget: 250,
      fatTarget: 70,
      waterTargetL: 3,
    },
    measurementTypes,
    exercises,
    programs,
    templates,
    templateExercises,
    sessions,
    workoutExercises,
    sets,
    bodyWeights,
    measurements,
    nutrition,
    checkIns,
    goals,
    notes,
    gymVisits,
    aiProposals,
  };
}
