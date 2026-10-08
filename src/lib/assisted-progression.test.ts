import { describe, expect, it } from "vitest";

import { detectPrEvents, prEventDetail, type PrInputSet } from "@/lib/analytics";
import { STARTER_EXERCISES } from "@/lib/exercise-library";
import { ASSISTED_EQUIPMENT, isAssistedExercise, progressionTypeOf } from "@/lib/progression-type";
import { buildExerciseSeries, buildProgressMatrix, summarizeExercises, type TrainingSet } from "@/lib/training-analytics";
import {
  answerFromSnapshot,
  buildInsightSnapshot,
  progressionSentence,
  progressionText,
  recentProgressions,
  usesOnlyKnownNumbers,
  type InsightInput,
} from "@/lib/violet-insights";
import {
  describeProgression,
  detectSetPrs,
  exerciseBests,
  prDetail,
  suggestProgression,
  summarizeSessions,
  type LoggedSet,
} from "@/lib/workout-engine";

const h = (date: string, weightKg: number, reps: number): LoggedSet => ({ date, weightKg, reps });
const types = (r: ReturnType<typeof detectSetPrs>) => r.map((a) => a.type);

/** Log one set against a single earlier session (e.g. 40 kg × 8). */
function check(prior: [number, number], next: [number, number], assisted: boolean) {
  return detectSetPrs({
    set: { weightKg: next[0], reps: next[1] },
    priorHistory: [h("2026-08-01", prior[0], prior[1])],
    sessionSetsSoFar: [],
    assisted,
  });
}

describe("progression type metadata", () => {
  it("reads assisted from equipment first, then the exercise name", () => {
    expect(progressionTypeOf({ name: "Chin-Up", equipment: ASSISTED_EQUIPMENT })).toBe("ASSISTED");
    expect(progressionTypeOf({ name: "Dip Assisted" })).toBe("ASSISTED");
    expect(progressionTypeOf({ name: "Assisted Pull-Up", equipment: null })).toBe("ASSISTED");
    expect(progressionTypeOf({ name: "Bench Press", equipment: "Barbell" })).toBe("WEIGHTED");
    expect(progressionTypeOf(null)).toBe("WEIGHTED");
    expect(isAssistedExercise({ name: "Squat" })).toBe(false);
  });

  it("ships the three canonical assisted exercises and keeps weighted Pull-Up / Dip weighted", () => {
    const byName = new Map(STARTER_EXERCISES.map((e) => [e.name, e]));
    for (const name of ["Assisted Chin-Up", "Assisted Pull-Up", "Assisted Dip"]) {
      const ex = byName.get(name);
      expect(ex, name).toBeDefined();
      expect(isAssistedExercise({ name: ex!.name, equipment: ex!.equipment })).toBe(true);
    }
    for (const name of ["Pull-Up", "Dip"]) {
      const ex = byName.get(name)!;
      expect(isAssistedExercise({ name: ex.name, equipment: ex.equipment })).toBe(false);
      expect(ex.aliases?.some((a) => /assist/i.test(a))).toBeFalsy();
    }
  });
});

describe("assisted exercises: live PRs", () => {
  it("40 → 35 kg assistance at 8 reps is an Assistance PR", () => {
    const prs = check([40, 8], [35, 8], true);
    expect(types(prs)).toEqual(["ASSISTANCE"]);
    expect(prs[0].label).toBe("Assistance PR");
    expect(prDetail(prs[0])).toBe("5 kg less assistance (40 → 35 kg)");
    expect(prDetail(prs[0])).not.toMatch(/-5/);
  });

  it("35 kg × 8 → 35 kg × 10 is a Rep PR at the same assistance", () => {
    const prs = check([35, 8], [35, 10], true);
    expect(types(prs)).toEqual(["REPS"]);
    expect(prDetail(prs[0])).toBe("+2 reps at 35 kg assistance (previous best 8)");
  });

  it("35 × 8 → 30 × 10 is an Assistance PR; reps are reported on the progression, with no duplicate achievement", () => {
    const prs = check([35, 8], [30, 10], true);
    expect(types(prs)).toEqual(["ASSISTANCE"]);
    const p = describeProgression([{ weightKg: 35, reps: 8 }], [{ weightKg: 30, reps: 10 }], true);
    expect(p.assisted).toBe(true);
    expect(p.load).toMatchObject({ fromKg: 35, toKg: 30, deltaKg: 5, topReps: { from: 8, to: 10, delta: 2 } });
  });

  it("30 → 35 kg assistance (more help) is not an Assistance PR", () => {
    expect(check([30, 8], [35, 8], true)).toEqual([]);
  });

  it("30 kg × 10 → 30 kg × 8 is not a Rep PR", () => {
    expect(check([30, 10], [30, 8], true)).toEqual([]);
  });

  it("never reports estimated 1RM or volume PRs for assistance", () => {
    const prs = detectSetPrs({
      set: { weightKg: 25, reps: 12 },
      priorHistory: [h("2026-08-01", 30, 8)],
      sessionSetsSoFar: [{ weightKg: 25, reps: 10 }],
      assisted: true,
    });
    expect(types(prs)).toEqual(["ASSISTANCE"]);
  });

  it("assisted bests use the lowest assistance", () => {
    const history = [h("2026-08-01", 40, 8), h("2026-08-08", 30, 8)];
    expect(exerciseBests(history, true).maxWeightKg).toBe(30);
    expect(summarizeSessions(history, true)[0]).toMatchObject({ topWeightKg: 30, volumeKg: 0, bestE1rm: 0 });
  });
});

