import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("@/lib/repositories/exercise", () => ({ exerciseEntryRepository: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/repositories/bodyWeight", () => ({ bodyWeightRepository: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/repositories/measurement", () => ({ measurementEntryRepository: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/repositories/goal", () => ({ checkInRepository: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/repositories/program", () => ({ programRepository: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/services/nutrition", () => ({
  nutritionService: {
    list: vi.fn().mockResolvedValue([{ entryDate: "2026-08-18T00:00:00Z", calories: 2000, protein: 100, water: 2 }]),
    getTargets: vi.fn().mockResolvedValue({ calories: 2100, protein: 160, waterL: 3 }),
  },
}));

import { getServerSession } from "next-auth";

import { nutritionService } from "@/lib/services/nutrition";
import { weeklyReviewService } from "@/lib/services/weeklyReview";

const as = (role: "OWNER" | "COACH") =>
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u1", email: "u@e.com", role, athleteId: "a1" }, expires: "2999-01-01T00:00:00.000Z" });

describe("weeklyReviewService privacy", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(nutritionService.list).mockClear();
  });

  it("includes nutrition for the owner", async () => {
    as("OWNER");
    const r = await weeklyReviewService.get("2026-08-19");
    expect(r.nutrition?.daysLogged).toBe(1);
  });

  it("never loads or exposes nutrition for a coach", async () => {
    as("COACH");
    const r = await weeklyReviewService.get("2026-08-19");
    expect(r.nutrition).toBeNull();
    expect(nutritionService.list).not.toHaveBeenCalled();
  });
});
