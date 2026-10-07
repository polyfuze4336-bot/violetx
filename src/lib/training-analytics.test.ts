import { describe, expect, it } from "vitest";

import {
  addPeriods,
  buildProgressMatrix,
  buildExerciseSeries,
  setsPerDay,
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

describe("history series", () => {
  const rows = [
    set("2026-08-01", "Bench Press", 8, 60),
    set("2026-08-01", "Bench Press", 5, 70, { sets: 2 }),
    set("2026-08-08", "Bench Press", 8, 65),
  ];

  it("builds heaviest set and est. strength per day", () => {
    const [s] = buildExerciseSeries(rows);
    expect(s.points.map((p) => p.date)).toEqual(["2026-08-01", "2026-08-08"]);
    expect(s.points[0].maxWeightKg).toBe(70);
    expect(s.points[1].maxWeightKg).toBe(65);
  });

  it("counts sets per day for the heatmap", () => {
    expect(setsPerDay(rows)).toEqual({ "2026-08-01": 3, "2026-08-08": 1 });
  });
});

describe("buildProgressMatrix", () => {
  const now = new Date("2026-09-20T10:00:00Z");
  const rows = [
    set("2026-06-05", "Chest Press (Machine)", 5, 23),
    set("2026-07-05", "Chest Press (Machine)", 8, 32),
    set("2026-08-05", "Chest Press (Machine)", 12, 36),
    set("2026-09-05", "Chest Press (Machine)", 3, 41),
    set("2026-09-06", "Chest Press (Machine)", 10, 30),
    set("2026-06-05", "Assisted Chin-Up", 3, 40.8),
    set("2026-09-05", "Assisted Chin-Up", 12, 34),
    set("2026-07-10", "Lat Pulldown", 6, 52),
  ];
  const m = buildProgressMatrix(rows, "month", 4, now);
  const byName = Object.fromEntries(m.rows.map((r) => [r.name, r]));

  it("lays out months and picks the heaviest set per month", () => {
    expect(m.columns.map((c) => c.label)).toEqual(["June 2026", "July 2026", "August 2026", "September 2026"]);
    const chest = byName["Chest Press (Machine)"];
    expect(chest.cells[3]).toMatchObject({ weightKg: 41, reps: 3, isPr: true });
    expect(chest.cells[2]).toMatchObject({ weightKg: 36, reps: 12, isPr: false, improved: true });
  });

  it("computes the overall trend and baselines", () => {
    expect(byName["Chest Press (Machine)"].trend).toEqual({ kind: "up", deltaKg: 18, pct: 78 });
    expect(byName["Lat Pulldown"].trend.kind).toBe("baseline");
    expect(byName["Lat Pulldown"].cells[1]?.isPr).toBe(true);
  });

  it("treats less assistance as improvement", () => {
    const chin = byName["Assisted Chin-Up"];
    expect(chin.trend.kind).toBe("up");
    expect(chin.cells[3]?.isPr).toBe(true);
  });

  it("counts PRs per column", () => {
    expect(m.columns[3].prs).toBe(2); // chest press + chin-up
    expect(m.columns[1].prs).toBe(1); // lat pulldown
  });
});

describe("progress matrix: rep progression", () => {
  const now = new Date("2026-09-20T10:00:00Z");
  const rows = [
    set("2026-07-05", "Bench Press", 8, 80),
    set("2026-08-05", "Bench Press", 10, 80),
    set("2026-07-05", "Squat", 5, 100),
    set("2026-08-05", "Squat", 5, 100),
  ];
  const m = buildProgressMatrix(rows, "month", 3, now);
  const byName = Object.fromEntries(m.rows.map((r) => [r.name, r]));

  it("marks more reps at the same load as improvement with the rep gain", () => {
    const bench = byName["Bench Press"];
    expect(bench.cells[1]).toMatchObject({ improved: true, repDelta: 2 });
    expect(bench.trend).toMatchObject({ kind: "reps", repDelta: 2, atKg: 80 });
  });

  it("an unchanged lift is still 'holding steady'", () => {
    expect(byName["Squat"].trend.kind).toBe("flat");
    expect(byName["Squat"].cells[1]).toMatchObject({ improved: null, repDelta: null });
  });
});