describe("weighted exercises are unchanged", () => {
  it("higher weight is still a Weight PR / load progression", () => {
    expect(types(check([80, 8], [82.5, 8], false))).toEqual(["WEIGHT", "E1RM"]);
    expect(types(check([82.5, 8], [80, 8], false))).toEqual([]);
    const up = describeProgression([{ weightKg: 80, reps: 8 }], [{ weightKg: 82.5, reps: 8 }]);
    expect(up.load).toEqual({ fromKg: 80, toKg: 82.5, deltaKg: 2.5 });
    expect(up.assisted).toBeUndefined();
    expect(describeProgression([{ weightKg: 82.5, reps: 8 }], [{ weightKg: 80, reps: 8 }]).load).toBeNull();
  });

  it("lower weight is not an improvement for a normal squat", () => {
    expect(describeProgression([{ weightKg: 100, reps: 5 }], [{ weightKg: 90, reps: 5 }]).load).toBeNull();
  });
});

describe("assisted exercises: history PR events", () => {
  const set = (date: string, weightKg: number, reps: number, position = 0): PrInputSet => ({
    exerciseId: "chin",
    exerciseName: "Assisted Chin-Up",
    date,
    weightKg,
    reps,
    position,
    assisted: true,
  });

  it("detects assistance PRs and same-load rep PRs without duplicates", () => {
    const events = detectPrEvents([
      set("2026-08-01", 40, 8),
      set("2026-08-08", 35, 8),
      set("2026-08-15", 35, 7), // worse: nothing
      set("2026-08-22", 30, 8),
      set("2026-08-29", 30, 10),
      set("2026-09-05", 35, 12), // more assistance: no assistance PR, and no rep PR beating 35 × 8? (12 > 8 at 35 kg)
    ]);
    const summary = events.map((e) => `${e.date.slice(5, 10)} ${e.type} ${e.weightKg}x${e.reps}`).sort();
    expect(summary).toEqual([
      "08-08 ASSISTANCE 35x8",
      "08-22 ASSISTANCE 30x8",
      "08-29 REPS 30x10",
      "09-05 REPS 35x12",
    ]);
    const first = events.find((e) => e.date.startsWith("2026-08-08"))!;
    expect(prEventDetail(first)).toEqual({ label: "Assistance PR", detail: "5 kg less assistance (40 → 35 kg)" });
    const reps = events.find((e) => e.date.startsWith("2026-08-29"))!;
    expect(prEventDetail(reps)).toEqual({ label: "Rep PR", detail: "+2 reps at 30 kg assistance" });
  });

  it("collapses several improving sets on one day into one achievement", () => {
    const events = detectPrEvents([
      set("2026-08-01", 40, 8),
      set("2026-08-08", 35, 8, 0),
      set("2026-08-08", 30, 8, 1),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "ASSISTANCE", weightKg: 30, prevWeightKg: 40 });
  });

  it("treats the same data as WEIGHT PRs when the exercise is not assisted", () => {
    const events = detectPrEvents([
      { ...set("2026-08-01", 40, 8), assisted: false },
      { ...set("2026-08-08", 35, 8), assisted: false },
    ]);
    expect(events).toEqual([]);
  });
});

describe("assisted exercises: suggestions", () => {
  it("lowers the assistance (never raises it) after topping the rep range", () => {
    const history = [
      h("2026-08-01", 30, 10),
      h("2026-08-01", 30, 10),
      h("2026-08-08", 30, 10),
      h("2026-08-08", 30, 10),
    ];
    const s = suggestProgression(history, { assisted: true });
    expect(s.kind).toBe("reduce_assistance");
    expect(s.weightKg).toBe(27.5);
    expect(s.rationale).toMatch(/less assistance/);
  });

  it("adds reps first", () => {
    const s = suggestProgression([h("2026-08-08", 30, 7), h("2026-08-08", 30, 8)], { assisted: true });
    expect(s.kind).toBe("add_reps");
    expect(s.weightKg).toBe(30);
  });
});

