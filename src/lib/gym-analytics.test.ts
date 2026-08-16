import { describe, expect, it } from "vitest";

import {
  computeAchievements,
  computeJourneyStats,
  type GymBranchLite,
  type GymVisitLite,
} from "@/lib/gym-analytics";

function branches(count: number, state = "Kuala Lumpur"): GymBranchLite[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    name: `Branch ${i}`,
    state,
    active: true,
  }));
}

describe("computeJourneyStats", () => {
  it("computes 25% for 25 unique visited of 100 active", () => {
    const b = branches(100);
    const visits: GymVisitLite[] = b
      .slice(0, 25)
      .map((br) => ({ gymBranchId: br.id, visitedAt: "2026-08-16" }));
    const stats = computeJourneyStats(b, visits);
    expect(stats.totalActive).toBe(100);
    expect(stats.uniqueVisited).toBe(25);
    expect(stats.percent).toBe(25);
    expect(stats.remaining).toBe(75);
  });

  it("does not count a repeat visit twice", () => {
    const b = branches(100);
    const visits: GymVisitLite[] = [
      { gymBranchId: "b0", visitedAt: "2026-08-01" },
      { gymBranchId: "b0", visitedAt: "2026-08-16" }, // same gym again
    ];
    const stats = computeJourneyStats(b, visits);
    expect(stats.uniqueVisited).toBe(1);
    expect(stats.percent).toBe(1);
    expect(stats.mostVisitedBranchId).toBe("b0");
    expect(stats.distinctVisitDays).toBe(2);
  });

  it("excludes inactive branches from the total and percentage", () => {
    const b = branches(10);
    b[0].active = false; // a closed gym
    const visits: GymVisitLite[] = [
      { gymBranchId: "b0", visitedAt: "2026-08-01" }, // visited but now inactive
      { gymBranchId: "b1", visitedAt: "2026-08-02" },
    ];
    const stats = computeJourneyStats(b, visits);
    expect(stats.totalActive).toBe(9);
    expect(stats.uniqueVisited).toBe(1); // only b1 counts
  });

  it("tracks state progress", () => {
    const b = [...branches(3, "Penang"), ...branches(2, "Johor")];
    b.forEach((br, i) => (br.id = `x${i}`));
    const visits: GymVisitLite[] = [
      { gymBranchId: "x0", visitedAt: "2026-08-01" },
    ];
    const stats = computeJourneyStats(b, visits);
    const penang = stats.byState.find((s) => s.state === "Penang");
    expect(penang).toEqual({ state: "Penang", total: 3, visited: 1 });
    expect(stats.statesVisited).toBe(1);
    expect(stats.totalStates).toBe(2);
  });
});

describe("computeAchievements", () => {
  it("unlocks based on live counts and adapts to totals", () => {
    const b = branches(3, "Penang");
    const visits = b.map((br) => ({ gymBranchId: br.id, visitedAt: "2026-08-01" }));
    const a = computeAchievements(computeJourneyStats(b, visits));
    const map = Object.fromEntries(a.map((x) => [x.key, x.unlocked]));
    expect(map["first-step"]).toBe(true);
    expect(map["state-explorer"]).toBe(true); // all Penang visited
    expect(map["explorer"]).toBe(false); // only 3
  });
});
