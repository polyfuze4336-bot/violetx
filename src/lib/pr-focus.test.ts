import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getServerSession } from "next-auth";

import { exerciseService } from "@/lib/services/exercise";
import { importService } from "@/lib/services/import";
import { violetCoachService } from "@/lib/services/violetCoach";
import { heaviestRecordedLifts, detectPrEvents, type PrInputSet } from "@/lib/analytics";
import { focusMessage, staleRecordFocus } from "@/lib/pr-focus";
import { buildExerciseSeries, type TrainingSet } from "@/lib/training-analytics";
import { answerFromSnapshot, buildInsightSnapshot, intentOf, usesOnlyKnownNumbers } from "@/lib/violet-insights";

const NOW = new Date("2026-10-11T08:00:00Z");
const d = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);

function rows(exerciseId: string, name: string, sets: [number, number, number][], assisted = false): TrainingSet[] {
  return sets.map(([daysAgo, weightKg, reps]) => ({
    date: `${d(daysAgo)}T10:00:00.000Z`,
    exerciseId,
    exerciseName: name,
    muscleGroup: null,
    reps,
    weightKg,
    sets: null,
    assisted,
  }));
}
const pr = (r: TrainingSet[]): PrInputSet[] => r.map((x, i) => ({ exerciseId: x.exerciseId, exerciseName: x.exerciseName, date: x.date, weightKg: x.weightKg, reps: x.reps, position: i, assisted: x.assisted }));

describe("focus on the lift that has gone longest without a PR", () => {
  // Bench: last PR 70 days ago, then trained since. Squat: PR 20 days ago. Row: PR 40 days ago.
  const bench = rows("bench", "Bench Press", [[100, 70, 8], [90, 72.5, 8], [70, 75, 8], [50, 75, 8], [30, 75, 8], [5, 75, 8]]);
  const squat = rows("squat", "Squat", [[80, 100, 5], [50, 100, 5], [20, 105, 5], [8, 105, 5]]);
  const row = rows("row", "Barbell Row", [[90, 60, 8], [60, 60, 8], [40, 65, 8], [10, 65, 8]]);
  const all = [...bench, ...squat, ...row];
  const series = buildExerciseSeries(all);
  const events = detectPrEvents(pr(all));

  it("ranks by days since the last PR, longest first", () => {
    const f = staleRecordFocus(series, events, NOW);
    expect(f.map((x) => x.name)).toEqual(["Bench Press", "Barbell Row", "Squat"]);
    expect(f[0]).toMatchObject({ daysSincePr: 70, lastPrDate: d(70), sessionsSince: 3, bestWeightKg: 75 });
    expect(f[0].lastPr).toMatchObject({ label: "Weight PR", weightKg: 75, reps: 8 });
  });

  it("the reminder only quotes recorded numbers", () => {
    const m = focusMessage(staleRecordFocus(series, events, NOW)[0]);
    expect(m).toContain("Bench Press has had no new PR for 70 days");
    expect(m).toContain("Weight PR of 75 kg × 8");
    expect(m).not.toMatch(/estimated/i);
  });

  it("skips lifts with fewer than three sessions, inactive lifts and recent PRs", () => {
    const few = rows("curl", "Curl", [[60, 20, 10], [30, 20, 10]]);
    const inactive = rows("dip", "Old lift", [[200, 50, 8], [190, 52, 8], [180, 55, 8]]);
    const fresh = rows("press", "Press", [[40, 40, 8], [20, 40, 8], [3, 42.5, 8]]);
    const s = buildExerciseSeries([...few, ...inactive, ...fresh]);
    expect(staleRecordFocus(s, detectPrEvents(pr([...few, ...inactive, ...fresh])), NOW)).toEqual([]);
  });

  it("a lift that never broke a PR is measured from its first recorded session", () => {
    const flat = rows("fly", "Cable Fly", [[60, 20, 10], [40, 20, 10], [20, 20, 10], [4, 20, 10]]);
    const [f] = staleRecordFocus(buildExerciseSeries(flat), detectPrEvents(pr(flat)), NOW);
    expect(f).toMatchObject({ lastPrDate: null, lastPr: null, daysSincePr: 60 });
    expect(focusMessage(f)).toContain("No PR has been recorded since your first session");
  });

  it("assisted lifts talk about less assistance, never a heavier load", () => {
    const chin = rows("chin", "Assisted Chin-Up", [[90, 40, 8], [60, 35, 8], [40, 35, 8], [20, 35, 8], [3, 35, 8]], true);
    const [f] = staleRecordFocus(buildExerciseSeries(chin), detectPrEvents(pr(chin)), NOW);
    expect(f).toMatchObject({ assisted: true, bestWeightKg: 35, daysSincePr: 60 });
    expect(focusMessage(f)).toMatch(/less assistance/);
    expect(focusMessage(f)).toMatch(/Assistance PR of 35 kg assistance × 8/);
  });

  it("Violet answers 'What should I focus on next?' from the same facts", () => {
    expect(intentOf("What should I focus on next?")).toBe("focus");
    const snap = buildInsightSnapshot({
      now: NOW, windowDays: 30, weights: [], waist: [], workouts: 0, workoutsPerWeek: 0, prCount: 0, consistencyPct: null, adherencePct: null,
      avgSessionRpe: null, e1rm: [], nutrition: [], goals: [], readinessAvg7d: null, noteCount: 0,
      focus: staleRecordFocus(series, events, NOW),
    });
    const answer = answerFromSnapshot("focus", snap);
    expect(answer).toMatch(/Based on your recorded sessions/);
    expect(answer).toContain("Bench Press has had no new PR for 70 days");
    expect(usesOnlyKnownNumbers(answer, snap)).toBe(true);
    const none = buildInsightSnapshot({ ...{ now: NOW, windowDays: 30, weights: [], waist: [], workouts: 0, workoutsPerWeek: 0, prCount: 0, consistencyPct: null, adherencePct: null, avgSessionRpe: null, e1rm: [], nutrition: [], goals: [], readinessAvg7d: null, noteCount: 0 } });
    expect(answerFromSnapshot("focus", none)).toMatch(/Nothing is overdue/);
  });
});

