import { describe, expect, it } from "vitest";

import {
  addPeriods,
  buildRuleBasedTips,
  epley,
  inferMuscleGroup,
  periodStart,
  resolveMuscleGroup,
  rollingWindow,
  summarizeExercises,
  summarizePeriods,
  type TrainingSet,
} from "@/lib/training-analytics";

const NOW = new Date("2026-08-19T10:00:00Z"); // Wednesday

function set(
  date: string,
  name: string,
  reps: number,
  weightKg: number,
  extra: Partial<TrainingSet> = {}
): TrainingSet {
  return {
    date,
    exerciseId: name.toLowerCase().replace(/\s+/g, "-"),
    exerciseName: name,
    muscleGroup: null,
    reps,
    weightKg,
    sets: null,
    ...extra,
  };
}

describe("period helpers", () => {
  it("starts weeks on Monday and months on the 1st", () => {
    expect(periodStart("2026-08-19", "week")).toBe("2026-08-17");
    expect(periodStart("2026-08-16", "week")).toBe("2026-08-10"); // Sunday
    expect(periodStart("2026-08-19", "month")).toBe("2026-08-01");
    expect(addPeriods("2026-01-01", "month", -1)).toBe("2025-12-01");
    expect(addPeriods("2026-08-17", "week", -2)).toBe("2026-08-03");
  });
});

describe("muscle groups", () => {
  it("infers from exercise names", () => {
    expect(inferMuscleGroup("Bench Press")).toBe("Chest");
    expect(inferMuscleGroup("Leg Curl")).toBe("Hamstrings");
    expect(inferMuscleGroup("Bicep Curl")).toBe("Biceps");
    expect(inferMuscleGroup("Lat Pulldown")).toBe("Back");
    expect(inferMuscleGroup("Hip Abduction")).toBe("Glutes & Hips");
    expect(inferMuscleGroup("Tricep Pushdown")).toBe("Triceps");
    expect(inferMuscleGroup("Mystery Move")).toBe("Other");
  });

  it("prefers an explicit muscle group", () => {
    expect(resolveMuscleGroup("Mystery Move", "Chest")).toBe("Chest");
    expect(resolveMuscleGroup("Bench Press", "legs")).toBe("Chest");
  });
});

describe("summarizePeriods", () => {
  const rows = [
    set("2026-08-17", "Bench Press", 10, 60),
    set("2026-08-17", "Bench Press", 8, 65, { sets: 2 }),
    set("2026-08-19", "Squat", 8, 100),
    set("2026-08-10", "Bench Press", 10, 60),
  ];

  it("buckets weekly volume, sets and sessions, including empty weeks", () => {
    const weeks = summarizePeriods(rows, "week", 4, NOW);
    expect(weeks).toHaveLength(4);
    const current = weeks[3];
    expect(current.isCurrent).toBe(true);
    expect(current.sessions).toBe(2);
    expect(current.sets).toBe(4); // 1 + 2 + 1
    expect(current.volumeKg).toBe(10 * 60 + 8 * 65 * 2 + 8 * 100);
    expect(current.setsByMuscle.Chest).toBe(3);
    expect(current.setsByMuscle.Quads).toBe(1);
    expect(weeks[2].sets).toBe(1);
    expect(weeks[0].sets).toBe(0);
  });

  it("buckets monthly", () => {
    const months = summarizePeriods(rows, "month", 2, NOW);
    expect(months[1].sets).toBe(5);
    expect(months[0].sets).toBe(0);
  });
});

describe("summarizeExercises", () => {
  it("flags progressing, stalled and new exercises", () => {
    const rows: TrainingSet[] = [];
    // Progressing: increasing weight over 5 sessions.
    [50, 52.5, 55, 57.5, 60].forEach((w, i) =>
      rows.push(set(`2026-08-0${i + 1}`, "Bench Press", 8, w))
    );
    // Stalled: same weight over 5 sessions.
    for (let i = 1; i <= 5; i++) rows.push(set(`2026-08-1${i}`, "Squat", 8, 100));
    // New: one session.
    rows.push(set("2026-08-18", "Leg Curl", 12, 40));

    const out = Object.fromEntries(
      summarizeExercises(rows, NOW).map((e) => [e.name, e])
    );
    expect(out["Bench Press"].status).toBe("progressing");
    expect(out["Bench Press"].changePct).toBeGreaterThan(0);
    expect(out["Squat"].status).toBe("stalled");
    expect(out["Leg Curl"].status).toBe("new");
  });

  it("marks long-idle exercises inactive", () => {
    const out = summarizeExercises([set("2026-06-01", "Row", 10, 50)], NOW);
    expect(out[0].status).toBe("inactive");
  });

  it("uses Epley for estimated strength", () => {
    expect(epley(100, 1)).toBe(100);
    expect(Math.round(epley(100, 10))).toBe(133);
  });
});

describe("buildRuleBasedTips", () => {
  function tipsFor(rows: TrainingSet[]) {
    const weeks = summarizePeriods(rows, "week", 8, NOW);
    const window = rollingWindow(rows, NOW);
    const exercises = summarizeExercises(rows, NOW);
    const last = rows.map((r) => r.date).sort().pop() ?? null;
    return buildRuleBasedTips({ weeks, window, exercises, lastTrainingDate: last, now: NOW });
  }

  it("asks the athlete to log training when there is no data", () => {
    const tips = tipsFor([]);
    expect(tips).toHaveLength(1);
    expect(tips[0].category).toBe("consistency");
  });

  it("flags low weekly volume and a stalled lift", () => {
    const rows: TrainingSet[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push(set(`2026-08-${String(5 + i * 3).padStart(2, "0")}`, "Bench Press", 8, 80));
    }
    const tips = tipsFor(rows);
    expect(tips.some((t) => t.category === "volume" && /Chest/.test(t.title))).toBe(true);
    expect(tips.some((t) => t.category === "progression" && /Bench Press/.test(t.title))).toBe(true);
    expect(tips.every((t) => t.title && t.detail)).toBe(true);
  });

  it("warns about sharp volume jumps", () => {
    const rows = [
      set("2026-08-04", "Bench Press", 10, 50), // week of 3 Aug (prev)
      ...Array.from({ length: 6 }, () => set("2026-08-11", "Bench Press", 10, 50)), // week of 10 Aug (last)
      set("2026-08-18", "Bench Press", 10, 50),
    ];
    expect(tipsFor(rows).some((t) => /jumped/i.test(t.title))).toBe(true);
  });
});
