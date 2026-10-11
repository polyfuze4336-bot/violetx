import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { getServerSession } from "next-auth";

import { reviewExerciseNames } from "@/lib/exercise-name-review";
import { STARTER_EXERCISES } from "@/lib/exercise-library";
import { AuthenticationError, AuthorizationError, NotFoundError } from "@/lib/rbac";
import { exerciseMatchService } from "@/lib/services/exerciseMatch";
import { exerciseService } from "@/lib/services/exercise";

const lib = (id: string, name: string, aliases: string | null = null, active = true) => ({ id, name, aliases, active });

describe("reviewing saved exercise names (pure)", () => {
  it("proposes renaming misspellings to the canonical exercise", () => {
    const out = reviewExerciseNames(
      [lib("1", "Lat Pulldwon"), lib("2", "Bench Pres"), lib("3", "Cable Roww"), lib("4", "Leg Pres")],
      STARTER_EXERCISES,
      new Map([["1", 12], ["2", 4]])
    );
    const by = (id: string) => out.find((p) => p.exerciseId === id)!;
    expect(by("1")).toMatchObject({ action: "RENAME", targetName: "Lat Pulldown", reason: "MISSPELLED", entryCount: 12 });
    expect(by("2")).toMatchObject({ action: "RENAME", targetName: "Barbell Bench Press" });
    expect(by("3")).toMatchObject({ action: "RENAME", targetName: "Seated Cable Row" });
    expect(by("4")).toMatchObject({ action: "RENAME", targetName: "Leg Press" });
    expect(by("1").targetRef).toBe("starter:Lat Pulldown");
  });

  it("proposes merging a misspelling or duplicate into the exercise the athlete already has", () => {
    const typo = reviewExerciseNames([lib("a", "Lat Pulldown"), lib("b", "Lat Pulldwon")], STARTER_EXERCISES, new Map([["a", 30], ["b", 2]]));
    expect(typo.map((p) => [p.name, p.action, p.targetName, p.reason, p.targetRef])).toEqual([["Lat Pulldwon", "MERGE", "Lat Pulldown", "MISSPELLED", "id:a"]]);
    const dupe = reviewExerciseNames([lib("a", "Lat Pulldown"), lib("c", "Lat Pull Down")], STARTER_EXERCISES, new Map([["a", 30], ["c", 1]]));
    expect(dupe.map((p) => [p.name, p.action, p.targetName, p.reason])).toEqual([["Lat Pull Down", "MERGE", "Lat Pulldown", "DUPLICATE"]]);
  });

  it("leaves correct names, custom exercises and inactive exercises alone", () => {
    const out = reviewExerciseNames(
      [lib("1", "Lat Pulldown"), lib("2", "Barbell Bench Press"), lib("3", "Sled Push"), lib("4", "Lat Pulldwon", null, false)],
      STARTER_EXERCISES,
      new Map()
    );
    expect(out).toEqual([]);
  });

  it("two similar saved exercises produce one merge, not two", () => {
    const out = reviewExerciseNames([lib("a", "Sled Pushh"), lib("b", "Sled Push")], [], new Map([["a", 1], ["b", 5]]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ exerciseId: "a", action: "MERGE", targetName: "Sled Push" });
  });
});

