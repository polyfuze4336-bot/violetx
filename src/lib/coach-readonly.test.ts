import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));

import { getServerSession } from "next-auth";

import { exerciseService } from "@/lib/services/exercise";
import { gymService } from "@/lib/services/gym";
import { nutritionService } from "@/lib/services/nutrition";
import { shareLinkService } from "@/lib/services/shareLink";
import { workoutService } from "@/lib/services/workout";
import { programService } from "@/lib/services/program";
import { goalService } from "@/lib/services/goal";
import { checkInService } from "@/lib/services/checkin";
import { AuthorizationError } from "@/lib/rbac";

// Cross-cutting guarantee: a COACH can read but can never change anything.
describe("coach is strictly read-only across V2 services", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "c1", email: "coach@example.com", role: "COACH", athleteId: "a1" },
      expires: "2999-01-01T00:00:00.000Z",
    });
  });

  const mutations: [string, () => Promise<unknown>][] = [
    ["seed exercise library", () => exerciseService.seedStarterLibrary()],
    ["create exercise", () => exerciseService.create({ name: "X", active: true })],
    ["set nutrition targets", () => nutritionService.setTargets({ calories: 2000 })],
    ["search gyms (owner picker)", () => gymService.searchBranches("kl")],
    ["mark gym visited", () => gymService.markVisited("g1")],
    ["create share link", () => shareLinkService.create({})],
    ["start workout", () => workoutService.start({ date: "2026-08-20" })],
    ["log set", () => workoutService.logSet({ workoutExerciseId: "w", weightKg: 50, reps: 5 })],
    ["finish workout", () => workoutService.finish({})],
    ["create program", () => programService.create({ name: "P", templates: [{ name: "D", exercises: [{ exerciseName: "Squat" }] }] })],
    ["accept AI proposal", () => programService.confirmProposal({ name: "P", templates: [{ name: "D", exercises: [{ exerciseName: "Squat" }] }] }, "ai")],
    ["create goal", () => goalService.create({ type: "BODY_WEIGHT", targetValue: 70 })],
    ["save check-in", () => checkInService.upsert({ date: "2026-08-20", sleepHours: 7, sleepQuality: 3, energy: 3, soreness: 3, stress: 3, motivation: 3 })],
  ];

  for (const [name, call] of mutations) {
    it(`blocks: ${name}`, async () => {
      const err = (await call().catch((e) => e)) as { status?: number };
      expect(err).toBeInstanceOf(AuthorizationError);
      expect(err.status).toBe(403);
    });
  }
});
