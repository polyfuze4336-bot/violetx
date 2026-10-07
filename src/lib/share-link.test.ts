import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
  default: vi.fn(),
}));

vi.mock("@/lib/repositories/shareLink", () => ({
  shareLinkRepository: {
    list: vi.fn(),
    create: vi.fn(),
    findByTokenHash: vi.fn(),
    revoke: vi.fn(),
    touch: vi.fn(),
  },
}));
vi.mock("@/lib/repositories/bodyWeight", () => ({
  bodyWeightRepository: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/lib/repositories/measurement", () => ({
  measurementEntryRepository: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/lib/repositories/exercise", () => ({
  exerciseEntryRepository: { list: vi.fn().mockResolvedValue([]) },
}));

import { getServerSession } from "next-auth";

import { shareLinkRepository } from "@/lib/repositories/shareLink";
import { shareLinkService } from "@/lib/services/shareLink";
import { AuthorizationError } from "@/lib/rbac";
import {
  computeShareExpiry,
  generateShareToken,
  hashShareToken,
  isWellFormedShareToken,
  shareLinkStatus,
} from "@/lib/share-link";

const repo = vi.mocked(shareLinkRepository);
const session = vi.mocked(getServerSession);

function as(role: "OWNER" | "COACH") {
  session.mockResolvedValue({
    user: { id: "u1", email: "u@example.com", role, athleteId: "a1" },
    expires: "2999-01-01T00:00:00.000Z",
  });
}

describe("share-link helpers", () => {
  it("generates unique, well-formed 256-bit tokens", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
    expect(isWellFormedShareToken(a)).toBe(true);
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "short", "x".repeat(44), "../etc/passwd", 42, null]) {
      expect(isWellFormedShareToken(bad)).toBe(false);
    }
  });

  it("hashes deterministically and never returns the raw token", () => {
    const t = generateShareToken();
    expect(hashShareToken(t)).toBe(hashShareToken(t));
    expect(hashShareToken(t)).not.toContain(t);
    expect(hashShareToken(t)).toHaveLength(64);
  });

  it("derives status from expiry and revocation", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const future = computeShareExpiry(7, now);
    expect(shareLinkStatus({ expiresAt: future, revokedAt: null }, now)).toBe(
      "active"
    );
    expect(
      shareLinkStatus({ expiresAt: new Date("2026-01-09T00:00:00Z"), revokedAt: null }, now)
    ).toBe("expired");
    expect(shareLinkStatus({ expiresAt: future, revokedAt: now }, now)).toBe(
      "revoked"
    );
  });
});

describe("shareLinkService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mockReset();
  });

  it("blocks COACH from creating, listing and revoking links (403)", async () => {
    as("COACH");
    await expect(shareLinkService.create({})).rejects.toBeInstanceOf(
      AuthorizationError
    );
    await expect(shareLinkService.list()).rejects.toBeInstanceOf(
      AuthorizationError
    );
    await expect(shareLinkService.revoke("x")).rejects.toBeInstanceOf(
      AuthorizationError
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("stores only the token hash when the OWNER creates a link", async () => {
    as("OWNER");
    repo.create.mockImplementation(async (d) => ({
      id: "l1",
      athleteId: d.athleteId,
      tokenHash: d.tokenHash,
      label: d.label,
      expiresAt: d.expiresAt,
      revokedAt: null,
      lastViewedAt: null,
      createdAt: new Date(),
    }));
    const { token } = await shareLinkService.create({ expiresInDays: 7 });
    const stored = repo.create.mock.calls[0][0];
    expect(stored.tokenHash).toBe(hashShareToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.athleteId).toBe("a1");
  });

  it("returns null (no data) for malformed, unknown, expired and revoked tokens", async () => {
    expect(await shareLinkService.getSharedProgress("nope")).toBeNull();

    const token = generateShareToken();
    repo.findByTokenHash.mockResolvedValue(null);
    expect(await shareLinkService.getSharedProgress(token)).toBeNull();

    const base = {
      id: "l1",
      athleteId: "a1",
      tokenHash: hashShareToken(token),
      label: null,
      lastViewedAt: null,
      createdAt: new Date(),
    };
    repo.findByTokenHash.mockResolvedValue({
      ...base,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    });
    expect(await shareLinkService.getSharedProgress(token)).toBeNull();

    repo.findByTokenHash.mockResolvedValue({
      ...base,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: new Date(),
    });
    expect(await shareLinkService.getSharedProgress(token)).toBeNull();
  });

  it("serves read-only data for an active token", async () => {
    const token = generateShareToken();
    repo.findByTokenHash.mockResolvedValue({
      id: "l1",
      athleteId: "a1",
      tokenHash: hashShareToken(token),
      label: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      lastViewedAt: null,
      createdAt: new Date(),
    });
    repo.touch.mockResolvedValue(undefined);
    const data = await shareLinkService.getSharedProgress(token);
    expect(data).not.toBeNull();
    expect(data).not.toHaveProperty("notes");
  });
});
