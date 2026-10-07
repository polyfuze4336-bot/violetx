import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("@/lib/repositories/program", () => ({
  programRepository: {
    list: vi.fn(),
    getById: vi.fn(),
    getTemplate: vi.fn(),
    createProgram: vi.fn(),
    updateProgram: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    replaceTemplateExercises: vi.fn(),
    templateSessionCount: vi.fn(),
    deleteTemplate: vi.fn(),
    setActiveExclusive: vi.fn(),
    lastCompletedTemplate: vi.fn(),
    logProposal: vi.fn(),
  },
}));
vi.mock("@/lib/repositories/exercise", () => ({
  exerciseRepository: { list: vi.fn(), create: vi.fn() },
  exerciseEntryRepository: { list: vi.fn() },
}));
vi.mock("@/ai/program", () => ({ generateProgramWithAi: vi.fn() }));

import { getServerSession } from "next-auth";

import { generateProgramWithAi } from "@/ai/program";
import { exerciseEntryRepository, exerciseRepository } from "@/lib/repositories/exercise";
import { programRepository } from "@/lib/repositories/program";
import { programService } from "@/lib/services/program";
import { AuthorizationError } from "@/lib/rbac";

const prog = vi.mocked(programRepository);
const ex = vi.mocked(exerciseRepository);
const session = vi.mocked(getServerSession);

function as(role: "OWNER" | "COACH") {
  session.mockResolvedValue({
    user: { id: "u1", email: "u@example.com", role, athleteId: "a1" },
    expires: "2999-01-01T00:00:00.000Z",
  });
}

const input = {
  name: "Upper / Lower",
  templates: [{ name: "Upper A", exercises: [{ exerciseName: "Barbell Bench Press", targetSets: 4, repMin: 5, repMax: 8 }, { exerciseName: "Brand New Move", targetSets: 3, repMin: 8, repMax: 12 }] }],
};

describe("programService authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mockReset();
  });

  it("blocks COACH from creating, editing, duplicating, archiving, activating and proposing (403)", async () => {
    as("COACH");
    const calls = [
      () => programService.create(input),
      () => programService.update({ ...input, id: "p1" }),
      () => programService.duplicate("p1"),
      () => programService.setArchived("p1", true),
      () => programService.setActive("p1"),
      () => programService.propose("four day program"),
      () => programService.confirmProposal(input, "ai"),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(AuthorizationError);
    expect(prog.createProgram).not.toHaveBeenCalled();
    expect(prog.logProposal).not.toHaveBeenCalled();
  });
});

