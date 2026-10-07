import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("@/lib/repositories/workout", () => ({
  workoutRepository: {
    findActive: vi.fn(),
    getById: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    createWorkoutExercise: vi.fn(),
    getWorkoutExercise: vi.fn(),
    updateWorkoutExercise: vi.fn(),
    maxSortOrder: vi.fn(),
    exerciseHistory: vi.fn(),
    createSet: vi.fn(),
    getSet: vi.fn(),
    updateSet: vi.fn(),
    deleteSet: vi.fn(),
    countSessionSets: vi.fn(),
    discardSession: vi.fn(),
    deleteWorkoutExercise: vi.fn(),
    listSessions: vi.fn(),
    findGymVisitOnDay: vi.fn(),
    createGymVisit: vi.fn(),
    gymBranchExists: vi.fn(),
  },
}));
vi.mock("@/lib/repositories/exercise", () => ({
  exerciseRepository: { getById: vi.fn() },
}));

import { getServerSession } from "next-auth";

import { workoutRepository } from "@/lib/repositories/workout";
import { exerciseRepository } from "@/lib/repositories/exercise";
import { workoutService } from "@/lib/services/workout";
import { AuthorizationError } from "@/lib/rbac";

const repo = vi.mocked(workoutRepository);
const session = vi.mocked(getServerSession);

function as(role: "OWNER" | "COACH") {
  session.mockResolvedValue({
    user: { id: "u1", email: "u@example.com", role, athleteId: "a1" },
    expires: "2999-01-01T00:00:00.000Z",
  });
}

const day = new Date("2026-08-20T00:00:00Z");
const row = (date: string, weightKg: number, reps: number, sessionId: string) => ({
  id: `${date}-${weightKg}-${reps}`,
  athleteId: "a1",
  exerciseId: "ex1",
  sessionId,
  date: new Date(date),
  reps,
  weightKg,
  setType: "WORK",
  rpe: null,
  rir: null,
});

describe("workoutService authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mockReset();
  });

  it("blocks COACH from every live-workout mutation (403)", async () => {
    as("COACH");
    const calls = [
      () => workoutService.start({ date: "2026-08-20" }),
      () => workoutService.addExercise("ex1"),
      () => workoutService.logSet({ workoutExerciseId: "we1", weightKg: 50, reps: 5 }),
      () => workoutService.updateSet({ setId: "s1", reps: 6 }),
      () => workoutService.deleteSet("s1"),
      () => workoutService.setSkipped("we1", true),
      () => workoutService.finish({}),
      () => workoutService.discard(),
      () => workoutService.getActive(),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toBeInstanceOf(AuthorizationError);
    }
    expect(repo.createSession).not.toHaveBeenCalled();
    expect(repo.createSet).not.toHaveBeenCalled();
  });

  it("lets COACH read the workout log", async () => {
    as("COACH");
    repo.listSessions.mockResolvedValue([]);
    await expect(workoutService.listSessions()).resolves.toEqual([]);
  });
});

