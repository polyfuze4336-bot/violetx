import { describe, expect, it } from "vitest";

import {
  computeSeriesStats,
  detectPrEvents,
  prEventDetail,
  filterPointsByRange,
  type PrInputSet,
} from "@/lib/analytics";

describe("computeSeriesStats", () => {
  it("computes trend statistics for a waist series", () => {
    const stats = computeSeriesStats([
      { date: "2026-06-01", value: 41.7 },
      { date: "2026-07-01", value: 39.0 },
      { date: "2026-08-16", value: 38.5 },
    ]);
    expect(stats).not.toBeNull();
    expect(stats!.starting).toBe(41.7);
    expect(stats!.latest).toBe(38.5);
    expect(stats!.deltaStart).toBeCloseTo(-3.2, 5);
    expect(stats!.deltaPrev).toBeCloseTo(-0.5, 5);
    expect(stats!.lowest).toBe(38.5);
    expect(stats!.highest).toBe(41.7);
    expect(stats!.trend).toBe("down");
  });

  it("returns null for an empty series", () => {
    expect(computeSeriesStats([])).toBeNull();
  });
});

describe("filterPointsByRange", () => {
  const now = new Date("2026-08-16T00:00:00Z");
  const points = [
    { date: "2025-09-01", value: 1 },
    { date: "2026-06-01", value: 2 },
    { date: "2026-08-01", value: 3 },
  ];

  it("keeps everything for ALL", () => {
    expect(filterPointsByRange(points, "ALL", now)).toHaveLength(3);
  });
  it("filters to the last 3 months", () => {
    const r = filterPointsByRange(points, "3M", now);
    expect(r.map((p) => p.value)).toEqual([2, 3]);
  });
  it("filters to the last month", () => {
    const r = filterPointsByRange(points, "1M", now);
    expect(r.map((p) => p.value)).toEqual([3]);
  });
});

