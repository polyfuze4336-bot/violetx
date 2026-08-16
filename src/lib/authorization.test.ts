import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session source so we can assert server-side authorization without
// a real Entra sign-in. This proves COACH is blocked at the backend, not just
// in the UI.
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
  default: vi.fn(),
}));

import { getServerSession } from "next-auth";

import { requireAuth, requireOwner } from "@/lib/auth";
import { requireOwnerAthlete } from "@/lib/services/context";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { measurementService } from "@/lib/services/measurement";
import { AuthenticationError, AuthorizationError } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";

const mocked = vi.mocked(getServerSession);

function session(role: Role, athleteId: string | null) {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      role,
      athleteId,
    },
    expires: "2999-01-01T00:00:00.000Z",
  };
}

describe("authorization (backend enforcement)", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mocked.mockResolvedValue(null);
    const err = await requireAuth().catch((e) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.status).toBe(401);
  });

  it("blocks COACH from owner-only actions with 403", async () => {
    mocked.mockResolvedValue(session("COACH", "athlete-1"));
    const err = await requireOwner().catch((e) => e);
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err.status).toBe(403);
  });

  it("blocks COACH at the athlete-scoped write gate", async () => {
    mocked.mockResolvedValue(session("COACH", "athlete-1"));
    await expect(requireOwnerAthlete()).rejects.toBeInstanceOf(
      AuthorizationError
    );
  });

  it("blocks COACH from a mutation service (create body weight)", async () => {
    mocked.mockResolvedValue(session("COACH", "athlete-1"));
    const err = await bodyWeightService
      .create({ date: new Date(), weightKg: 70 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err.status).toBe(403);
  });

  it("blocks COACH from creating a measurement (403)", async () => {
    mocked.mockResolvedValue(session("COACH", "athlete-1"));
    const err = await measurementService
      .createEntry({
        typeId: "t1",
        date: new Date(),
        value: 38.1,
        unit: "INCH",
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err.status).toBe(403);
  });

  it("blocks COACH from deleting a measurement (403)", async () => {
    mocked.mockResolvedValue(session("COACH", "athlete-1"));
    const err = await measurementService.deleteEntry("m1").catch((e) => e);
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err.status).toBe(403);
  });

  it("allows OWNER through the write gate", async () => {
    mocked.mockResolvedValue(session("OWNER", "athlete-1"));
    const ctx = await requireOwnerAthlete();
    expect(ctx.athleteId).toBe("athlete-1");
    expect(ctx.actor.role).toBe("OWNER");
  });

  it("allows COACH to read", async () => {
    mocked.mockResolvedValue(session("COACH", "athlete-1"));
    const ctx = await requireAuth();
    expect(ctx.role).toBe("COACH");
  });
});
