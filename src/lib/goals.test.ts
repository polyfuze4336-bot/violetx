import { describe, expect, it } from "vitest";

import { computeGoalProgress, slopePerDay, trajectoryText, weekStart } from "@/lib/goals";
import { computeReadiness, explainReadiness, sessionRegion, sleepDurationScore } from "@/lib/readiness";

const NOW = new Date("2026-08-19T10:00:00Z"); // Wednesday
const pt = (date: string, value: number) => ({ date, value });

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-08-19")).toBe("2026-08-17");
    expect(weekStart("2026-08-16")).toBe("2026-08-10");
  });
});

describe("goal progress (series goals)", () => {
  const weight = [pt("2026-06-01", 80), pt("2026-07-01", 78), pt("2026-08-01", 76), pt("2026-08-15", 75)];

  it("computes progress towards a lower target and projects a date", () => {
    const p = computeGoalProgress(
      { type: "BODY_WEIGHT", startValue: 80, targetValue: 70, startDate: "2026-06-01", targetDate: "2027-06-01" },
      { series: weight },
      NOW
    );
    expect(p.current).toBe(75);
    expect(p.pct).toBe(50);
    expect(p.achieved).toBe(false);
    expect(p.trajectory.kind).toBe("projected");
    if (p.trajectory.kind === "projected") {
      expect(p.trajectory.onTrack).toBe(true);
      expect(p.trajectory.ratePerWeek).toBeLessThan(0);
    }
  });

  it("flags when the trend moves away from the target", () => {
    const p = computeGoalProgress(
      { type: "BODY_WEIGHT", startValue: 80, targetValue: 70, startDate: "2026-06-01" },
      { series: [pt("2026-06-01", 80), pt("2026-07-01", 81), pt("2026-08-01", 82), pt("2026-08-15", 83)] },
      NOW
    );
    expect(p.trajectory.kind).toBe("moving_away");
  });

  it("does not project without enough data", () => {
    const p = computeGoalProgress(
      { type: "BODY_WEIGHT", startValue: 80, targetValue: 70, startDate: "2026-06-01" },
      { series: [pt("2026-08-14", 79), pt("2026-08-15", 78.8)] },
      NOW
    );
    expect(p.trajectory.kind).toBe("insufficient");
    expect(trajectoryText(p.trajectory, "kg")).toMatch(/Not enough data/);
  });

  it("handles strength goals upward and marks achievement", () => {
    const series = [pt("2026-06-01", 100), pt("2026-08-01", 110), pt("2026-08-10", 121)];
    const p = computeGoalProgress({ type: "STRENGTH", startValue: 100, targetValue: 120, startDate: "2026-06-01" }, { series }, NOW);
    expect(p.achieved).toBe(true);
    expect(p.pct).toBe(100);
    expect(p.trajectory.kind).toBe("achieved");
  });

  it("handles missing data gracefully", () => {
    const p = computeGoalProgress({ type: "WAIST", startValue: null, targetValue: 80, startDate: "2026-06-01" }, { series: [] }, NOW);
    expect(p.current).toBeNull();
    expect(p.pct).toBe(0);
  });

  it("slope needs at least three points spanning a week", () => {
    expect(slopePerDay([pt("2026-08-01", 1), pt("2026-08-02", 2), pt("2026-08-03", 3)])).toBeNull();
    expect(slopePerDay([pt("2026-08-01", 1), pt("2026-08-08", 2), pt("2026-08-15", 3)])).toBeCloseTo(1 / 7, 5);
  });
});

describe("goal progress (training goals)", () => {
  it("counts this week's workouts for frequency goals", () => {
    const p = computeGoalProgress(
      { type: "WORKOUT_FREQUENCY", startValue: null, targetValue: 4, startDate: "2026-06-01" },
      { trainingDays: ["2026-08-17", "2026-08-18", "2026-08-12", "2026-08-10"] },
      NOW
    );
    expect(p.current).toBe(2);
    expect(p.pct).toBe(50);
    expect(p.detail).toMatch(/averaged/);
  });

  it("computes consistency streaks of weeks meeting the weekly target", () => {
    const days = ["2026-08-10", "2026-08-12", "2026-08-03", "2026-08-05", "2026-07-27", "2026-07-29", "2026-07-20"];
    const p = computeGoalProgress(
      { type: "CONSISTENCY", startValue: 0, targetValue: 4, weeklyTarget: 2, startDate: "2026-06-01" },
      { trainingDays: days },
      NOW
    );
    expect(p.current).toBe(3);
    expect(p.pct).toBe(75);
  });

  it("supports custom goals with a manual current value", () => {
    const p = computeGoalProgress({ type: "CUSTOM", startValue: 0, targetValue: 10, currentValue: 4, startDate: "2026-06-01" }, {}, NOW);
    expect(p.pct).toBe(40);
  });
});

describe("readiness", () => {
  it("scores a good check-in", () => {
    const r = computeReadiness({ sleepHours: 8, sleepQuality: 4, energy: 4, soreness: 2, stress: 2, motivation: 4 });
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(["Good", "Excellent"]).toContain(r.label);
    expect(r.components.sleep).toBe(Math.round(100 * 0.6 + 75 * 0.4));
  });

  it("scores poor recovery as low", () => {
    const r = computeReadiness({ sleepHours: 4, sleepQuality: 1, energy: 1, soreness: 5, stress: 5, motivation: 1 });
    expect(r.score).toBeLessThan(25);
    expect(r.label).toBe("Low");
  });

  it("stays within 0–100 and handles extremes", () => {
    const hi = computeReadiness({ sleepHours: 8, sleepQuality: 5, energy: 5, soreness: 1, stress: 1, motivation: 5 });
    expect(hi.score).toBe(100);
    const lo = computeReadiness({ sleepHours: 0, sleepQuality: 1, energy: 1, soreness: 5, stress: 5, motivation: 1 });
    expect(lo.score).toBe(0);
    expect(sleepDurationScore(12)).toBeLessThan(100);
  });

  it("explains soreness after a recent session without medical claims", () => {
    const input = { sleepHours: 7.5, sleepQuality: 4, energy: 4, soreness: 5, stress: 2, motivation: 4 };
    const text = explainReadiness(computeReadiness(input), input, { dayName: "Monday", region: "lower-body", daysAgo: 2 });
    expect(text).toMatch(/following Monday's lower-body session/);
    expect(text).toMatch(/not medical advice/);
    expect(text).not.toMatch(/diagnos/i);
  });

  it("classifies session regions", () => {
    expect(sessionRegion({ Quads: 10, Hamstrings: 6 })).toBe("lower-body");
    expect(sessionRegion({ Chest: 9, Back: 9, Quads: 2 })).toBe("upper-body");
    expect(sessionRegion({ Chest: 5, Quads: 5 })).toBe("full-body");
  });
});