describe("correcting saved names (service)", () => {
  const session = vi.mocked(getServerSession);
  let fake: FakePrisma;
  const rows = (t: string) => (fake.tables[t] ?? []) as Record<string, unknown>[];
  const as = (role: string, id = "owner-1") =>
    session.mockResolvedValue({ user: { id, email: `${role.toLowerCase()}@example.com`, role, athleteId: "athlete-1" }, expires: "2999-01-01T00:00:00.000Z" });

  const entry = (id: string, exerciseId: string, w: number, r: number) => ({ id, athleteId: "athlete-1", exerciseId, date: new Date("2026-08-01"), reps: r, weightKg: w, position: 0, setType: "WORK", source: "WHATSAPP" });

  beforeEach(() => {
    fake = new FakePrisma(
      {
        user: [{ id: "owner-1", email: "owner@example.com", role: "OWNER", active: true }],
        athlete: [
          { id: "athlete-1", ownerUserId: "owner-1", displayName: "Patient X", defaultWeightUnit: "KG", defaultMeasurementUnit: "CM" },
          { id: "athlete-2", ownerUserId: "owner-2", displayName: "Patient X", defaultWeightUnit: "KG", defaultMeasurementUnit: "CM" },
        ],
        exercise: [
          { id: "typo", athleteId: "athlete-1", name: "Lat Pulldwon", aliases: null, active: true, category: null, muscleGroup: null, equipment: null },
          { id: "chin-typo", athleteId: "athlete-1", name: "Assissted Chin", aliases: null, active: true, category: null, muscleGroup: null, equipment: null },
          { id: "canon", athleteId: "athlete-1", name: "Leg Press", aliases: null, active: true, category: "Compound", muscleGroup: "Quads", equipment: "Machine" },
          { id: "dupe", athleteId: "athlete-1", name: "Leg Pres", aliases: "lp", active: true, category: null, muscleGroup: null, equipment: null },
          { id: "other-athletes", athleteId: "athlete-2", name: "Their Exercise", aliases: null, active: true },
        ],
        exerciseEntry: [entry("e1", "typo", 60, 10), entry("e2", "typo", 62.5, 10), entry("e3", "canon", 100, 10), entry("e4", "dupe", 110, 10)],
        workoutExercise: [{ id: "w1", athleteId: "athlete-1", sessionId: "s1", exerciseId: "dupe", sortOrder: 0 }],
        goal: [{ id: "g1", athleteId: "athlete-1", exerciseId: "dupe", type: "STRENGTH", status: "ACTIVE" }],
      },
      true
    );
    (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
    session.mockReset();
    as("OWNER");
  });

  it("finds the saved misspellings and the duplicate", async () => {
    const out = await exerciseMatchService.reviewLibrary();
    const by = (n: string) => out.find((p) => p.name === n)!;
    expect(by("Lat Pulldwon")).toMatchObject({ action: "RENAME", targetName: "Lat Pulldown", entryCount: 2 });
    expect(by("Assissted Chin")).toMatchObject({ action: "RENAME", targetName: "Assisted Chin-Up" });
    expect(by("Leg Pres")).toMatchObject({ action: "MERGE", targetName: "Leg Press", targetRef: "id:canon" });
    expect(out.some((p) => p.exerciseId === "other-athletes")).toBe(false); // other athletes' exercises are never reviewed
  });

  it("RENAME corrects the name, keeps every set and remembers the old spelling as an alias", async () => {
    const r = await exerciseMatchService.applyNameFix({ exerciseId: "typo", action: "RENAME", targetRef: "starter:Lat Pulldown" });
    expect(r.name).toBe("Lat Pulldown");
    const ex = rows("exercise").find((e) => e.id === "typo")!;
    expect(ex).toMatchObject({ name: "Lat Pulldown", aliases: "Lat Pulldwon" });
    expect(rows("exerciseEntry").filter((e) => e.exerciseId === "typo")).toHaveLength(2);
    // The exercise is canonical now, so the review no longer flags it.
    expect((await exerciseMatchService.reviewLibrary()).some((p) => p.exerciseId === "typo")).toBe(false);
  });

  it("RENAME to an assisted exercise keeps assisted semantics", async () => {
    await exerciseMatchService.applyNameFix({ exerciseId: "chin-typo", action: "RENAME", targetRef: "starter:Assisted Chin-Up" });
    expect(rows("exercise").find((e) => e.id === "chin-typo")).toMatchObject({ name: "Assisted Chin-Up", equipment: "Assisted Machine" });
  });

  it("MERGE moves sets, workout rows and goals to the other exercise, then removes the duplicate", async () => {
    await exerciseMatchService.applyNameFix({ exerciseId: "dupe", action: "MERGE", targetRef: "id:canon" });
    expect(rows("exerciseEntry").filter((e) => e.exerciseId === "canon")).toHaveLength(2);
    expect(rows("exerciseEntry").some((e) => e.exerciseId === "dupe")).toBe(false);
    expect(rows("workoutExercise")[0].exerciseId).toBe("canon");
    expect(rows("goal")[0].exerciseId).toBe("canon");
    expect(rows("exercise").some((e) => e.id === "dupe")).toBe(false);
    expect(rows("exercise").find((e) => e.id === "canon")!.aliases).toContain("Leg Pres");
    expect(rows("exerciseEntry")).toHaveLength(4); // nothing lost
  });

  it("only validated targets are accepted: no invented ids, other athletes' exercises or unknown names", async () => {
    const before = JSON.stringify(fake.tables);
    const bad = [
      { exerciseId: "typo", action: "MERGE" as const, targetRef: "id:made-up" },
      { exerciseId: "typo", action: "MERGE" as const, targetRef: "id:other-athletes" },
      { exerciseId: "typo", action: "MERGE" as const, targetRef: "id:typo" },
      { exerciseId: "typo", action: "RENAME" as const, targetRef: "starter:Totally Made Up" },
      { exerciseId: "typo", action: "RENAME" as const, targetRef: "id:canon" },
      { exerciseId: "typo", action: "RENAME" as const, targetRef: "garbage" },
      { exerciseId: "other-athletes", action: "RENAME" as const, targetRef: "starter:Lat Pulldown" },
      { exerciseId: "dupe", action: "RENAME" as const, targetRef: "starter:Leg Press" }, // name already exists: merge instead
    ];
    for (const b of bad) await expect(exerciseMatchService.applyNameFix(b), JSON.stringify(b)).rejects.toBeInstanceOf(NotFoundError);
    expect(JSON.stringify(fake.tables)).toBe(before);
  });

  it("only the owner can review or correct: coaches and the demo viewer are refused, nothing changes", async () => {
    vi.stubEnv("DEMO_MODE_ENABLED", "true");
    const before = JSON.stringify(fake.tables);
    for (const role of ["COACH", "DEMO_VIEWER"]) {
      as(role, `${role}-1`);
      await expect(exerciseMatchService.reviewLibrary()).rejects.toBeInstanceOf(AuthorizationError);
      await expect(exerciseMatchService.applyNameFix({ exerciseId: "typo", action: "RENAME", targetRef: "starter:Lat Pulldown" })).rejects.toBeInstanceOf(AuthorizationError);
    }
    session.mockResolvedValue(null);
    await expect(exerciseMatchService.reviewLibrary()).rejects.toBeInstanceOf(AuthenticationError);
    expect(JSON.stringify(fake.tables)).toBe(before);
    vi.unstubAllEnvs();
  });

  it("a library seeded from the starter list has nothing to correct", async () => {
    fake = new FakePrisma({ user: [{ id: "owner-1", email: "owner@example.com", role: "OWNER", active: true }], athlete: [{ id: "athlete-1", ownerUserId: "owner-1" }] }, true);
    (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
    as("OWNER");
    await exerciseService.seedStarterLibrary();
    expect(await exerciseMatchService.reviewLibrary()).toEqual([]);
  });
});