describe("detectPrEvents", () => {
  const base = { exerciseId: "e1", exerciseName: "Hip Abduction", position: 0 };

  it("detects a new maximum weight (43x12 -> 50x9)", () => {
    const sets: PrInputSet[] = [
      { ...base, date: "2026-08-10", weightKg: 43, reps: 12 },
      { ...base, date: "2026-08-16", weightKg: 50, reps: 9 },
    ];
    const events = detectPrEvents(sets);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "WEIGHT",
      weightKg: 50,
      reps: 9,
      prevWeightKg: 43,
      prevReps: 12,
    });
  });

  it("detects a rep PR at the same weight (50x9 -> 50x12)", () => {
    const sets: PrInputSet[] = [
      { ...base, date: "2026-08-10", weightKg: 50, reps: 9 },
      { ...base, date: "2026-08-16", weightKg: 50, reps: 12 },
    ];
    const events = detectPrEvents(sets);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "REPS",
      weightKg: 50,
      reps: 12,
      prevReps: 9,
    });
  });

  it("does not flag the first set as a PR", () => {
    const sets: PrInputSet[] = [
      { ...base, date: "2026-08-10", weightKg: 50, reps: 9 },
    ];
    expect(detectPrEvents(sets)).toHaveLength(0);
  });

  it("orders events most-recent-first", () => {
    const sets: PrInputSet[] = [
      { ...base, date: "2026-08-01", weightKg: 40, reps: 8 },
      { ...base, date: "2026-08-08", weightKg: 45, reps: 8 },
      { ...base, date: "2026-08-16", weightKg: 50, reps: 8 },
    ];
    const events = detectPrEvents(sets);
    expect(events.map((e) => e.date)).toEqual(["2026-08-16", "2026-08-08"]);
  });

  it("spec case: 47x10 then 50x9 is a new maximum weight PR", () => {
    const events = detectPrEvents([
      { ...base, date: "2026-08-10", weightKg: 47, reps: 10 },
      { ...base, date: "2026-08-16", weightKg: 50, reps: 9 },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("WEIGHT");
    expect(events[0]).toMatchObject({ weightKg: 50, reps: 9, prevWeightKg: 47 });
  });

  it("spec case: 50x9 then 50x12 is a rep PR at 50kg", () => {
    const events = detectPrEvents([
      { ...base, date: "2026-08-10", weightKg: 50, reps: 9 },
      { ...base, date: "2026-08-16", weightKg: 50, reps: 12 },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("REPS");
    expect(events[0]).toMatchObject({ weightKg: 50, reps: 12, prevReps: 9 });
  });
});

describe("detectPrEvents: rep progression is progress (rep PR at the same load)", () => {
  const b = { exerciseId: "bench", exerciseName: "Bench Press", position: 0 };
  const set = (date: string, weightKg: number, reps: number, position = 0) => ({ ...b, date, weightKg, reps, position });

  it("case 1: 80x8 -> 80x10 is a REP PR (+2 reps)", () => {
    const ev = detectPrEvents([set("2026-08-01", 80, 8), set("2026-08-08", 80, 10)]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "REPS", weightKg: 80, reps: 10, prevReps: 8 });
    expect(prEventDetail(ev[0])).toEqual({ label: "Rep PR", detail: "+2 reps at 80 kg" });
  });

  it("case 2: 80x10 -> 80x8 is not a rep PR", () => {
    expect(detectPrEvents([set("2026-08-01", 80, 10), set("2026-08-08", 80, 8)])).toEqual([]);
  });

  it("case 3: 80x8 -> 82.5x8 is a weight PR only", () => {
    const ev = detectPrEvents([set("2026-08-01", 80, 8), set("2026-08-08", 82.5, 8)]);
    expect(ev.map((e) => e.type)).toEqual(["WEIGHT"]);
    expect(prEventDetail(ev[0]).detail).toBe("+2.5 kg");
  });

  it("case 4: 80x8 -> 82.5x10 is a weight PR and no (cross-load) rep PR", () => {
    const ev = detectPrEvents([set("2026-08-01", 80, 8), set("2026-08-08", 82.5, 10)]);
    expect(ev.map((e) => e.type)).toEqual(["WEIGHT"]);
  });

  it("case 5: 100x10 history, then 60x15 -> no PR at all (rep records are contextual to load)", () => {
    expect(detectPrEvents([set("2026-08-01", 100, 10), set("2026-08-08", 60, 15)])).toEqual([]);
  });

  it("case 5b: but beating your own best at 60 kg later is a rep PR at 60 kg only", () => {
    const ev = detectPrEvents([set("2026-08-01", 100, 10), set("2026-08-08", 60, 15), set("2026-08-15", 60, 18)]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "REPS", weightKg: 60, reps: 18, prevReps: 15 });
  });

  it("case 6: 3x(80x8) then 80x10, 80x9, 80x8 yields one rep PR, not several", () => {
    const ev = detectPrEvents([
      set("2026-08-01", 80, 8, 0), set("2026-08-01", 80, 8, 1), set("2026-08-01", 80, 8, 2),
      set("2026-08-08", 80, 10, 0), set("2026-08-08", 80, 9, 1), set("2026-08-08", 80, 8, 2),
    ]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "REPS", reps: 10, prevReps: 8 });
  });

  it("case 6b: ascending sets in one session (8, 9, 10) collapse into the best one", () => {
    const ev = detectPrEvents([
      set("2026-08-01", 80, 8),
      set("2026-08-08", 80, 8, 0), set("2026-08-08", 80, 9, 1), set("2026-08-08", 80, 10, 2),
    ]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ reps: 10, prevReps: 8 });
  });

  it("tolerates decimal representation of the same load (82.5 vs 82.50)", () => {
    const ev = detectPrEvents([set("2026-08-01", 82.5, 6), set("2026-08-08", 82.50, 8)]);
    expect(ev[0]).toMatchObject({ type: "REPS", prevReps: 6 });
  });
});