describe("workoutService lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mockReset();
    as("OWNER");
  });

  const active = {
    id: "s1",
    athleteId: "a1",
    date: day,
    name: null,
    status: "IN_PROGRESS",
    startedAt: new Date("2026-08-20T10:00:00Z"),
    gymBranchId: null,
    gymBranch: null,
    exercises: [],
  };

  it("starts a workout and resumes an existing one instead of creating another", async () => {
    repo.findActive.mockResolvedValueOnce(null);
    repo.createSession.mockResolvedValue({ ...active } as never);
    vi.mocked(exerciseRepository.getById).mockResolvedValue({ id: "ex1" } as never);
    repo.createWorkoutExercise.mockResolvedValue({} as never);
    repo.getById.mockResolvedValue({ ...active, exercises: [] } as never);
    const started = await workoutService.start({ date: "2026-08-20", exerciseIds: ["ex1"] });
    expect(repo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: "a1", status: "IN_PROGRESS" })
    );
    expect(started.id).toBe("s1");

    repo.createSession.mockClear();
    repo.findActive.mockResolvedValueOnce({ ...active, exercises: [] } as never);
    await workoutService.start({ date: "2026-08-20" });
    expect(repo.createSession).not.toHaveBeenCalled();
  });

  it("logs a set and reports a weight PR against earlier sessions", async () => {
    repo.findActive.mockResolvedValue({ ...active, exercises: [] } as never);
    repo.getWorkoutExercise.mockResolvedValue({
      id: "we1",
      sessionId: "s1",
      exerciseId: "ex1",
      skipped: false,
      sets: [],
    } as never);
    repo.exerciseHistory.mockResolvedValue([
      row("2026-08-13", 80, 8, "old"),
      row("2026-08-13", 80, 8, "old"),
    ] as never);
    repo.countSessionSets.mockResolvedValue(0);
    repo.createSet.mockImplementation(((d: object) => Promise.resolve({ id: "n1", ...d })) as never);

    const res = await workoutService.logSet({ workoutExerciseId: "we1", weightKg: 82.5, reps: 8 });
    expect(res.set.weightKg).toBe(82.5);
    expect(res.prs.map((p) => p.type)).toContain("WEIGHT");
    expect(repo.createSet).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: "a1", sessionId: "s1", workoutExerciseId: "we1", setType: "WORK" })
    );
  });

  it("rejects invalid sets before touching the database", async () => {
    await expect(
      workoutService.logSet({ workoutExerciseId: "we1", weightKg: 50, reps: 0 })
    ).rejects.toThrow();
    await expect(
      workoutService.logSet({ workoutExerciseId: "we1", weightKg: -5, reps: 5 })
    ).rejects.toThrow();
    expect(repo.createSet).not.toHaveBeenCalled();
  });

  it("does not log sets on a skipped exercise", async () => {
    repo.findActive.mockResolvedValue({ ...active, exercises: [] } as never);
    repo.getWorkoutExercise.mockResolvedValue({ id: "we1", sessionId: "s1", exerciseId: "ex1", skipped: true, sets: [] } as never);
    await expect(workoutService.logSet({ workoutExerciseId: "we1", weightKg: 50, reps: 5 })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("discards a workout with no sets when finishing", async () => {
    repo.findActive.mockResolvedValue({ ...active, exercises: [{ id: "we1", exerciseId: "ex1", sets: [], exercise: { name: "Bench" } }] } as never);
    const summary = await workoutService.finish({});
    expect(summary.discarded).toBe(true);
    expect(repo.discardSession).toHaveBeenCalledWith("a1", "s1");
    expect(repo.updateSession).not.toHaveBeenCalled();
  });

  it("completes a workout, summarises volume (excluding warm-ups) and records the gym visit", async () => {
    const sets = [
      { id: "a", weightKg: 60, reps: 10, setType: "WARMUP", rpe: null, rir: null },
      { id: "b", weightKg: 82.5, reps: 8, setType: "WORK", rpe: null, rir: null },
      { id: "c", weightKg: 82.5, reps: 8, setType: "WORK", rpe: null, rir: null },
    ];
    repo.findActive.mockResolvedValue({
      ...active,
      gymBranchId: "g1",
      exercises: [{ id: "we1", exerciseId: "ex1", exercise: { name: "Bench" }, sets }],
    } as never);
    repo.gymBranchExists.mockResolvedValue({ id: "g1" } as never);
    repo.findGymVisitOnDay.mockResolvedValue(null);
    repo.exerciseHistory.mockResolvedValue([row("2026-08-13", 80, 8, "old")] as never);

    const summary = await workoutService.finish({ sessionRpe: 8 });
    expect(summary.discarded).toBe(false);
    expect(summary.totalSets).toBe(2);
    expect(summary.totalVolumeKg).toBe(82.5 * 8 * 2);
    expect(summary.prs[0].achievements.map((a) => a.type)).toContain("WEIGHT");
    expect(repo.updateSession).toHaveBeenCalledWith("a1", "s1", expect.objectContaining({ status: "COMPLETED", sessionRpe: 8 }));
    expect(repo.createGymVisit).toHaveBeenCalledWith(expect.objectContaining({ gymBranchId: "g1", source: "WORKOUT" }));
  });
});