describe("assisted exercises: charts and tables", () => {
  const row = (date: string, weightKg: number, reps: number, assisted = true): TrainingSet => ({
    date,
    exerciseId: "chin",
    exerciseName: "Machine Chin",
    muscleGroup: "Back",
    reps,
    weightKg,
    sets: null,
    assisted,
  });

  it("uses the metadata flag, not the exercise name", () => {
    const now = new Date("2026-09-20T10:00:00Z");
    const m = buildProgressMatrix([row("2026-07-05", 40, 8), row("2026-08-05", 35, 8), row("2026-09-05", 25, 8)], "month", 3, now);
    expect(m.rows[0].assisted).toBe(true);
    expect(m.rows[0].trend.kind).toBe("up");
    expect(m.rows[0].cells[2]).toMatchObject({ weightKg: 25, isPr: true, improved: true });
  });

  it("series keep the lowest assistance per day and no estimated strength", () => {
    const [s] = buildExerciseSeries([row("2026-08-01", 35, 8), row("2026-08-01", 30, 6), row("2026-08-08", 25, 8)]);
    expect(s.assisted).toBe(true);
    expect(s.points.map((p) => p.maxWeightKg)).toEqual([30, 25]);
    expect(s.points.every((p) => p.e1rm === 0)).toBe(true);
  });

  it("flags assisted exercises as progressing from assistance, not estimated strength", () => {
    const now = new Date("2026-09-20T10:00:00Z");
    const rows = [
      row("2026-08-01", 40, 8),
      row("2026-08-08", 40, 8),
      row("2026-08-15", 40, 8),
      row("2026-09-05", 35, 8),
      row("2026-09-12", 30, 8),
      row("2026-09-19", 25, 8),
    ];
    const [e] = summarizeExercises(rows, now);
    expect(e.assisted).toBe(true);
    expect(e.status).toBe("progressing");
    expect(e.latestE1rm).toBe(0);
  });
});

describe("Violet understands assisted progression", () => {
  const NOW = new Date("2026-08-31T10:00:00Z");
  const row = (date: string, weightKg: number, reps: number) => ({ date, exerciseName: "Assisted Chin-Up", weightKg, reps });
  const base = {
    now: NOW,
    windowDays: 30,
    weights: [],
    waist: [],
    workouts: 3,
    workoutsPerWeek: 1,
    prCount: 1,
    consistencyPct: null,
    adherencePct: null,
    avgSessionRpe: null,
    e1rm: [],
    nutrition: [],
    goals: [],
    readinessAvg7d: null,
    noteCount: 0,
  } satisfies InsightInput;

  it("40 kg → 25 kg assistance at 8 reps reads as improvement, not a lighter load", () => {
    const prog = recentProgressions([row("2026-08-10", 40, 8), row("2026-08-24", 25, 8)], NOW, 30);
    expect(prog).toEqual([
      { lift: "Assisted Chin-Up", kind: "ASSISTANCE", weightKg: 25, from: 40, to: 25, delta: 15, assisted: true, reps: { from: 8, to: 8 } },
    ]);
    expect(progressionSentence(prog[0])).toBe(
      "Your assisted chin-up improved from 40 kg assistance to 25 kg assistance while maintaining 8 reps."
    );
    expect(progressionText(prog[0])).toBe("Assisted Chin-Up: assistance 40 → 25 kg (15 kg less assistance)");

    const snap = buildInsightSnapshot({ ...base, progressions: prog });
    const answer = answerFromSnapshot("strength", snap);
    expect(answer).toContain("improved from 40 kg assistance to 25 kg assistance");
    expect(answer).not.toMatch(/decreased|no improvement/i);
    expect(usesOnlyKnownNumbers("Your chin-up went from 40 kg assistance to 25 kg assistance.", snap)).toBe(true);
  });

  it("recognises more reps at the same assistance and respects exercise metadata", () => {
    const rows = [
      { date: "2026-08-10", exerciseName: "Machine Chin", weightKg: 30, reps: 8 },
      { date: "2026-08-24", exerciseName: "Machine Chin", weightKg: 30, reps: 10 },
    ];
    const prog = recentProgressions(rows, NOW, 30, new Set(["Machine Chin"]));
    expect(prog).toEqual([{ lift: "Machine Chin", kind: "REPS", weightKg: 30, from: 8, to: 10, delta: 2, assisted: true }]);
    expect(progressionSentence(prog[0])).toBe("Your machine chin improved from 8 to 10 reps at 30 kg assistance.");
  });

  it("keeps weighted lifts as load progression", () => {
    const prog = recentProgressions(
      [
        { date: "2026-08-10", exerciseName: "Bench Press", weightKg: 77.5, reps: 8 },
        { date: "2026-08-24", exerciseName: "Bench Press", weightKg: 80, reps: 8 },
      ],
      NOW,
      30
    );
    expect(prog).toEqual([{ lift: "Bench Press", kind: "LOAD", weightKg: 80, from: 77.5, to: 80, delta: 2.5 }]);
  });
});
