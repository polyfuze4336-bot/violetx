import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));

const tx = {
  importBatch: { create: vi.fn() },
  workoutSession: { create: vi.fn() },
  bodyWeightEntry: { create: vi.fn(), deleteMany: vi.fn() },
  measurementType: { findFirst: vi.fn(), create: vi.fn() },
  measurementEntry: { create: vi.fn(), deleteMany: vi.fn() },
  exercise: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  exerciseEntry: { create: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    exercise: { findMany: vi.fn() },
    exerciseEntry: { count: vi.fn() },
    bodyWeightEntry: { count: vi.fn() },
    measurementType: { findFirst: vi.fn() },
    measurementEntry: { count: vi.fn() },
  },
}));
vi.mock("@/lib/repositories/exercise", () => ({
  exerciseRepository: { list: vi.fn(), create: vi.fn(), findByName: vi.fn() },
  exerciseEntryRepository: { list: vi.fn() },
}));
vi.mock("@/ai/exercise-match", () => ({ suggestExerciseWithAi: vi.fn() }));
vi.mock("@/ai/client", () => ({ getAzureOpenAiConfig: vi.fn(() => null) }));

import { getServerSession } from "next-auth";

import { suggestExerciseWithAi } from "@/ai/exercise-match";
import { getAzureOpenAiConfig } from "@/ai/client";
import { prisma } from "@/lib/db";
import { exerciseRepository } from "@/lib/repositories/exercise";
import { exerciseService } from "@/lib/services/exercise";
import { exerciseMatchService } from "@/lib/services/exerciseMatch";
import { importService } from "@/lib/services/import";
import { AuthorizationError, NotFoundError } from "@/lib/rbac";

const session = vi.mocked(getServerSession);
const repo = vi.mocked(exerciseRepository);
const ai = vi.mocked(suggestExerciseWithAi);
const aiConfig = vi.mocked(getAzureOpenAiConfig);

function as(role: "OWNER" | "COACH") {
  session.mockResolvedValue({
    user: { id: "u1", email: "u@example.com", role, athleteId: "a1" },
    expires: "2999-01-01T00:00:00.000Z",
  });
}

