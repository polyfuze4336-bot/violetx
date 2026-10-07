import { describe, expect, it } from "vitest";

import {
  detectSetPrs,
  exerciseBests,
  summarizeSessions,
  suggestProgression,
  type LoggedSet,
} from "@/lib/workout-engine";

const s = (date: string, weightKg: number, reps: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  date,
  weightKg,
  reps,
  ...extra,
});

describe("summarizeSessions / exerciseBests", () => {
  const history = [
    s("2026-08-01", 80, 8),
    s("2026-08-01", 80, 8),
    s("2026-08-01", 40, 12, { setType: "WARMUP" }),
    s("2026-08-08", 82.5, 6),
  ];

  it("ignores warm-ups and groups by session, newest first", () => {
    const sessions = summarizeSessions(history);
    expect(sessions.map((x) => x.date)).toEqual(["2026-08-08", "2026-08-01"]);
    expect(sessions[1].sets).toHaveLength(2);
    expect(sessions[1].volumeKg).toBe(1280);
  });

  it("computes bests", () => {
    const b = exerciseBests(history);
    expect(b.maxWeightKg).toBe(82.5);
    expect(b.bestSessionVolumeKg).toBe(1280);
    expect(b.sessions).toBe(2);
    expect(b.maxE1rm).toBeGreaterThan(98);
  });
});

describe("detectSetPrs", () => {
  const prior = [s("2026-08-01", 80, 8), s("2026-08-01", 80, 8), s("2026-08-01", 80, 7)];

  it("treats the first performance as a baseline, not a PR", () => {
    expect(detectSetPrs({ set: { weightKg: 60, reps: 10 }, priorHistory: [], sessionSetsSoFar: [] })).toEqual([]);
  });

  it("detects a weight PR and the matching estimated 1RM PR", () => {
    const prs = detectSetPrs({ set: { weightKg: 82.5, reps: 8 }, priorHistory: prior, sessionSetsSoFar: [] });
    const types = prs.map((p) => p.type);
    expect(types).toContain("WEIGHT");
    expect(types).toContain("E1RM");
    const w = prs.find((p) => p.type === "WEIGHT")!;
    expect(w.previous).toBe(80);
    expect(w.deltaPct).toBe(3.1);
  });

  it("detects a rep PR at the same weight", () => {
    const prs = detectSetPrs({ set: { weightKg: 80, reps: 9 }, priorHistory: prior, sessionSetsSoFar: [] });
    expect(prs.find((p) => p.type === "REPS")).toMatchObject({ value: 9, previous: 8 });
  });

  it("does not flag a lighter, equal or worse set", () => {
    expect(detectSetPrs({ set: { weightKg: 80, reps: 8 }, priorHistory: prior, sessionSetsSoFar: [] })).toEqual([]);
    expect(detectSetPrs({ set: { weightKg: 70, reps: 8 }, priorHistory: prior, sessionSetsSoFar: [] })).toEqual([]);
  });

  it("never awards PRs for warm-up sets", () => {
    expect(
      detectSetPrs({ set: { weightKg: 200, reps: 5, setType: "WARMUP" }, priorHistory: prior, sessionSetsSoFar: [] })
    ).toEqual([]);
  });

  it("detects a volume PR across the session", () => {
    const prs = detectSetPrs({
      set: { weightKg: 80, reps: 8 },
      priorHistory: prior,
      sessionSetsSoFar: [
        { weightKg: 80, reps: 8 },
        { weightKg: 80, reps: 8 },
      ],
    });
    expect(prs.find((p) => p.type === "VOLUME")).toMatchObject({ value: 1920, previous: 1840 });
  });
});

describe("suggestProgression", () => {
  it("asks for a baseline without history", () => {
    const sug = suggestProgression([]);
    expect(sug.kind).toBe("baseline");
    expect(sug.weightKg).toBeNull();
  });

  it("adds load after topping the range in the previous two sessions", () => {
    const history = [
      s("2026-08-01", 80, 10), s("2026-08-01", 80, 10), s("2026-08-01", 80, 10),
      s("2026-08-08", 80, 10), s("2026-08-08", 80, 10), s("2026-08-08", 80, 10),
    ];
    const sug = suggestProgression(history, { repMin: 6, repMax: 10 });
    expect(sug).toMatchObject({ kind: "increase_weight", weightKg: 82.5 });
    expect(sug.rationale).toMatch(/previous two sessions/);
  });

  it("adds reps when the top of the range was not reached", () => {
    const sug = suggestProgression([s("2026-08-08", 80, 8), s("2026-08-08", 80, 8), s("2026-08-08", 80, 7)]);
    expect(sug).toMatchObject({ kind: "add_reps", weightKg: 80 });
    expect(sug.rationale).toMatch(/9 reps/);
  });

  it("holds the load when effort was very high", () => {
    const history = [s("2026-08-08", 80, 10, { rpe: 10 }), s("2026-08-08", 80, 10, { rpe: 9.5 })];
    expect(suggestProgression(history).kind).toBe("repeat");
  });

  it("suggests a reduction after missing the bottom of the range twice", () => {
    const history = [
      s("2026-08-01", 100, 4), s("2026-08-08", 100, 5),
    ];
    const sug = suggestProgression(history, { repMin: 6, repMax: 10 });
    expect(sug.kind).toBe("reduce");
    expect(sug.weightKg).toBeLessThan(100);
  });

  it("ignores warm-up sets when judging performance", () => {
    const history = [s("2026-08-08", 100, 3, { setType: "WARMUP" }), s("2026-08-08", 60, 10), s("2026-08-08", 60, 10)];
    expect(suggestProgression(history).kind).toBe("increase_weight");
  });
});
