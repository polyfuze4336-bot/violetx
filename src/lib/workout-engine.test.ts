import { describe, expect, it } from "vitest";

import {
  describeProgression,
  detectSetPrs,
  prDetail,
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

describe("rep progression (live set PRs)", () => {
  const hist = (...sets: [number, number][]): LoggedSet[] => sets.map(([weightKg, reps]) => ({ date: "2026-08-01", weightKg, reps, sessionId: "old" }));
  const types = (r: ReturnType<typeof detectSetPrs>) => r.map((p) => p.type);

  it("case 1: 80x8 -> 80x10 is a REP PR with +2 reps context", () => {
    const prs = detectSetPrs({ set: { weightKg: 80, reps: 10 }, priorHistory: hist([80, 8]), sessionSetsSoFar: [] });
    expect(types(prs)).toContain("REPS");
    const rep = prs.find((p) => p.type === "REPS")!;
    expect(rep).toMatchObject({ value: 10, previous: 8, weightKg: 80 });
    expect(prDetail(rep)).toBe("+2 reps at 80 kg (previous best 8)");
    expect(types(prs)).not.toContain("WEIGHT");
  });

  it("case 2: 80x10 -> 80x8 is not a rep PR", () => {
    expect(types(detectSetPrs({ set: { weightKg: 80, reps: 8 }, priorHistory: hist([80, 10]), sessionSetsSoFar: [] }))).not.toContain("REPS");
  });

  it("case 3: 80x8 -> 82.5x8 stays a weight PR (existing behaviour intact)", () => {
    const prs = detectSetPrs({ set: { weightKg: 82.5, reps: 8 }, priorHistory: hist([80, 8]), sessionSetsSoFar: [] });
    expect(types(prs)).toContain("WEIGHT");
    expect(types(prs)).not.toContain("REPS");
    expect(prDetail(prs.find((p) => p.type === "WEIGHT")!)).toBe("+2.5 kg (previous best 80 kg)");
  });

  it("case 4: 80x8 -> 82.5x10 is a weight PR with no cross-load rep PR", () => {
    const prs = detectSetPrs({ set: { weightKg: 82.5, reps: 10 }, priorHistory: hist([80, 8]), sessionSetsSoFar: [] });
    expect(types(prs)).toContain("WEIGHT");
    expect(types(prs)).not.toContain("REPS");
  });

  it("case 5: 100x10 history, then 60x15 is NOT reported as a rep PR", () => {
    const prs = detectSetPrs({ set: { weightKg: 60, reps: 15 }, priorHistory: hist([100, 10]), sessionSetsSoFar: [] });
    expect(types(prs)).not.toContain("REPS");
    expect(prs).toEqual([]);
  });

  it("case 5b: a PR at 60 kg compares only with 60 kg history", () => {
    const prs = detectSetPrs({ set: { weightKg: 60, reps: 18 }, priorHistory: hist([100, 10], [60, 15]), sessionSetsSoFar: [] });
    expect(prs.find((p) => p.type === "REPS")).toMatchObject({ previous: 15, value: 18, weightKg: 60 });
  });

  it("case 6: 80x10, 80x9, 80x8 after 3x80x8 celebrates the rep PR once", () => {
    const prior = hist([80, 8], [80, 8], [80, 8]);
    const soFar: { weightKg: number; reps: number }[] = [];
    const repPrs: number[] = [];
    for (const reps of [10, 9, 8]) {
      const prs = detectSetPrs({ set: { weightKg: 80, reps }, priorHistory: prior, sessionSetsSoFar: soFar });
      if (types(prs).includes("REPS")) repPrs.push(reps);
      soFar.push({ weightKg: 80, reps });
    }
    expect(repPrs).toEqual([10]);
  });

  it("tolerates equal loads written differently (82.5 vs 82.50)", () => {
    const prs = detectSetPrs({ set: { weightKg: 82.5, reps: 8 }, priorHistory: hist([82.50, 6]), sessionSetsSoFar: [] });
    expect(types(prs)).toContain("REPS");
  });

  it("a load never done before is not a rep PR even if lighter", () => {
    expect(types(detectSetPrs({ set: { weightKg: 70, reps: 20 }, priorHistory: hist([80, 8]), sessionSetsSoFar: [] }))).not.toContain("REPS");
  });
});

describe("describeProgression (load vs rep progression)", () => {
  const w = (weightKg: number, reps: number) => ({ weightKg, reps });

  it("recognises more reps at the same weight as progress", () => {
    const p = describeProgression([w(80, 8), w(80, 8)], [w(80, 10), w(80, 9)]);
    expect(p.reps).toEqual({ weightKg: 80, from: 8, to: 10, delta: 2 });
    expect(p.load).toBeNull();
  });

  it("recognises a heavier top set as load progression", () => {
    const p = describeProgression([w(77.5, 8)], [w(80, 8)]);
    expect(p.load).toEqual({ fromKg: 77.5, toKg: 80, deltaKg: 2.5 });
    expect(p.reps).toBeNull();
  });

  it("reports both when both happened, without duplicating", () => {
    const p = describeProgression([w(77.5, 8), w(80, 6)], [w(82.5, 6), w(80, 8)]);
    expect(p.load?.deltaKg).toBe(2.5);
    expect(p.reps).toEqual({ weightKg: 80, from: 6, to: 8, delta: 2 });
  });

  it("does not compare reps across different loads", () => {
    expect(describeProgression([w(100, 10)], [w(60, 15)])).toEqual({ load: null, reps: null });
    const p = describeProgression([w(80, 8)], [w(82.5, 10)]);
    expect(p.load?.deltaKg).toBe(2.5);
    expect(p.reps).toBeNull();
  });

  it("shows no progress for equal or worse sessions", () => {
    expect(describeProgression([w(80, 8)], [w(80, 8)])).toEqual({ load: null, reps: null });
    expect(describeProgression([w(80, 10)], [w(80, 8)])).toEqual({ load: null, reps: null });
    expect(describeProgression([], [w(80, 8)])).toEqual({ load: null, reps: null });
  });
});