describe("programService owner flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mockReset();
    as("OWNER");
    ex.list.mockResolvedValue([{ id: "e1", name: "Barbell Bench Press", aliases: "Bench Press" }] as never);
    ex.create.mockImplementation(((d: { name: string }) => Promise.resolve({ id: "new1", ...d })) as never);
    prog.list.mockResolvedValue([]);
    prog.createProgram.mockResolvedValue({ id: "p1" } as never);
    prog.createTemplate.mockResolvedValue({ id: "t1" } as never);
    prog.getById.mockResolvedValue({ id: "p1", name: "Upper / Lower", programType: "CUSTOM", description: null, isActive: true, archived: false, source: "MANUAL", templates: [] } as never);
  });

  it("creates a program, reusing library exercises and adding unknown ones as custom", async () => {
    await programService.create(input);
    expect(ex.create).toHaveBeenCalledTimes(1);
    expect(ex.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Brand New Move", isCustom: true }));
    expect(prog.createProgram).toHaveBeenCalledWith(expect.objectContaining({ athleteId: "a1", isActive: true }));
    const rows = prog.replaceTemplateExercises.mock.calls[0][1];
    expect(rows.map((r) => r.exerciseId)).toEqual(["e1", "new1"]);
  });

  it("rejects invalid programs before saving", async () => {
    await expect(programService.create({ name: "", templates: [] })).rejects.toThrow();
    expect(prog.createProgram).not.toHaveBeenCalled();
  });

  it("archives templates still referenced by past workouts instead of deleting them", async () => {
    prog.getById.mockResolvedValue({
      id: "p1", name: "P", programType: "CUSTOM", description: null, isActive: true, archived: false, source: "MANUAL",
      templates: [{ id: "old", name: "Old", weekday: null, notes: null, exercises: [] }],
    } as never);
    prog.getTemplate.mockResolvedValue(null);
    prog.templateSessionCount.mockResolvedValue(3);
    await programService.update({ ...input, id: "p1" });
    expect(prog.updateTemplate).toHaveBeenCalledWith("a1", "old", { archived: true });
    expect(prog.deleteTemplate).not.toHaveBeenCalled();
  });

  it("proposals are never saved: AI proposal is returned for review only", async () => {
    ex.list.mockResolvedValue([]);
    vi.mocked(exerciseEntryRepository.list).mockResolvedValue([]);
    vi.mocked(generateProgramWithAi).mockResolvedValue({ summary: "Plan", program: { name: "AI Plan", programType: "CUSTOM", templates: [{ name: "D", exercises: [{ exerciseName: "Squat", targetSets: 3, repMin: 5, repMax: 8 }] }] } } as never);
    const res = await programService.propose("Create a four-day program focused on bench");
    expect(res.source).toBe("ai");
    expect(prog.createProgram).not.toHaveBeenCalled();
    expect(ex.create).not.toHaveBeenCalled();
  });

  it("falls back to the rule-based builder when AI returns nothing", async () => {
    vi.mocked(exerciseEntryRepository.list).mockResolvedValue([]);
    vi.mocked(generateProgramWithAi).mockResolvedValue(null);
    const res = await programService.propose("Create a four-day program focused on bench");
    expect(res.source).toBe("rules");
    expect(res.program.templates).toHaveLength(4);
    expect(prog.createProgram).not.toHaveBeenCalled();
  });

  it("writes an audit entry when a proposal is confirmed", async () => {
    await programService.confirmProposal(input, "ai");
    expect(prog.logProposal).toHaveBeenCalledWith(expect.objectContaining({ kind: "PROGRAM", status: "APPROVED", athleteId: "a1" }));
    expect(prog.createProgram).toHaveBeenCalledWith(expect.objectContaining({ source: "AI" }));
  });
});

describe("generateProgramWithAi output validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("@/ai/program");
  });

  async function runWith(content: string) {
    vi.resetModules();
    vi.doUnmock("@/ai/program");
    vi.doMock("@/ai/client", () => ({ getAzureOpenAiConfig: () => ({ endpoint: "https://x/", deployment: "d", apiVersion: "v" }) }));
    vi.doMock("@/ai/llm", () => ({ getManagedIdentityToken: async () => "t" }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) })));
    const mod = await import("@/ai/program");
    return mod.generateProgramWithAi({ request: "x", daysPerWeek: 4, library: [], strength: [], sessionsPerWeek: 3, equipment: [] });
  }

  it("rejects malformed or invalid model output", async () => {
    expect(await runWith("not json")).toBeNull();
    expect(await runWith(JSON.stringify({ summary: "s", program: { name: "n", templates: [] } }))).toBeNull();
    expect(await runWith(JSON.stringify({ summary: "s", program: { name: "n", templates: [{ name: "d", exercises: [{ exerciseName: "x", repMin: 12, repMax: 5 }] }] } }))).toBeNull();
  });

  it("accepts a valid proposal", async () => {
    const ok = await runWith(JSON.stringify({ summary: "s", program: { name: "n", templates: [{ name: "d", exercises: [{ exerciseName: "Squat", targetSets: 3, repMin: 5, repMax: 8 }] }] } }));
    expect(ok?.program.templates[0].exercises[0].exerciseName).toBe("Squat");
  });
});
