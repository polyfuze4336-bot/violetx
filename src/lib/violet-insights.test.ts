import { describe, expect, it } from "vitest";

import {
  answerFromSnapshot,
  buildInsightSnapshot,
  composeSummary,
  intentOf,
  looksLikeQuestion,
  summaryText,
  usesOnlyKnownNumbers,
  type InsightInput,
} from "@/lib/violet-insights";

const NOW = new Date("2026-08-31T10:00:00Z");

const base: InsightInput = {
  now: NOW,
  windowDays: 30,
  weights: [
    { date: "2026-08-02", value: 80.0 },
    { date: "2026-08-30", value: 78.6 },
  ],
  waist: [
    { date: "2026-08-02", value: 90.0 },
    { date: "2026-08-30", value: 87.9 },
  ],
  workouts: 14,
  workoutsPerWeek: 3.3,
  prCount: 3,
  consistencyPct: 80,
  adherencePct: 90,
  avgSessionRpe: 7.5,
  e1rm: [
    { name: "Bench Press", changePct: 4.8 },
    { name: "Back Squat", changePct: 2.2 },
  ],
  nutrition: [
    { date: "2026-08-10", calories: 2000, protein: 120, water: 2.5 },
    { date: "2026-08-11", calories: 2100, protein: 132, water: 3 },
  ],
  goals: [{ title: "Body weight", pct: 42, achieved: false, targetIsLowerThanStart: true, type: "BODY_WEIGHT" }],
  readinessAvg7d: 76,
  noteCount: 2,
};

describe("insight snapshot", () => {
  it("computes only what the data shows", () => {
    const s = buildInsightSnapshot(base);
    expect(s.weight).toEqual({ from: 80, to: 78.6, change: -1.4, readings: 2 });
    expect(s.waist?.change).toBe(-2.1);
    expect(s.nutrition).toMatchObject({ daysLogged: 2, avgProtein: 126 });
    expect(s.missing).toEqual([]);
  });

  it("reports missing categories instead of fabricating metrics", () => {
    const s = buildInsightSnapshot({ ...base, weights: [{ date: "2026-08-30", value: 78 }], nutrition: [], e1rm: [], readinessAvg7d: null, workouts: 0 });
    expect(s.weight).toBeNull();
    expect(s.nutrition).toBeNull();
    expect(s.missing.join(" ")).toMatch(/body weight/);
    expect(s.missing.join(" ")).toMatch(/nutrition logs/);
    expect(s.missing.join(" ")).toMatch(/recovery check-ins/);
    const text = summaryText(composeSummary(s));
    expect(text).toMatch(/Not enough data yet for/);
    expect(text).not.toMatch(/Weight:/);
  });
});

describe("composeSummary", () => {
  it("reproduces the example summary with a goal-aware conclusion", () => {
    const text = summaryText(composeSummary(buildInsightSnapshot(base)));
    expect(text).toContain("Over the last 30 days:");
    expect(text).toContain("Weight: −1.4 kg");
    expect(text).toContain("Waist: −2.1 cm");
    expect(text).toContain("Workouts: 14");
    expect(text).toContain("Bench Press estimated 1RM: +4.8%");
    expect(text).toContain("Average protein logged: 126 g/day");
    expect(text).toMatch(/losing weight while maintaining or improving recorded strength.*relative to your stated goal/);
  });

  it("warns when weight drops but lifts slip", () => {
    const s = buildInsightSnapshot({ ...base, e1rm: [{ name: "Bench Press", changePct: -6 }] });
    expect(composeSummary(s).conclusion).toMatch(/slipping/);
  });

  it("handles a completely empty window", () => {
    const s = buildInsightSnapshot({ ...base, weights: [], waist: [], workouts: 0, e1rm: [], nutrition: [], goals: [], readinessAvg7d: null, prCount: 0 });
    expect(composeSummary(s).headline).toMatch(/isn't enough recorded data/);
  });
});

describe("question routing and answers", () => {
  it("separates questions from data", () => {
    expect(looksLikeQuestion("How am I doing?")).toBe(true);
    expect(looksLikeQuestion("Is my bench improving")).toBe(true);
    expect(looksLikeQuestion("Hip abduction 9x50kg")).toBe(false);
    expect(looksLikeQuestion("Weight - 74kg")).toBe(false);
  });

  it("classifies intents", () => {
    expect(intentOf("How am I doing?")).toBe("progress");
    expect(intentOf("Is my bench going up?")).toBe("strength");
    expect(intentOf("How much protein am I eating?")).toBe("nutrition");
    expect(intentOf("how is my recovery")).toBe("recovery");
  });

  it("answers focused questions from evidence and admits missing data", () => {
    const s = buildInsightSnapshot(base);
    expect(answerFromSnapshot("strength", s)).toMatch(/Bench Press estimated 1RM: \+4.8%/);
    const none = buildInsightSnapshot({ ...base, nutrition: [] });
    expect(answerFromSnapshot("nutrition", none)).toMatch(/No nutrition has been logged/);
  });
});

describe("AI answer guard", () => {
  const s = buildInsightSnapshot(base);

  it("accepts answers that only use recorded numbers", () => {
    expect(usesOnlyKnownNumbers("Weight is down 1.4 kg and bench e1RM is up 4.8% over 30 days across 14 workouts.", s)).toBe(true);
  });

  it("rejects invented precise metrics", () => {
    expect(usesOnlyKnownNumbers("Your bench e1RM rose 12.7% and weight fell 3.9 kg.", s)).toBe(false);
    expect(usesOnlyKnownNumbers("You squatted 143 kg last week.", s)).toBe(false);
  });
});
