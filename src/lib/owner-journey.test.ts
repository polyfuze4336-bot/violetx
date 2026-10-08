import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { getServerSession } from "next-auth";

import { AuthenticationError, AuthorizationError } from "@/lib/rbac";
import { analyticsService } from "@/lib/services/analytics";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { exerciseDetailService } from "@/lib/services/exerciseDetail";
import { exerciseService } from "@/lib/services/exercise";
import { exerciseMatchService } from "@/lib/services/exerciseMatch";
import { goalService } from "@/lib/services/goal";
import { gymService } from "@/lib/services/gym";
import { importService } from "@/lib/services/import";
import { measurementService } from "@/lib/services/measurement";
import { nutritionService } from "@/lib/services/nutrition";
import { personalRecordService } from "@/lib/services/personalRecord";
import { shareLinkService } from "@/lib/services/shareLink";
import { trainingProgressService } from "@/lib/services/trainingProgress";
import { violetCoachService } from "@/lib/services/violetCoach";
import { workoutService } from "@/lib/services/workout";

const session = vi.mocked(getServerSession);
let fake: FakePrisma;

const asOwner = () =>
  session.mockResolvedValue({ user: { id: "owner-1", email: "owner@example.com", role: "OWNER", athleteId: "athlete-1" }, expires: "2999-01-01T00:00:00.000Z" });
const anonymous = () => session.mockResolvedValue(null);

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  fake = new FakePrisma(
    {
      user: [{ id: "owner-1", email: "owner@example.com", role: "OWNER", active: true }],
      athlete: [{ id: "athlete-1", ownerUserId: "owner-1", displayName: "Patient X", defaultWeightUnit: "KG", defaultMeasurementUnit: "CM", heightCm: 176, calorieTarget: null }],
      gymBranch: [
        { id: "gym-1", name: "Anytime Fitness One", state: "Selangor", city: "Petaling Jaya", active: true, latitude: 3.1, longitude: 101.6 },
        { id: "gym-2", name: "Anytime Fitness Two", state: "Johor", city: "Johor Bahru", active: true, latitude: 1.5, longitude: 103.7 },
      ],
    },
    true
  );
  (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
  session.mockReset();
  asOwner();
});

type ActiveWorkout = Awaited<ReturnType<typeof workoutService.start>>;

/** Start a workout on `date`, log the given sets per exercise name, finish it. */
async function trainDay(
  date: string,
  plan: Record<string, [number, number][]>,
  names: Record<string, string>
) {
  const ids = Object.keys(plan).map((n) => names[n]);
  const workout: ActiveWorkout = await workoutService.start({ date, exerciseIds: ids });
  const results: Record<string, Awaited<ReturnType<typeof workoutService.logSet>>[]> = {};
  for (const ex of workout.exercises) {
    const name = Object.keys(names).find((n) => names[n] === ex.exerciseId)!;
    results[name] = [];
    for (const [weightKg, reps] of plan[name]) {
      results[name].push(await workoutService.logSet({ workoutExerciseId: ex.id, weightKg, reps }));
    }
  }
  const summary = await workoutService.finish({});
  return { results, summary };
}

const types = (r: { prs: { type: string }[] }) => r.prs.map((p) => p.type);

