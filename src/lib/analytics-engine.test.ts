import { describe, expect, it } from "vitest";

import { buildAnalytics, muscleObservations, type AnalyticsInput } from "@/lib/analytics-engine";

const NOW = new Date("2026-08-19T10:00:00Z");
const s = (date: string, name: string, reps: number, weightKg: number, extra = {}) => ({
  date,
  exerciseId: name,
  exerciseName: name,
  muscleGroup: null,
  reps,
  weightKg,
  sets: null,
  ...extra,
});

const input: AnalyticsInput = {
  sets: [
    s("2026-08-17", "Bench Press", 8, 80),
    s("2026-08-17", "Bench Press", 8, 80),
    s("2026-08-17", "Warm", 10, 40, { setType: "WARMUP" }),
    s("2026-08-12", "Squat", 5, 100),
    s("2026-08-10", "Bench Press", 8, 77.5),
    s("2026-08-03", "Bench Press", 8, 75),
    s("2026-06-01", "Bench Press", 8, 70),
  ],
  sessions: [
    { id: "a", date: "2026-08-17", durationMin: 60, sessionRpe: 8 },
    { id: "b", date: "2026-08-12", durationMin: 50, sessionRpe: 7 },
    { id: "c", date: "2026-08-10", durationMin: null, sessionRpe: null },
  ],
  weights: [
    { date: "2026-08-03", value: 80 },
    { date: "2026-08-17", value: 79 },
  ],
  measurements: [
    { name: "Waist", unit: "CM", date: "2026-08-03", value: 90 },
    { name: "Waist", unit: "CM", date: "2026-08-17", value: 88.5 },
  ],
  prs: [{ date: "2026-08-17", exerciseName: "Bench Press", type: "WEIGHT", weightKg: 80, reps: 8 }],
  plannedPerWeek: 3,
};

describe("buildAnalytics", () => {
  it("summarises the 30-day window, excluding warm-ups and older data", () => {
    const a = buildAnalytics(input, "30D", NOW);
    expect(a.bucket).toBe("day");
    expect(a.totals.workouts).toBe(4);
    expect(a.totals.sets).toBe(5);
    expect(a.totals.volumeKg).toBe(80 * 8 * 2 + 100 * 5 + 77.5 * 8 + 75 * 8);
    expect(a.totals.avgDurationMin).toBe(55);
    expect(a.totals.avgSessionRpe).toBe(7.5);
  });

  it("filters by range and supports ALL", () => {
    expect(buildAnalytics(input, "7D", NOW).totals.workouts).toBe(1);
    expect(buildAnalytics(input, "ALL", NOW).totals.workouts).toBe(5);
    expect(buildAnalytics(input, "ALL", NOW).bucket).toBe("week");
  });

  it("breaks volume down by muscle and exercise", () => {
    const a = buildAnalytics(input, "30D", NOW);
    expect(a.volumeByMuscle[0]).toMatchObject({ muscle: "Chest", sets: 4 });
    expect(a.volumeByExercise[0].name).toBe("Bench Press");
    expect(a.exerciseFrequency[0]).toMatchObject({ name: "Bench Press", sessions: 3 });
  });

  it("tracks e1RM trends, PRs, measurements and weight vs strength", () => {
    const a = buildAnalytics(input, "30D", NOW);
    const bench = a.e1rmTrends.find((t) => t.name === "Bench Press")!;
    expect(bench.points.length).toBe(3);
    expect(bench.changePct).toBeGreaterThan(0);
    expect(a.prTimeline).toHaveLength(1);
    expect(a.measurementTrends[0]).toMatchObject({ name: "Waist", delta: -1.5 });
    expect(a.weightVsStrength.some((p) => p.weightIndex !== null && p.strengthIndex !== null)).toBe(true);
  });

  it("computes consistency and program adherence against planned sessions", () => {
    const a = buildAnalytics(input, "30D", NOW);
    expect(a.consistency.weeklyTarget).toBe(3);
    expect(a.adherence).not.toBeNull();
    expect(a.adherence!.planned).toBeGreaterThan(0);
    expect(buildAnalytics({ ...input, plannedPerWeek: null }, "30D", NOW).adherence).toBeNull();
  });

  it("handles empty data without inventing values", () => {
    const a = buildAnalytics({ sets: [], sessions: [], weights: [], measurements: [], prs: [], plannedPerWeek: null }, "30D", NOW);
    expect(a.totals).toMatchObject({ workouts: 0, sets: 0, volumeKg: 0, avgDurationMin: null, avgSessionRpe: null });
    expect(a.e1rmTrends).toEqual([]);
    expect(a.consistency.weeksMet).toBe(0);
  });
});

describe("muscleObservations", () => {
  it("flags an upper-body bias with a percentage, as an observation", () => {
    const out = muscleObservations([
      { muscle: "Chest", sets: 18 },
      { muscle: "Back", sets: 21 },
      { muscle: "Shoulders", sets: 12 },
      { muscle: "Quads", sets: 10 },
      { muscle: "Hamstrings", sets: 6 },
    ]);
    expect(out[0]).toMatch(/upper-body biased: lower-body volume is about 69% lower/);
  });

  it("stays quiet with little data and notes missing groups", () => {
    expect(muscleObservations([{ muscle: "Chest", sets: 4 }])).toEqual([]);
    expect(muscleObservations([{ muscle: "Chest", sets: 10 }, { muscle: "Back", sets: 10 }, { muscle: "Shoulders", sets: 10 }, { muscle: "Quads", sets: 10 }])).toContain("No recorded sets for: Hamstrings, Glutes & Hips.");
  });
});
