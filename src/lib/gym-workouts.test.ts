import { describe, expect, it } from "vitest";

import { computeWorkoutAchievements, favouriteGym, newGymsSince, workoutsByGym } from "@/lib/gym-workouts";

const branches = [
  { id: "a", name: "Gym A", state: "Selangor" },
  { id: "b", name: "Gym B", state: "Penang" },
];

describe("workoutsByGym", () => {
  it("counts distinct workout days per gym, most-used first, ignoring unknown/none", () => {
    const out = workoutsByGym(
      [
        { date: "2026-08-01", gymBranchId: "a" },
        { date: "2026-08-01", gymBranchId: "a" },
        { date: "2026-08-05", gymBranchId: "b" },
        { date: "2026-08-08", gymBranchId: "b" },
        { date: "2026-08-09", gymBranchId: null },
        { date: "2026-08-10", gymBranchId: "zzz" },
      ],
      branches
    );
    expect(out.map((o) => [o.name, o.workouts])).toEqual([["Gym B", 2], ["Gym A", 1]]);
    expect(favouriteGym(out)?.name).toBe("Gym B");
    expect(favouriteGym([])).toBeNull();
  });
});

describe("newGymsSince", () => {
  it("counts gyms first visited in the period only", () => {
    const visits = [
      { gymBranchId: "a", visitedAt: "2026-05-01T00:00:00Z" },
      { gymBranchId: "a", visitedAt: "2026-08-10T00:00:00Z" },
      { gymBranchId: "b", visitedAt: "2026-08-12T00:00:00Z" },
    ];
    expect(newGymsSince(visits, "2026-08-01")).toBe(1);
  });
});

describe("computeWorkoutAchievements", () => {
  it("unlocks milestones from recorded data", () => {
    const a = Object.fromEntries(
      computeWorkoutAchievements({ totalWorkouts: 12, totalPrs: 1, gymsVisited: 5, statesVisited: 2, consistentWeeks: 3 }).map((x) => [x.key, x.unlocked])
    );
    expect(a).toMatchObject({
      "first-workout": true,
      "workouts-10": true,
      "workouts-50": false,
      "first-pr": true,
      "prs-10": false,
      "gyms-5": true,
      "gyms-10": false,
      "new-state": true,
      "consistency-4": false,
    });
  });
});