describe("OWNER journey (in-memory database, real services)", () => {
  async function setup() {
    await exerciseService.seedStarterLibrary();
    const library = await exerciseService.list();
    const id = (name: string) => library.find((e) => e.name === name)!.id;
    return { names: { bench: id("Barbell Bench Press"), chin: id("Assisted Chin-Up") } as Record<string, string>, library };
  }

  it("start workout -> log weight and reps -> finish: every PR type is detected", async () => {
    const { names } = await setup();
    const d1 = day(-14);
    const d2 = day(-7);
    const d3 = day(-1);

    // Baseline: the first performance is never a PR.
    const w1 = await trainDay(d1, { bench: [[80, 8], [80, 8], [80, 8]], chin: [[40, 8], [40, 8], [40, 8]] }, names);
    expect(w1.summary.discarded).toBe(false);
    expect(w1.summary.prs).toEqual([]);

    // Heavier: WEIGHT PR + estimated 1RM PR; the 3rd set pushes session volume above any earlier session.
    const w2 = await trainDay(d2, { bench: [[82.5, 8], [82.5, 8], [82.5, 8]], chin: [[35, 8], [35, 8], [35, 8]] }, names);
    expect(types({ prs: w2.results.bench[0].prs })).toEqual(expect.arrayContaining(["WEIGHT", "E1RM"]));
    expect(w2.results.bench[0].prs.find((p) => p.type === "WEIGHT")).toMatchObject({ weightKg: 82.5, previous: 80, label: "Weight PR" });
    expect(types({ prs: w2.results.bench[2].prs })).toContain("VOLUME");
    const benchSummary = w2.summary.prs.find((p) => p.exerciseName === "Barbell Bench Press")!;
    expect(benchSummary.achievements.map((a) => a.type)).toEqual(expect.arrayContaining(["WEIGHT", "E1RM", "VOLUME"]));

    // Same load, more reps: REP PR (and a higher estimate).
    const w3 = await trainDay(d3, { bench: [[82.5, 10]], chin: [[35, 10]] }, names);
    expect(types({ prs: w3.results.bench[0].prs })).toEqual(expect.arrayContaining(["REPS", "E1RM"]));
    expect(w3.results.bench[0].prs.find((p) => p.type === "REPS")).toMatchObject({ weightKg: 82.5, value: 10, previous: 8 });
    expect(types({ prs: w3.results.bench[0].prs })).not.toContain("WEIGHT");
  });

  it("assisted Chin-Up: 40 -> 35 kg assistance is an improvement; 35x8 -> 35x10 is a rep improvement", async () => {
    const { names } = await setup();
    await trainDay(day(-14), { chin: [[40, 8], [40, 8]] }, names);

    const second = await trainDay(day(-7), { chin: [[35, 8], [35, 8]] }, names);
    const lessAssist = second.results.chin[0].prs;
    expect(lessAssist.map((p) => p.type)).toEqual(["ASSISTANCE"]);
    expect(lessAssist[0]).toMatchObject({ label: "Assistance PR", assisted: true, weightKg: 35, previous: 40 });
    // No e1RM/volume/weight PR for assistance, and the wording is never "-5 kg".
    expect(lessAssist.map((p) => p.type)).not.toContain("WEIGHT");

    const detail = await exerciseDetailService.get(names.chin);
    expect(detail!.assisted).toBe(true);
    expect(detail!.latestProgression!.load).toMatchObject({ fromKg: 40, toKg: 35, deltaKg: 5 });
    expect(detail!.latestProgression!.assisted).toBe(true);
    expect(detail!.maxWeight).toMatchObject({ weightKg: 35 }); // lowest assistance is the best
    expect(detail!.maxEstStrength).toBeNull();

    const third = await trainDay(day(-1), { chin: [[35, 10], [35, 9]] }, names);
    expect(third.results.chin[0].prs.map((p) => p.type)).toEqual(["REPS"]);
    expect(third.results.chin[0].prs[0]).toMatchObject({ assisted: true, weightKg: 35, value: 10, previous: 8 });
    const after = await exerciseDetailService.get(names.chin);
    expect(after!.latestProgression!.reps).toMatchObject({ weightKg: 35, from: 8, to: 10, delta: 2 });

    const events = await personalRecordService.prEvents();
    const chin = events.filter((e) => e.exerciseName === "Assisted Chin-Up");
    expect(chin.map((e) => e.type).sort()).toEqual(["ASSISTANCE", "REPS"]);
    expect(events.some((e) => e.exerciseName === "Assisted Chin-Up" && e.type === "WEIGHT")).toBe(false);
  });

  it("Progress, Analytics and Violet all reflect the training (and treat less assistance as progress)", async () => {
    const { names } = await setup();
    await trainDay(day(-14), { bench: [[80, 8], [80, 8]], chin: [[40, 8]] }, names);
    await trainDay(day(-7), { bench: [[82.5, 8]], chin: [[35, 8]] }, names);
    await trainDay(day(-1), { bench: [[82.5, 10]], chin: [[35, 10]] }, names);

    const progress = await trainingProgressService.get("week");
    expect(progress.matrix.rows.map((r) => r.name).sort()).toEqual(["Assisted Chin-Up", "Barbell Bench Press"]);
    const chinRow = progress.matrix.rows.find((r) => r.name === "Assisted Chin-Up")!;
    expect(chinRow.assisted).toBe(true);
    expect(["up", "reps"]).toContain(chinRow.trend.kind);
    expect(progress.exercises.find((e) => e.name === "Assisted Chin-Up")!.latestE1rm).toBe(0);

    const analytics = await analyticsService.get("3M");
    expect(analytics.totals.workouts).toBe(3);
    expect(analytics.e1rmTrends.map((t) => t.name)).not.toContain("Assisted Chin-Up");
    expect(analytics.prTimeline.some((p) => p.type === "ASSISTANCE")).toBe(true);

    const snap = await violetCoachService.snapshot();
    const chinProg = snap.progressions.filter((p) => p.lift === "Assisted Chin-Up");
    expect(chinProg.length).toBeGreaterThan(0);
    expect(snap.progressions.some((p) => p.kind === "LOAD" || p.kind === "REPS")).toBe(true);
    const answer = await violetCoachService.ask("How is my strength progressing?");
    expect(answer.source).toBe("rules");
    expect(answer.answer).toMatch(/improved/i);
    expect(answer.answer).not.toMatch(/decreased|no improvement/i);
  });

  it("goals, nutrition, measurements, weight and Gym Journey work end to end", async () => {
    await setup();
    await bodyWeightService.create({ date: new Date(`${day(-10)}T00:00:00Z`), weightKg: 82 });
    await bodyWeightService.create({ date: new Date(`${day(-1)}T00:00:00Z`), weightKg: 80.5 });
    const goal = await goalService.create({ type: "BODY_WEIGHT", targetValue: 78 });
    expect(goal.progress.current).toBe(80.5);
    expect((await goalService.list())[0].title).toBe("Body weight");

    await nutritionService.create({ entryDate: new Date(`${day(-1)}T00:00:00Z`), calories: 2200, protein: 160 } as never);
    expect((await nutritionService.list()).length).toBe(1);

    const type = await measurementService.createType({ name: "Waist", defaultUnit: "CM" });
    await measurementService.createEntry({ typeId: type.id, date: new Date(`${day(-1)}T00:00:00Z`), value: 88.5, unit: "CM" } as never);
    expect((await measurementService.listEntries()).length).toBe(1);

    await gymService.markVisited("gym-1");
    await gymService.markVisited("gym-1"); // repeat visits never inflate exploration
    await gymService.markVisited("gym-2");
    const journey = await gymService.getJourney();
    expect(journey.stats.uniqueVisited).toBe(2);
    expect(journey.stats.totalActive).toBe(2);
  });

  it("an unfinished workout can be discarded and nothing is left behind", async () => {
    const { names } = await setup();
    const w = await workoutService.start({ date: day(0), exerciseIds: [names.bench] });
    await workoutService.logSet({ workoutExerciseId: w.exercises[0].id, weightKg: 60, reps: 5 });
    await workoutService.discard();
    expect(fake.tables.exerciseEntry ?? []).toHaveLength(0);
    expect(fake.tables.workoutSession ?? []).toHaveLength(0);
  });
});