describe("Violet focus answer is computed from saved sets (service level)", () => {
  const session = vi.mocked(getServerSession);
  let fake: FakePrisma;
  beforeEach(() => {
    fake = new FakePrisma(
      {
        user: [{ id: "owner-1", email: "owner@example.com", role: "OWNER", active: true }],
        athlete: [{ id: "athlete-1", ownerUserId: "owner-1", displayName: "Patient X", defaultWeightUnit: "KG", defaultMeasurementUnit: "CM" }],
      },
      true
    );
    (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
    session.mockReset();
    session.mockResolvedValue({ user: { id: "owner-1", email: "owner@example.com", role: "OWNER", athleteId: "athlete-1" }, expires: "2999-01-01T00:00:00.000Z" });
  });

  it("names the lift with the oldest PR using only imported/entered sets", async () => {
    await exerciseService.seedStarterLibrary();
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const save = (n: number, exercise: string, weightKg: number, reps: number) =>
      importService.commit({ date: new Date(`${day(n)}T00:00:00Z`), importType: "FULL", weightResolution: "IMPORT", measurements: [], sets: [{ exercise, reps, weightKg, resolution: "IMPORT" }] });
    for (const [n, w] of [[80, 60], [60, 62.5], [40, 65], [20, 65], [6, 65]] as const) await save(n, "Barbell Bench Press", w, 8);
    for (const [n, w] of [[70, 100], [50, 100], [30, 100], [10, 105], [4, 105]] as const) await save(n, "Leg Press", w, 10);

    const answer = await violetCoachService.ask("What should I focus on next?");
    expect(answer.answer).toContain("Barbell Bench Press has had no new PR for 40 days");
    expect(answer.answer).not.toMatch(/Leg Press has had no new PR for/);
  });
});

describe("grounding: nothing is simulated", () => {
  it("'heaviest lifts' are real recorded sets, never an estimate, and exclude assisted lifts", () => {
    const records = [
      { exerciseName: "Bench Press", assisted: false, maxWeightKg: 80, estimatedOneRepMaxKg: 101 },
      { exerciseName: "Squat", assisted: false, maxWeightKg: 120, estimatedOneRepMaxKg: 120 },
      { exerciseName: "Assisted Chin-Up", assisted: true, maxWeightKg: 25, estimatedOneRepMaxKg: 0 },
      { exerciseName: "Curl", assisted: false, maxWeightKg: 20, estimatedOneRepMaxKg: 40 },
    ];
    const out = heaviestRecordedLifts(records);
    expect(out.map((r) => [r.exerciseName, r.maxWeightKg])).toEqual([["Squat", 120], ["Bench Press", 80], ["Curl", 20]]);
    // Ranking by estimate would have put Bench (101) above Curl and Curl (40) above nothing real: it must not.
    expect(out.map((r) => r.maxWeightKg)).toEqual([...out.map((r) => r.maxWeightKg)].sort((a, b) => b - a));
  });

  it("app code never generates random or placeholder data (only the clearly labelled demo seed may)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !full.includes(`${path.sep}test${path.sep}`)) {
          if (/Math\.random\s*\(/.test(readFileSync(full, "utf8"))) offenders.push(path.relative(process.cwd(), full));
        }
      }
    };
    walk(path.resolve("src"));
    expect(offenders).toEqual([]);
  }, 30_000);
});
