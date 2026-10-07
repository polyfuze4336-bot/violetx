import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("@/lib/repositories/goal", () => ({
  goalRepository: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn() },
  checkInRepository: { list: vi.fn(), getByDate: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/repositories/exercise", () => ({
  exerciseRepository: { list: vi.fn().mockResolvedValue([]), getById: vi.fn() },
  exerciseEntryRepository: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/lib/repositories/bodyWeight", () => ({ bodyWeightRepository: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/repositories/measurement", () => ({ measurementEntryRepository: { list: vi.fn().mockResolvedValue([]) } }));

import { getServerSession } from "next-auth";

import { checkInRepository, goalRepository } from "@/lib/repositories/goal";
import { checkInService } from "@/lib/services/checkin";
import { goalService } from "@/lib/services/goal";
import { AuthorizationError } from "@/lib/rbac";

const session = vi.mocked(getServerSession);
const as = (role: "OWNER" | "COACH") =>
  session.mockResolvedValue({ user: { id: "u1", email: "u@e.com", role, athleteId: "a1" }, expires: "2999-01-01T00:00:00.000Z" });

const checkIn = (date: string) => ({
  date: new Date(`${date}T00:00:00Z`),
  sleepHours: 7.5,
  sleepQuality: 4,
  energy: 4,
  soreness: 2,
  stress: 2,
  motivation: 4,
  restingHr: 55,
  notes: "private note",
});

describe("goals and check-ins authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mockReset();
  });

  it("blocks COACH from creating/updating goals and check-ins (403)", async () => {
    as("COACH");
    await expect(goalService.create({ type: "BODY_WEIGHT", targetValue: 70 })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(goalService.update({ id: "g1", status: "ARCHIVED" })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      checkInService.upsert({ date: "2026-08-20", sleepHours: 7, sleepQuality: 3, energy: 3, soreness: 3, stress: 3, motivation: 3 })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(goalRepository.create).not.toHaveBeenCalled();
    expect(checkInRepository.upsert).not.toHaveBeenCalled();
  });

  it("hides private check-in notes and heart rate from coaches but keeps readiness", async () => {
    vi.mocked(checkInRepository.list).mockResolvedValue([checkIn("2026-08-20")] as never);
    as("COACH");
    const view = await checkInService.overview("2026-08-20");
    expect(view.history[0].notes).toBeNull();
    expect(view.history[0].restingHr).toBeNull();
    expect(view.history[0].readiness.score).toBeGreaterThan(0);

    as("OWNER");
    const own = await checkInService.overview("2026-08-20");
    expect(own.history[0].notes).toBe("private note");
  });

  it("owner goal creation validates input and captures the starting value", async () => {
    as("OWNER");
    await expect(goalService.create({ type: "STRENGTH", targetValue: 120 })).rejects.toThrow(); // exercise required
    await expect(goalService.create({ type: "BODY_WEIGHT", targetValue: -5 })).rejects.toThrow();
    expect(goalRepository.create).not.toHaveBeenCalled();
  });

  it("rejects out-of-range check-in values", async () => {
    as("OWNER");
    await expect(
      checkInService.upsert({ date: "2026-08-20", sleepHours: 30, sleepQuality: 9, energy: 3, soreness: 3, stress: 3, motivation: 3 })
    ).rejects.toThrow();
    expect(checkInRepository.upsert).not.toHaveBeenCalled();
  });
});
