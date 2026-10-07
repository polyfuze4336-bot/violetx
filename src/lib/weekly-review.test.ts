import { describe, expect, it } from "vitest";

import { buildWeeklyReview, mondayOf, type ReviewInput } from "@/lib/weekly-review";
import { dayProgress, nutritionObservations } from "@/lib/nutrition-intel";

const set = (date: string, name: string, reps: number, weightKg: number, extra = {}) => ({
  date,
  exerciseId: name,
  exerciseName: name,
  muscleGroup: null,
  reps,
  weightKg,
  sets: null,
  ...extra,
});

const input: ReviewInput = {
  weekStart: "2026-08-17",
  sets: [
    set("2026-08-17", "Bench Press", 8, 82.5),
    set("2026-08-17", "Bench Press", 8, 82.5),
    set("2026-08-19", "Lat Pulldown", 10, 55),
    set("2026-08-20", "Back Squat", 5, 100),
    set("2026-08-21", "Bench Press", 6, 80),
    set("2026-08-10", "Bench Press", 8, 80),
    set("2026-08-11", "Back Squat", 5, 100),
    set("2026-08-03", "Back Squat", 5, 100),
    set("2026-08-18", "Warm", 10, 20, { setType: "WARMUP" }),
  ],
  prs: [
    { date: "2026-08-17", exerciseName: "Bench Press", type: "WEIGHT", weightKg: 82.5, reps: 8, prevWeightKg: 80 },
    { date: "2026-08-19", exerciseName: "Lat Pulldown", type: "WEIGHT", weightKg: 55, reps: 10, prevWeightKg: 50 },
    { date: "2026-08-12", exerciseName: "Old", type: "WEIGHT", weightKg: 1, reps: 1, prevWeightKg: null },
  ],
  weights: [
    { date: "2026-08-12", value: 79.0 },
    { date: "2026-08-18", value: 78.6 },
  ],
  waistCm: [
    { date: "2026-08-10", value: 88.0 },
    { date: "2026-08-20", value: 87.5 },
  ],
  checkIns: [
    { date: "2026-08-17", score: 78 },
    { date: "2026-08-19", score: 74 },
  ],
  nutrition: [
    { date: "2026-08-17", calories: 2000, protein: 150, water: 2.5 },
    { date: "2026-08-18", calories: 2200, protein: 140, water: 3 },
  ],
  targets: { calories: 2100, protein: 160, waterL: 3 },
  plannedPerWeek: 4,
};

describe("buildWeeklyReview", () => {
  const r = buildWeeklyReview(input);

  it("summarises training and compares with the previous week", () => {
    expect(r.weekStart).toBe("2026-08-17");
    expect(r.weekEnd).toBe("2026-08-23");
    expect(r.training.workouts).toBe(4);
    expect(r.training.sets).toBe(5);
    expect(r.training.volumeKg).toBe(82.5 * 8 * 2 + 55 * 10 + 100 * 5 + 80 * 6);
    expect(r.training.prevVolumeKg).toBe(80 * 8 + 100 * 5);
    expect(r.training.volumeChangePct).toBeGreaterThan(0);
  });

  it("lists this week's PRs with deltas and ignores other weeks", () => {
    expect(r.strength.prs).toHaveLength(2);
    expect(r.strength.prs[0].label).toContain("+2.5 kg");
  });

  it("derives body, recovery, consistency and nutrition", () => {
    expect(r.body.weightChangeKg).toBe(-0.4);
    expect(r.body.waistChangeCm).toBe(-0.5);
    expect(r.recovery).toEqual({ avgReadiness: 76, checkIns: 2 });
    expect(r.consistency).toEqual({ done: 4, planned: 4 });
    expect(r.nutrition).toMatchObject({ daysLogged: 2, avgCalories: 2100, avgProtein: 145 });
  });

  it("writes an evidence-based observation and proposals", () => {
    expect(r.observation).toMatch(/Excellent consistency/);
    expect(r.observation).toMatch(/2 PRs/);
    expect(r.nextWeek).toContain("Aim for 4 sessions");
    expect(r.nextWeek.join(" ")).toMatch(/Consider progression on Bench Press and Lat Pulldown/);
    expect(r.nextWeek.join(" ")).toMatch(/protein gap/);
  });

  it("handles an empty week", () => {
    const e = buildWeeklyReview({ ...input, weekStart: "2026-05-04", sets: [], prs: [], weights: [], waistCm: [], checkIns: [], nutrition: [] });
    expect(e.hasData).toBe(false);
    expect(e.training.workouts).toBe(0);
    expect(e.observation).toMatch(/No workouts/);
    expect(e.body.weightChangeKg).toBeNull();
  });

  it("normalises any date to its Monday", () => {
    expect(mondayOf("2026-08-23")).toBe("2026-08-17");
    expect(mondayOf("2026-08-17")).toBe("2026-08-17");
  });
});

describe("nutrition intelligence", () => {
  it("computes progress against targets without inventing missing intake", () => {
    const p = dayProgress(
      [
        { date: "2026-08-20", calories: 900, protein: 60, carbohydrates: null, fat: null, water: 1 },
        { date: "2026-08-20", calories: 920, protein: 82, carbohydrates: null, fat: null, water: 1.1 },
      ],
      { calories: 2100, protein: 160, carbohydrates: null, fat: null, waterL: 3 }
    );
    expect(p.find((x) => x.key === "calories")).toMatchObject({ current: 1820, target: 2100, pct: 87 });
    expect(p.find((x) => x.key === "protein")).toMatchObject({ current: 142, pct: 89 });
    expect(p.find((x) => x.key === "carbohydrates")).toMatchObject({ current: null, pct: null });
    expect(p.find((x) => x.key === "water")?.current).toBe(2.1);
  });

  it("only offers trend observations with enough logged weeks", () => {
    expect(nutritionObservations([{ label: "a", daysLogged: 5, avgCalories: 2000, avgProtein: 100, avgWeightKg: 80, workouts: 3 }])).toEqual([]);
    const weeks = [2400, 2350, 2100, 2000].map((c, i) => ({ label: String(i), daysLogged: 5, avgCalories: c, avgProtein: 110 + i * 10, avgWeightKg: 80 - i * 0.3, workouts: 3 }));
    const out = nutritionObservations(weeks);
    expect(out[0]).toMatch(/fell about/);
    expect(out[0]).toMatch(/not proof of cause/);
  });
});

describe("weekly review: rep PR label", () => {
  it("describes a rep PR as +reps at the same load", () => {
    const r = buildWeeklyReview({
      weekStart: "2026-08-17",
      sets: [],
      prs: [{ date: "2026-08-18", exerciseName: "Bench Press", type: "REPS", weightKg: 80, reps: 10, prevWeightKg: 80, prevReps: 8 }],
      weights: [], waistCm: [], checkIns: [], nutrition: [], targets: null, plannedPerWeek: null,
    });
    expect(r.strength.prs[0].label).toBe("+2 reps at 80 kg (8 → 10)");
  });
});