describe("COACH link journey: create, view, attempt writes, revoke", () => {
  it("shows progress without login, refuses every write, and stops working when revoked", async () => {
    await exerciseService.seedStarterLibrary();
    const library = await exerciseService.list();
    const bench = library.find((e) => e.name === "Barbell Bench Press")!.id;
    await trainDay(day(-8), { bench: [[80, 8]] }, { bench });
    await trainDay(day(-1), { bench: [[82.5, 8]] }, { bench });

    const { token, link } = await shareLinkService.create({ expiresInDays: 7 });
    expect(link.status).toBe("active");

    // The coach: no session at all.
    anonymous();
    const view = await shareLinkService.getSharedProgress(token);
    expect(view).not.toBeNull();
    expect(view!.records.map((r) => r.exerciseName)).toContain("Barbell Bench Press");
    expect(view!.prCounts.WEIGHT).toBe(1);
    expect(JSON.stringify(view)).not.toMatch(/athlete-1|owner-1|owner@example.com|"id"/);

    // Any attempt to modify data fails and nothing changes.
    const before = JSON.stringify(fake.tables.exerciseEntry);
    const attempts: (() => Promise<unknown>)[] = [
      () => workoutService.start({ date: day(0), exerciseIds: [bench] }),
      () => bodyWeightService.create({ date: new Date(), weightKg: 60 } as never),
      () => goalService.create({ type: "BODY_WEIGHT", targetValue: 70 }),
      () => shareLinkService.revoke(link.id),
      () => shareLinkService.create({}),
      () => importService.commit({ date: new Date(), weightResolution: "IMPORT", measurements: [], sets: [{ exercise: "Hack", reps: 5, weightKg: 50, resolution: "IMPORT" }] }),
    ];
    for (const a of attempts) await expect(a()).rejects.toBeInstanceOf(AuthenticationError);
    expect(JSON.stringify(fake.tables.exerciseEntry)).toBe(before);

    // Owner revokes; the coach's refresh now gets nothing.
    asOwner();
    await shareLinkService.revoke(link.id);
    expect((await shareLinkService.list())[0].status).toBe("revoked");
    anonymous();
    expect(await shareLinkService.getSharedProgress(token)).toBeNull();
  });

  it("owner logout: every owner operation is refused afterwards", async () => {
    anonymous();
    await expect(exerciseService.seedStarterLibrary()).rejects.toBeInstanceOf(AuthenticationError);
    await expect(workoutService.start({ date: day(0) })).rejects.toBeInstanceOf(AuthenticationError);
    session.mockResolvedValue({ user: { id: "c", email: "c@example.com", role: "COACH", athleteId: "athlete-1" }, expires: "2999-01-01T00:00:00.000Z" });
    await expect(workoutService.start({ date: day(0) })).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("spelling correction maps to canonical exercises without duplicates", () => {
  const typos: [string, string][] = [
    ["lat pulldwon", "Lat Pulldown"],
    ["bench pres", "Barbell Bench Press"],
    ["assissted chin", "Assisted Chin-Up"],
    ["cable roww", "Seated Cable Row"],
    ["leg pres", "Leg Press"],
    ["dumbell curl", "Dumbbell Curl"],
    ["romanain deadlift", "Romanian Deadlift"],
    ["tricep pushdwn", "Triceps Pushdown"],
    ["hip abducton", "Hip Abduction"],
    ["shouler press", "Overhead Press"],
  ];

  it("proposes the canonical exercise for each misspelling", async () => {
    await exerciseService.seedStarterLibrary();
    const out = await exerciseMatchService.suggest(typos.map(([t]) => t));
    for (const [typo, canonical] of typos) {
      const s = out.find((x) => x.input === typo)!;
      expect(["HIGH", "AMBIGUOUS"], typo).toContain(s.status);
      expect(s.candidates[0].name, typo).toBe(canonical);
      expect(s.candidates[0].ref.startsWith("id:"), typo).toBe(true);
    }
  });

  it("importing typos with the confirmed correction reuses one exercise per movement", async () => {
    await exerciseService.seedStarterLibrary();
    const before = (await exerciseService.list()).length;
    const out = await exerciseMatchService.suggest(["lat pulldwon", "Lat Pull Down", "lat pulldown"]);
    const ref = out.find((s) => s.input === "lat pulldwon")!.candidates[0].ref;
    await importService.commit({
      date: new Date(`${day(-1)}T00:00:00Z`),
      weightResolution: "IMPORT",
      measurements: [],
      sets: [
        { exercise: "lat pulldwon", exerciseRef: ref, reps: 10, weightKg: 50, resolution: "IMPORT" },
        { exercise: "Lat Pull Down", reps: 8, weightKg: 52.5, resolution: "IMPORT" },
        { exercise: "lat pulldown", reps: 8, weightKg: 52.5, resolution: "IMPORT" },
      ],
    });
    const after = await exerciseService.list();
    expect(after).toHaveLength(before);
    expect(after.filter((e) => e.name === "Lat Pulldown")).toHaveLength(1);
    const lat = after.find((e) => e.name === "Lat Pulldown")!;
    expect((fake.tables.exerciseEntry ?? []).filter((e) => e.exerciseId === lat.id)).toHaveLength(3);
    // The confirmed spelling is remembered, so next time it matches exactly.
    expect(lat.aliases).toContain("lat pulldwon");
    const again = await exerciseMatchService.suggest(["lat pulldwon"]);
    expect(again[0].status).toBe("EXACT");
  });

  it("an unknown exercise is allowed as a custom exercise once confirmed", async () => {
    await exerciseService.seedStarterLibrary();
    const s = (await exerciseMatchService.suggest(["Sled Push"]))[0];
    expect(s.status).toBe("NONE");
    const created = await exerciseService.create({ name: "Sled Push", active: true });
    expect(created.name).toBe("Sled Push");
    expect((await exerciseMatchService.suggest(["sled push"]))[0].status).toBe("EXACT");
  });
});