const row = (id: string, name: string, aliases: string | null = null) => ({
  id,
  athleteId: "a1",
  name,
  aliases,
  category: null,
  muscleGroup: null,
  equipment: null,
  secondaryMuscles: null,
  movementPattern: null,
  instructions: null,
  tips: null,
  isCustom: false,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const date = new Date("2026-08-16T00:00:00Z");
const commit = (sets: { exercise: string; exerciseRef?: string }[]) =>
  importService.commit({
    date,
    weightResolution: "IMPORT",
    measurements: [],
    sets: sets.map((s) => ({ ...s, reps: 10, weightKg: 50, resolution: "IMPORT" as const })),
  });

beforeEach(() => {
  vi.clearAllMocks();
  session.mockReset();
  as("OWNER");
  aiConfig.mockReturnValue(null);
  tx.importBatch.create.mockResolvedValue({ id: "b1" });
  tx.workoutSession.create.mockResolvedValue({ id: "s1" });
  tx.exercise.create.mockImplementation(async ({ data }: { data: { name: string; aliases?: string | null } }) => ({
    id: `new-${data.name}`,
    name: data.name,
    aliases: data.aliases ?? null,
  }));
  tx.exerciseEntry.create.mockResolvedValue({});
});

describe("exerciseMatchService.suggest", () => {
  beforeEach(() => repo.list.mockResolvedValue([row("L1", "Chess Press"), row("L2", "Lat Pulldown")]));

  it("is owner-only", async () => {
    as("COACH");
    await expect(exerciseMatchService.suggest(["leg pres"])).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("resolves exact names, typos and library vs starter refs without calling the AI", async () => {
    aiConfig.mockReturnValue({ endpoint: "x", deployment: "y", apiVersion: "z" });
    const out = await exerciseMatchService.suggest(["Lat Pull Down", "leg pres", "chess press", "cable roww"]);
    const by = Object.fromEntries(out.map((s) => [s.input, s]));
    expect(by["Lat Pull Down"]).toMatchObject({ status: "EXACT", candidates: [{ ref: "id:L2" }] });
    expect(by["leg pres"]).toMatchObject({ status: "HIGH", candidates: [{ ref: "starter:Leg Press" }] });
    expect(by["chess press"]).toMatchObject({ status: "EXACT", candidates: [{ ref: "id:L1" }] });
    expect(by["cable roww"].candidates[0].name).toBe("Seated Cable Row");
    expect(ai).not.toHaveBeenCalled();
  });

  it("deduplicates repeated and respelled names", async () => {
    const out = await exerciseMatchService.suggest(["Leg Press", "leg  press", "LEG-PRESS"]);
    expect(out).toHaveLength(1);
  });

  it("asks the AI only when matching is uncertain, and only accepts shortlist positions", async () => {
    aiConfig.mockReturnValue({ endpoint: "x", deployment: "y", apiVersion: "z" });
    ai.mockResolvedValue([
      { index: 9999, confidence: 1 },
      { index: 1, confidence: 0.4 },
    ]);
    const out = await exerciseMatchService.suggest(["row"]);
    expect(ai).toHaveBeenCalledTimes(1);
    // The invented position was ignored; every candidate is a ref the app produced.
    for (const c of out[0].candidates) expect(c.ref).toMatch(/^(id:L[12]|starter:.+)$/);
  });

  it("falls back to deterministic results when the AI fails", async () => {
    aiConfig.mockReturnValue({ endpoint: "x", deployment: "y", apiVersion: "z" });
    ai.mockResolvedValue(null);
    const out = await exerciseMatchService.suggest(["row"]);
    expect(out[0].status).toBe("AMBIGUOUS");
    expect(out[0].usedAi).toBe(false);
  });

  it("an AI proposal can never reach high confidence for a different variation", async () => {
    aiConfig.mockReturnValue({ endpoint: "x", deployment: "y", apiVersion: "z" });
    ai.mockImplementation(async (_input, shortlist) => {
      const i = shortlist.findIndex((s) => s.name === "Assisted Chin-Up") + 1;
      return i > 0 ? [{ index: i, confidence: 0.99 }] : [];
    });
    const out = await exerciseMatchService.suggest(["chin"]);
    expect(out[0].status).not.toBe("HIGH");
  });

  it("unknown exercises come back as NONE so they can be created as custom", async () => {
    const out = await exerciseMatchService.suggest(["Sled Push"]);
    expect(out[0].status).toBe("NONE");
  });

  it("lists library and starter choices for 'Choose another'", async () => {
    const choices = await exerciseMatchService.choices();
    expect(choices.find((c) => c.name === "Lat Pulldown")).toMatchObject({ ref: "id:L2", source: "library" });
    expect(choices.find((c) => c.name === "Leg Press")).toMatchObject({ ref: "starter:Leg Press", source: "starter" });
    // The starter copy of an exercise the athlete already has is not offered twice.
    expect(choices.filter((c) => c.name === "Lat Pulldown")).toHaveLength(1);
  });
});

describe("import commit: exercise resolution", () => {
  beforeEach(() => {
    tx.exercise.findMany.mockResolvedValue([
      { id: "L1", name: "Lat Pulldown", aliases: null },
      { id: "L2", name: "Chess Press", aliases: null },
    ]);
  });

  const entryExerciseIds = () => tx.exerciseEntry.create.mock.calls.map((c) => c[0].data.exerciseId);

  it("exact spelling variants reuse the existing exercise (no duplicates, no rewriting)", async () => {
    const summary = await commit([
      { exercise: "Lat Pull Down" },
      { exercise: "lat pulldown" },
      { exercise: "  LAT   PULLDOWN " },
    ]);
    expect(tx.exercise.create).not.toHaveBeenCalled();
    expect(entryExerciseIds()).toEqual(["L1", "L1", "L1"]);
    expect(summary.newExercises).toEqual([]);
  });

  it("does not silently fix a typo: an unconfirmed 'Lat Pulldwon' stays a separate custom exercise", async () => {
    await commit([{ exercise: "Lat Pulldwon" }]);
    expect(tx.exercise.create).toHaveBeenCalledTimes(1);
    expect(tx.exercise.create.mock.calls[0][0].data).toMatchObject({ athleteId: "a1", name: "Lat Pulldwon" });
  });

  it("a confirmed correction maps to the canonical exercise and remembers the spelling as an alias", async () => {
    await commit([{ exercise: "Lat Pulldwon", exerciseRef: "id:L1" }]);
    expect(tx.exercise.create).not.toHaveBeenCalled();
    expect(entryExerciseIds()).toEqual(["L1"]);
    expect(tx.exercise.update).toHaveBeenCalledWith({ where: { id: "L1" }, data: { aliases: "Lat Pulldwon" } });
  });

  it("a confirmed starter ref creates the canonical exercise once, with the typed spelling as an alias", async () => {
    const summary = await commit([
      { exercise: "leg pres", exerciseRef: "starter:Leg Press" },
      { exercise: "leg pres", exerciseRef: "starter:Leg Press" },
    ]);
    expect(tx.exercise.create).toHaveBeenCalledTimes(1);
    const data = tx.exercise.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ athleteId: "a1", name: "Leg Press", isCustom: false });
    expect(data.aliases).toContain("leg pres");
    expect(summary.newExercises).toEqual(["Leg Press"]);
    expect(entryExerciseIds()).toEqual(["new-Leg Press", "new-Leg Press"]);
  });

  it("an exact starter name is added as the canonical exercise, not as a custom spelling", async () => {
    await commit([{ exercise: "leg press" }]);
    expect(tx.exercise.create.mock.calls[0][0].data).toMatchObject({ name: "Leg Press", isCustom: false });
  });

  it("unknown exercises are created as custom exercises with the typed name", async () => {
    const summary = await commit([{ exercise: "Sled Push" }]);
    expect(tx.exercise.create.mock.calls[0][0].data).toEqual({ athleteId: "a1", name: "Sled Push" });
    expect(summary.newExercises).toEqual(["Sled Push"]);
  });

  it("rejects ids that are not in the athlete's library (AI/clients cannot invent them)", async () => {
    await expect(commit([{ exercise: "x", exerciseRef: "id:someone-elses-id" }])).rejects.toBeInstanceOf(NotFoundError);
    await expect(commit([{ exercise: "x", exerciseRef: "starter:Totally Made Up" }])).rejects.toBeInstanceOf(NotFoundError);
    await expect(commit([{ exercise: "x", exerciseRef: "garbage" }])).rejects.toBeInstanceOf(NotFoundError);
    expect(tx.exerciseEntry.create).not.toHaveBeenCalled();
  });

  it("does not alias a spelling another exercise already owns", async () => {
    await commit([{ exercise: "Chess Press", exerciseRef: "id:L1" }]);
    expect(tx.exercise.update).not.toHaveBeenCalled();
  });

  it("blocks coaches (403)", async () => {
    as("COACH");
    await expect(commit([{ exercise: "Leg Press" }])).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("duplicate detection uses the resolved exercise", () => {
  it("finds a same-day duplicate under a respelled or confirmed exercise", async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([{ id: "L1", name: "Lat Pulldown", aliases: null }] as never);
    vi.mocked(prisma.exerciseEntry.count).mockResolvedValue(1 as never);
    const r = await importService.findDuplicates({
      date,
      measurements: [],
      sets: [
        { exercise: "Lat Pull Down", reps: 10, weightKg: 50 },
        { exercise: "Lat Pulldwon", exerciseRef: "id:L1", reps: 10, weightKg: 50 },
        { exercise: "Lat Pulldwon", reps: 10, weightKg: 50 },
      ],
    });
    expect(r.sets).toEqual([true, true, false]);
  });
});

describe("manual exercise creation", () => {
  beforeEach(() => repo.list.mockResolvedValue([row("L1", "Lat Pulldown", "Pulldown")]));

  it("rejects a respelling of an existing exercise or alias", async () => {
    await expect(exerciseService.create({ name: "Lat Pull Down", active: true })).rejects.toThrow(/same as your existing exercise "Lat Pulldown"/);
    await expect(exerciseService.create({ name: "pulldown", active: true })).rejects.toBeInstanceOf(AuthorizationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("allows a genuinely new custom exercise", async () => {
    repo.create.mockResolvedValue(row("N1", "Sled Push"));
    await exerciseService.create({ name: "Sled Push", active: true });
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it("only adds exercises that are in the starter library", async () => {
    await expect(exerciseService.addFromStarter("Totally Made Up")).rejects.toBeInstanceOf(NotFoundError);
    as("COACH");
    await expect(exerciseService.addFromStarter("Leg Press")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("returns the existing exercise instead of adding a starter twice", async () => {
    const dto = await exerciseService.addFromStarter("Lat Pulldown");
    expect(dto.id).toBe("L1");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("the starter seeder skips exercises that exist under another spelling", async () => {
    repo.list.mockResolvedValue([row("L1", "Lat Pull Down")]);
    repo.create.mockResolvedValue(row("x", "x"));
    await exerciseService.seedStarterLibrary();
    const created = repo.create.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(created).not.toContain("Lat Pulldown");
    expect(created).toContain("Leg Press");
  });
});
