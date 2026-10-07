import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("@/ai/coach-qa", () => ({ answerWithAi: vi.fn() }));

import { getServerSession } from "next-auth";

import { violetCoachService } from "@/lib/services/violetCoach";
import { AuthorizationError } from "@/lib/rbac";

describe("violetCoachService authorization", () => {
  beforeEach(() => vi.mocked(getServerSession).mockReset());

  it("only the owner can ask Violet or read her evidence snapshot", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "c@e.com", role: "COACH", athleteId: "a1" },
      expires: "2999-01-01T00:00:00.000Z",
    });
    await expect(violetCoachService.ask("How am I doing?")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(violetCoachService.snapshot()).rejects.toBeInstanceOf(AuthorizationError);
  });
});
