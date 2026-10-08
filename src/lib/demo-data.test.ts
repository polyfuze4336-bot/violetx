import { describe, expect, it } from "vitest";

import { detectPrEvents } from "@/lib/analytics";
import { detectE1rmPrs } from "@/lib/coach-view";
import {
  BENCH_MILESTONES,
  CHIN_MILESTONES,
  SQUAT_MILESTONES,
  buildDemoDataset,
  type DemoBranch,
  type DemoDataset,
  type Milestone,
} from "@/lib/demo-data";
import { detectSetPrs, type LoggedSet } from "@/lib/workout-engine";

const TODAY = new Date("2026-10-08T00:00:00Z");
const BRANCHES: DemoBranch[] = Array.from({ length: 40 }, (_, i) => ({
  id: `branch-${i}`,
  name: `Branch ${String(i).padStart(2, "0")}`,
  state: ["Selangor", "Johor", "Penang", "Kuala Lumpur"][i % 4],
}));

const build = (today = TODAY, branches = BRANCHES) => buildDemoDataset({ athleteId: "demo-athlete", userId: "demo-user", branches, today });
const data = build();

const num = (v: unknown) => Number(v);
const day = (v: unknown) => (v as Date).toISOString().slice(0, 10);

/** The first working set of an exercise per session, in date order. */
function topSets(d: DemoDataset, name: string) {
  const exId = d.exercises.find((e) => e.name === name)!.id as string;
  const bySession = new Map<string, { date: string; weightKg: number; reps: number }>();
  for (const s of d.sets) {
    if (s.exerciseId !== exId || s.setType !== "WORK") continue;
    if (!bySession.has(s.sessionId as string)) bySession.set(s.sessionId as string, { date: day(s.date), weightKg: num(s.weightKg), reps: s.reps });
  }
  return Array.from(bySession.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Distinct consecutive "weight × reps" values of the top set. */
function sequence(d: DemoDataset, name: string) {
  const out: string[] = [];
  for (const s of topSets(d, name)) {
    const label = `${s.weightKg}x${s.reps}`;
    if (out[out.length - 1] !== label) out.push(label);
  }
  return out;
}

const label = (ms: Milestone[]) => ms.map((m) => `${m.weightKg}x${m.reps}`);

describe("demo dataset: history shape", () => {
  it("covers about 4-6 months of fictional history", () => {
    const dates = data.sessions.map((s) => (s.date as Date).getTime()).sort();
    const spanDays = (dates[dates.length - 1] - dates[0]) / 86_400_000;
    expect(spanDays).toBeGreaterThan(120);
    expect(spanDays).toBeLessThan(180);
    expect(new Date(dates[dates.length - 1]).getTime()).toBeLessThanOrEqual(TODAY.getTime());
    expect(data.sessions.length).toBeGreaterThan(45);
    expect(data.sets.length).toBeGreaterThan(600);
  });

  it("populates every area the app shows", () => {
    expect(data.bodyWeights.length).toBeGreaterThan(80);
    expect(data.measurementTypes.map((m) => m.name)).toEqual(["Waist", "Chest", "Hips", "Thigh", "Upper Arm"]);
    expect(data.measurements.length).toBeGreaterThan(60);
    expect(data.nutrition.length).toBeGreaterThan(90);
    expect(data.checkIns.length).toBeGreaterThan(70);
    expect(data.programs.some((p) => p.isActive)).toBe(true);
    expect(data.programs.some((p) => p.archived)).toBe(true);
    expect(data.templates.length).toBe(6);
    expect(data.goals.map((g) => g.status)).toEqual(expect.arrayContaining(["ACTIVE", "ACHIEVED"]));
    expect(data.notes.length).toBeGreaterThan(2);
    expect(data.aiProposals).toHaveLength(1);
    expect(new Set(data.gymVisits.map((v) => v.gymBranchId)).size).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic and has unique ids and valid relations", () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(data));
    for (const [name, rows] of Object.entries(data)) {
      if (!Array.isArray(rows)) continue;
      const ids = (rows as { id: string }[]).map((r) => r.id);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
    const exIds = new Set(data.exercises.map((e) => e.id));
    const sessionIds = new Set(data.sessions.map((s) => s.id));
    const weIds = new Set(data.workoutExercises.map((w) => w.id));
    for (const s of data.sets) {
      expect(exIds.has(s.exerciseId)).toBe(true);
      expect(sessionIds.has(s.sessionId as string)).toBe(true);
      expect(weIds.has(s.workoutExerciseId as string)).toBe(true);
    }
    const typeIds = new Set(data.measurementTypes.map((m) => m.id));
    expect(data.measurements.every((m) => typeIds.has(m.typeId))).toBe(true);
    expect(data.sets.every((s) => s.athleteId === "demo-athlete")).toBe(true);
  });

  it("re-anchors to the seed day (history always ends 'now')", () => {
    const later = build(new Date("2027-02-01T00:00:00Z"));
    const last = Math.max(...later.sessions.map((s) => (s.date as Date).getTime()));
    expect(last).toBeLessThanOrEqual(new Date("2027-02-01T00:00:00Z").getTime());
    expect(last).toBeGreaterThan(new Date("2027-01-20T00:00:00Z").getTime());
  });

  it("still seeds everything else when no gym branches exist", () => {
    const none = build(TODAY, []);
    expect(none.gymVisits).toHaveLength(0);
    expect(none.sessions.every((s) => s.gymBranchId === null)).toBe(true);
    expect(none.sets.length).toBe(data.sets.length);
  });
});

describe("demo dataset: featured strength progression", () => {
  it("Bench Press: 70x8 -> 72.5x8 -> 75x8 -> 75x10 -> 77.5x8 -> 80x8", () => {
    expect(sequence(data, "Barbell Bench Press")).toEqual(label(BENCH_MILESTONES));
  });
  it("Assisted Chin-Up: 45x8 -> 40x8 -> 40x10 -> 35x8 -> 30x8 -> 25x10 (assistance)", () => {
    expect(sequence(data, "Assisted Chin-Up")).toEqual(label(CHIN_MILESTONES));
    const chin = data.exercises.find((e) => e.name === "Assisted Chin-Up")!;
    expect(chin.equipment).toBe("Assisted Machine");
  });
  it("Squat: 80x8 -> 85x8 -> 90x6 -> 90x8 -> 95x6", () => {
    expect(sequence(data, "Back Squat")).toEqual(label(SQUAT_MILESTONES));
  });
});

describe("demo dataset: every PR type is present", () => {
  const sets = data.sets.filter((s) => s.setType !== "WARMUP");
  const exName = new Map(data.exercises.map((e) => [e.id as string, e.name as string]));
  const assistedIds = new Set(data.exercises.filter((e) => e.equipment === "Assisted Machine").map((e) => e.id as string));
  const inputs = sets.map((s) => ({
    exerciseId: s.exerciseId,
    exerciseName: exName.get(s.exerciseId)!,
    date: (s.date as Date).toISOString(),
    weightKg: num(s.weightKg),
    reps: s.reps,
    position: s.position ?? 0,
    assisted: assistedIds.has(s.exerciseId),
  }));
  const events = detectPrEvents(inputs);

  it("weight, rep and assistance PRs from history", () => {
    const by = (type: string, name: string) => events.filter((e) => e.type === type && e.exerciseName === name);
    expect(by("WEIGHT", "Barbell Bench Press").map((e) => e.weightKg)).toEqual([80, 77.5, 75, 72.5]);
    expect(by("REPS", "Barbell Bench Press").map((e) => `${e.weightKg}x${e.reps}`)).toContain("75x10");
    expect(by("ASSISTANCE", "Assisted Chin-Up").map((e) => e.weightKg).sort((a, b) => a - b)).toEqual([25, 30, 35, 40]);
    expect(by("REPS", "Assisted Chin-Up").map((e) => `${e.weightKg}x${e.reps}`)).toContain("40x10");
    expect(by("WEIGHT", "Back Squat").length).toBeGreaterThanOrEqual(3);
    expect(by("REPS", "Back Squat").map((e) => `${e.weightKg}x${e.reps}`)).toContain("90x8");
    expect(events.some((e) => e.type === "WEIGHT" && e.exerciseName === "Assisted Chin-Up")).toBe(false);
  });

  it("estimated-1RM PRs for weighted lifts only", () => {
    const e1 = detectE1rmPrs(inputs);
    expect(e1.length).toBeGreaterThan(5);
    expect(e1.some((p) => p.exerciseName === "Assisted Chin-Up")).toBe(false);
  });

  it("volume PRs when the workout engine replays the history", () => {
    const sessionsInOrder = [...data.sessions].sort((a, b) => (a.date as Date).getTime() - (b.date as Date).getTime());
    const kinds = new Set<string>();
    const history = new Map<string, LoggedSet[]>();
    for (const ses of sessionsInOrder) {
      const bySet = data.sets.filter((s) => s.sessionId === ses.id);
      const exIds = Array.from(new Set(bySet.map((s) => s.exerciseId)));
      for (const exId of exIds) {
        const prior = history.get(exId) ?? [];
        const soFar: { weightKg: number; reps: number; setType: string }[] = [];
        for (const s of bySet.filter((x) => x.exerciseId === exId)) {
          const w = { weightKg: num(s.weightKg), reps: s.reps, setType: s.setType as string };
          for (const a of detectSetPrs({ set: w, priorHistory: prior, sessionSetsSoFar: soFar, assisted: assistedIds.has(exId) })) kinds.add(a.type);
          soFar.push(w);
        }
        history.set(exId, [...prior, ...bySet.filter((x) => x.exerciseId === exId).map((s) => ({ date: day(s.date), weightKg: num(s.weightKg), reps: s.reps, setType: s.setType as string, sessionId: ses.id as string }))]);
      }
    }
    for (const t of ["WEIGHT", "REPS", "ASSISTANCE", "E1RM", "VOLUME"]) expect(kinds.has(t), t).toBe(true);
  });
});

describe("demo dataset: believable, non-linear body progress", () => {
  const weights = data.bodyWeights.map((w) => num(w.weightKg));

  it("body weight trends down by roughly 6 kg with normal fluctuation", () => {
    const first = weights.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
    const last = weights.slice(-7).reduce((a, b) => a + b, 0) / 7;
    expect(first - last).toBeGreaterThan(4.5);
    expect(first - last).toBeLessThan(8);
    const ups = weights.slice(1).filter((w, i) => w > weights[i]).length;
    expect(ups / (weights.length - 1)).toBeGreaterThan(0.3);
    expect(Math.min(...weights)).toBeGreaterThan(75);
    expect(Math.max(...weights)).toBeLessThan(90);
  });

  it("is not a straight line (a plateau or bump exists)", () => {
    const monthly = [0, 1, 2, 3, 4].map((m) => {
      const slice = data.bodyWeights.slice(Math.floor((m * weights.length) / 5), Math.floor(((m + 1) * weights.length) / 5)).map((w) => num(w.weightKg));
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
    const drops = monthly.slice(1).map((v, i) => monthly[i] - v);
    expect(Math.max(...drops) - Math.min(...drops)).toBeGreaterThan(0.4);
  });

  it("waist falls gradually", () => {
    const waistId = data.measurementTypes.find((m) => m.name === "Waist")!.id;
    const waist = data.measurements.filter((m) => m.typeId === waistId).map((m) => num(m.value));
    expect(waist[0] - waist[waist.length - 1]).toBeGreaterThan(4);
  });

  it("adherence varies week to week and recovery occasionally dips", () => {
    const perWeek = new Map<string, number>();
    for (const s of data.sessions) {
      const d = s.date as Date;
      const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
      perWeek.set(monday, (perWeek.get(monday) ?? 0) + 1);
    }
    const counts = Array.from(perWeek.values());
    expect(Math.max(...counts) - Math.min(...counts)).toBeGreaterThanOrEqual(2);
    const sleep = data.checkIns.map((c) => num(c.sleepHours));
    expect(Math.min(...sleep)).toBeLessThan(6.2);
    expect(sleep.filter((h) => h >= 7).length).toBeGreaterThan(sleep.length / 2);
  });

  it("only warm-ups are lighter than working sets and values stay realistic", () => {
    for (const s of data.sets) {
      expect(s.reps).toBeGreaterThan(0);
      expect(num(s.weightKg)).toBeGreaterThan(0);
      expect(num(s.weightKg)).toBeLessThan(250);
    }
    expect(data.sets.some((s) => s.setType === "WARMUP")).toBe(true);
  });

  it("contains no real personal data", () => {
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/@(?!violetx\.demo)/);
    expect(data.athlete.displayName).toBe("Demo Athlete");
  });
});

