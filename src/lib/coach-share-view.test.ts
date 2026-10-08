import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/repositories/shareLink", () => ({
  shareLinkRepository: { list: vi.fn(), create: vi.fn(), findByTokenHash: vi.fn(), revoke: vi.fn(), touch: vi.fn() },
}));
vi.mock("@/lib/repositories/bodyWeight", () => ({ bodyWeightRepository: { list: vi.fn() } }));
vi.mock("@/lib/repositories/measurement", () => ({ measurementEntryRepository: { list: vi.fn() } }));
vi.mock("@/lib/repositories/exercise", () => ({
  exerciseEntryRepository: { list: vi.fn(), create: vi.fn() },
  exerciseRepository: { list: vi.fn(), create: vi.fn(), findByName: vi.fn() },
}));
vi.mock("@/lib/services/goal", () => ({ loadGoals: vi.fn() }));
vi.mock("@/lib/services/workout", () => ({ listWorkoutsFor: vi.fn() }));
vi.mock("@/lib/services/checkin", () => ({ readinessHistory: vi.fn() }));
vi.mock("@/lib/services/analytics", () => ({ computeAnalytics: vi.fn() }));

import { getServerSession } from "next-auth";

import { guardSharePath } from "@/middleware";
import { shareLinkRepository } from "@/lib/repositories/shareLink";
import { bodyWeightRepository } from "@/lib/repositories/bodyWeight";
import { measurementEntryRepository } from "@/lib/repositories/measurement";
import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { loadGoals } from "@/lib/services/goal";
import { listWorkoutsFor } from "@/lib/services/workout";
import { readinessHistory } from "@/lib/services/checkin";
import { computeAnalytics } from "@/lib/services/analytics";
import { exerciseEntryService } from "@/lib/services/exercise";
import { shareLinkService } from "@/lib/services/shareLink";
import { importService } from "@/lib/services/import";
import { AuthenticationError } from "@/lib/rbac";
import { createShareLinkSchema } from "@/lib/schemas";
import {
  NEVER_EXPIRES,
  computeShareExpiry,
  generateShareToken,
  hashShareToken,
  isNeverExpiring,
  shareLinkStatus,
} from "@/lib/share-link";
import { detectE1rmPrs, forCoach } from "@/lib/coach-view";

const repo = vi.mocked(shareLinkRepository);
const DAY = 86_400_000;

function linkRow(token: string, patch: Partial<{ expiresAt: Date; revokedAt: Date | null }> = {}) {
  return {
    id: "link-internal-id",
    athleteId: "athlete-internal-id",
    tokenHash: hashShareToken(token),
    label: "Coach Sam",
    expiresAt: new Date(Date.now() + 7 * DAY),
    revokedAt: null,
    lastViewedAt: null,
    createdAt: new Date(),
    ...patch,
  };
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const set = (id: string, name: string, equipment: string | null, date: string, weightKg: number, reps: number, position = 0) => ({
  id: `entry-${id}`,
  athleteId: "athlete-internal-id",
  exerciseId: `exid-${name}`,
  exercise: { id: `exid-${name}`, name, equipment, muscleGroup: null },
  date: d(date),
  weightKg,
  reps,
  position,
  setType: "WORK",
  sets: null,
  note: "PRIVATE NOTE",
  source: "MANUAL",
  sessionId: null,
});

function seed() {
  vi.mocked(bodyWeightRepository.list).mockResolvedValue([
    { id: "bw-1", athleteId: "athlete-internal-id", date: d("2026-09-01"), weightKg: 80, note: "PRIVATE NOTE", source: "MANUAL" },
    { id: "bw-2", athleteId: "athlete-internal-id", date: d("2026-09-20"), weightKg: 78.5, note: null, source: "MANUAL" },
  ] as never);
  vi.mocked(measurementEntryRepository.list).mockResolvedValue([
    { id: "m-1", typeId: "type-internal", type: { name: "Waist" }, date: d("2026-09-01"), value: 90, unit: "CM", note: "PRIVATE NOTE", source: "MANUAL" },
  ] as never);
  vi.mocked(exerciseEntryRepository.list).mockResolvedValue([
    set("1", "Bench Press", "Barbell", "2026-09-01", 80, 8),
    set("2", "Bench Press", "Barbell", "2026-09-10", 80, 10), // rep PR + e1RM PR
    set("3", "Bench Press", "Barbell", "2026-09-20", 82.5, 8), // weight PR
    set("4", "Assisted Chin-Up", "Assisted Machine", "2026-09-01", 40, 8),
    set("5", "Assisted Chin-Up", "Assisted Machine", "2026-09-20", 25, 8), // assistance PR
  ] as never);
  vi.mocked(loadGoals).mockResolvedValue([
    {
      id: "goal-internal",
      title: "Reach 75 kg",
      type: "BODY_WEIGHT",
      status: "ACTIVE",
      unit: "kg",
      notes: "PRIVATE NOTE",
      progress: { pct: 40, current: 78.5, target: 75, start: 80, achieved: false },
    },
  ] as never);
  vi.mocked(listWorkoutsFor).mockResolvedValue([
    { id: "wk-internal", date: "2026-09-20T00:00:00Z", name: "Push", status: "COMPLETED", durationMin: 55, sets: 12, volumeKg: 5000, exercises: ["Bench Press"], gym: "Secret Gym", sessionRpe: 8 },
  ] as never);
  vi.mocked(readinessHistory).mockResolvedValue([
    { date: "2026-09-19", score: 70 },
    { date: "2026-09-20", score: 75 },
  ]);
  vi.mocked(computeAnalytics).mockResolvedValue({
    totals: { workouts: 12, workoutsPerWeek: 3, avgSessionRpe: 7 },
    consistency: { pct: 80 },
    adherence: { pct: 90 },
    buckets: [
      { label: "W1", workouts: 3, volumeKg: 4000 },
      { label: "W2", workouts: 4, volumeKg: 5000 },
    ],
    e1rmTrends: [{ name: "Bench Press", changePct: 8, points: [{ date: "2026-09-01", e1rm: 101.3 }, { date: "2026-09-20", e1rm: 104.5 }] }],
  } as never);
  repo.touch.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockReset();
  vi.mocked(getServerSession).mockResolvedValue(null);
  seed();
});

describe("link lifecycle", () => {
  it("a valid link returns the read-only view and records the view", async () => {
    const token = generateShareToken();
    repo.findByTokenHash.mockResolvedValue(linkRow(token));
    const data = await shareLinkService.getSharedProgress(token);
    expect(data).not.toBeNull();
    expect(data!.expiresAt).not.toBeNull();
    expect(repo.touch).toHaveBeenCalledTimes(1);
  });

  it.each(["", "abc", "x".repeat(43) + "!", "../../etc/passwd", "a".repeat(200)])("an invalid token (%s) returns nothing and never queries", async (bad) => {
    expect(await shareLinkService.getSharedProgress(bad)).toBeNull();
    expect(repo.findByTokenHash).not.toHaveBeenCalled();
  });

  it("an unknown (well-formed) token returns nothing", async () => {
    repo.findByTokenHash.mockResolvedValue(null);
    expect(await shareLinkService.getSharedProgress(generateShareToken())).toBeNull();
    expect(repo.touch).not.toHaveBeenCalled();
  });

  it("an expired link returns nothing and does not touch data", async () => {
    const token = generateShareToken();
    repo.findByTokenHash.mockResolvedValue(linkRow(token, { expiresAt: new Date(Date.now() - 1000) }));
    expect(await shareLinkService.getSharedProgress(token)).toBeNull();
    expect(bodyWeightRepository.list).not.toHaveBeenCalled();
    expect(repo.touch).not.toHaveBeenCalled();
  });

  it("a revoked link returns nothing, even if it has not expired", async () => {
    const token = generateShareToken();
    repo.findByTokenHash.mockResolvedValue(linkRow(token, { revokedAt: new Date() }));
    expect(await shareLinkService.getSharedProgress(token)).toBeNull();
    expect(exerciseEntryRepository.list).not.toHaveBeenCalled();
  });

  it("all unavailable cases are indistinguishable (all null)", async () => {
    const token = generateShareToken();
    const outcomes = [];
    for (const row of [null, linkRow(token, { revokedAt: new Date() }), linkRow(token, { expiresAt: new Date(0) })]) {
      repo.findByTokenHash.mockResolvedValue(row);
      outcomes.push(await shareLinkService.getSharedProgress(token));
    }
    expect(outcomes).toEqual([null, null, null]);
  });

  it("a never-expiring link works and reports no expiry", async () => {
    const token = generateShareToken();
    repo.findByTokenHash.mockResolvedValue(linkRow(token, { expiresAt: NEVER_EXPIRES }));
    const data = await shareLinkService.getSharedProgress(token);
    expect(data!.expiresAt).toBeNull();
  });
});

describe("expiry options", () => {
  it("supports never, 7 days, 30 days and custom days", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(isNeverExpiring(computeShareExpiry("never", now))).toBe(true);
    expect(computeShareExpiry(7, now).toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(computeShareExpiry(30, now).toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(computeShareExpiry(45, now).toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(shareLinkStatus({ expiresAt: computeShareExpiry("never", now), revokedAt: null }, new Date("2100-01-01"))).toBe("active");
  });

  it("validates the requested expiry", () => {
    const ok = (v: unknown) => createShareLinkSchema.safeParse({ expiresInDays: v }).success;
    expect([ok("never"), ok(7), ok(30), ok(14), ok("21"), ok(365)]).toEqual([true, true, true, true, true, true]);
    expect([ok(0), ok(-1), ok(366), ok(1.5), ok("soon"), ok(null)]).toEqual([false, false, false, false, false, false]);
    expect(createShareLinkSchema.parse({}).expiresInDays).toBe(30);
  });
});

describe("what a coach link exposes", () => {
  async function view() {
    const token = generateShareToken();
    repo.findByTokenHash.mockResolvedValue(linkRow(token));
    return shareLinkService.getSharedProgress(token);
  }

  it("contains no ids, emails, notes, gym names or account details", async () => {
    const json = JSON.stringify(await view());
    for (const secret of [
      "athlete-internal-id",
      "link-internal-id",
      "entry-",
      "exid-",
      "bw-1",
      "m-1",
      "type-internal",
      "goal-internal",
      "wk-internal",
      "PRIVATE NOTE",
      "Secret Gym",
      "tokenHash",
      "email",
      "password",
      "@",
    ]) {
      expect(json, secret).not.toContain(secret);
    }
    expect(json).not.toMatch(/"(id|athleteId|exerciseId|typeId|userId|note|notes|source|email)"/);
  });

  it("includes every section a coach needs", async () => {
    const data = (await view())!;
    expect(data.weights).toHaveLength(2);
    expect(data.measurements[0]).toEqual({ typeName: "Waist", unit: "CM", date: "2026-09-01T00:00:00.000Z", value: 90 });
    expect(data.goals[0]).toMatchObject({ title: "Reach 75 kg", pct: 40 });
    expect(data.training).toMatchObject({ workoutsPerWeek: 3, adherencePct: 90, consistencyPct: 80 });
    expect(data.workouts[0]).toMatchObject({ name: "Push", sets: 12 });
    expect(data.records.map((r) => r.exerciseName).sort()).toEqual(["Assisted Chin-Up", "Bench Press"]);
    expect(data.observations.bullets.length).toBeGreaterThan(0);
  });

  it("separates weight, rep, estimated-1RM and assistance PRs", async () => {
    const data = (await view())!;
    expect(data.prCounts).toMatchObject({ WEIGHT: 1, REPS: 1, ASSISTANCE: 1 });
    expect(data.prCounts.E1RM).toBeGreaterThanOrEqual(1);
    const byKind = Object.fromEntries(data.achievements.map((a) => [a.kind, a]));
    expect(byKind.ASSISTANCE).toMatchObject({ exerciseName: "Assisted Chin-Up", label: "Assistance PR", assisted: true });
    expect(byKind.ASSISTANCE.detail).toBe("15 kg less assistance (40 → 25 kg)");
    expect(byKind.REPS.detail).toBe("+2 reps at 80 kg");
    expect(byKind.WEIGHT.label).toBe("Weight PR");
  });

  it("shows assisted progression as improvement and never gives assisted lifts an estimated 1RM", async () => {
    const data = (await view())!;
    const chin = data.progressions.find((p) => p.lift === "Assisted Chin-Up");
    expect(chin).toMatchObject({ kind: "ASSISTANCE", assisted: true });
    expect(chin!.text).toContain("15 kg less assistance");
    const rec = data.records.find((r) => r.exerciseName === "Assisted Chin-Up")!;
    expect(rec).toMatchObject({ assisted: true, maxWeightKg: 25, estimatedOneRepMaxKg: 0 });
    expect(data.achievements.some((a) => a.kind === "E1RM" && a.exerciseName === "Assisted Chin-Up")).toBe(false);
  });

  it("shows rep progression for Bench Press", async () => {
    const data = (await view())!;
    expect(data.progressions.some((p) => p.lift === "Bench Press")).toBe(true);
  });
});

describe("coach-view helpers", () => {
  it("detects estimated-1RM PRs per day and skips assisted lifts", () => {
    const prs = detectE1rmPrs([
      { exerciseName: "Squat", date: "2026-09-01", weightKg: 100, reps: 5 },
      { exerciseName: "Squat", date: "2026-09-08", weightKg: 100, reps: 4 },
      { exerciseName: "Squat", date: "2026-09-15", weightKg: 105, reps: 5 },
      { exerciseName: "Chin", date: "2026-09-01", weightKg: 40, reps: 8, assisted: true },
      { exerciseName: "Chin", date: "2026-09-08", weightKg: 30, reps: 8, assisted: true },
    ]);
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ exerciseName: "Squat", date: "2026-09-15" });
  });

  it("rewords second-person summaries for the coach", () => {
    expect(forCoach("You're losing weight while maintaining your strength.", "Patient X")).toBe(
      "Patient X is losing weight while maintaining their strength."
    );
  });
});

describe("read-only enforcement", () => {
  const req = (method: string, p: string) => new NextRequest(`http://localhost${p}`, { method });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("middleware refuses %s on the share route (405)", async (method) => {
    for (const p of ["/share/coach/abc", "/coach/abc", "/share/coach/abc/anything"]) {
      const res = guardSharePath(req(method, p));
      expect(res?.status, `${method} ${p}`).toBe(405);
      expect(res?.headers.get("allow")).toBe("GET, HEAD");
      expect(res?.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("refuses a forged server-action POST to the share URL", () => {
    const forged = new NextRequest("http://localhost/share/coach/abc", {
      method: "POST",
      headers: { "next-action": "deadbeef", "content-type": "text/plain" },
      body: "[]",
    });
    expect(guardSharePath(forged)?.status).toBe(405);
  });

  it("allows GET/HEAD with no-store, noindex and no-referrer headers", () => {
    for (const method of ["GET", "HEAD"]) {
      const res = guardSharePath(req(method, "/share/coach/abc"));
      expect(res?.status).toBe(200);
      expect(res?.headers.get("x-robots-tag")).toContain("noindex");
      expect(res?.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res?.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("leaves other routes alone", () => {
    expect(guardSharePath(req("POST", "/dashboard/weight"))).toBeNull();
    expect(guardSharePath(req("POST", "/api/auth/signin"))).toBeNull();
    expect(guardSharePath(req("GET", "/sharing"))).toBeNull();
  });

  it("a token holder (no session) cannot call write services directly", async () => {
    const calls: (() => Promise<unknown>)[] = [
      () => exerciseEntryService.create({ exerciseId: "x", date: new Date(), reps: 5, weightKg: 50 } as never),
      () => shareLinkService.create({}),
      () => shareLinkService.revoke("link-internal-id"),
      () => importService.commit({ date: new Date(), weightResolution: "IMPORT", measurements: [], sets: [] }),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(AuthenticationError);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.revoke).not.toHaveBeenCalled();
  });

  it("the share routes have no write surface: no actions, forms, buttons or route handlers", () => {
    const roots = [path.resolve("src/app/share"), path.resolve("src/app/coach")];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else files.push(full);
      }
    };
    roots.forEach(walk);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(path.basename(f), f).not.toMatch(/^route\./);
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/["']use server["']/);
      expect(src, f).not.toMatch(/@\/lib\/actions/);
      expect(src, f).not.toMatch(/<form|<button|<Button|onClick|onSubmit|<input|<Input|<textarea/i);
    }
  });

  it("only the share page reads shared data (no other route or API exposes it)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && readFileSync(full, "utf8").includes("getSharedProgress(")) {
          hits.push(path.relative(path.resolve("src"), full).replace(/\\/g, "/"));
        }
      }
    };
    walk(path.resolve("src"));
    expect(hits.sort()).toEqual(["app/share/coach/[token]/page.tsx", "lib/services/shareLink.ts"]);
  });
});

describe("rendering", () => {
  async function render(token: string) {
    const { default: Page } = await import("@/app/share/coach/[token]/page");
    return renderToStaticMarkup(await Page({ params: { token } }));
  }

  it("renders the read-only dashboard with no login, forms or controls (same markup serves phone and desktop)", async () => {
    const token = generateShareToken();
    repo.findByTokenHash.mockResolvedValue(linkRow(token));
    const html = await render(token);
    expect(html).toContain("Patient X");
    expect(html).toMatch(/read only coach view/i);
    for (const section of ["Violet observations", "Current goals", "Weight trend", "Measurement progress", "Strength progression", "Recent achievements", "Assisted exercises", "Workout frequency", "Workout history", "Personal records", "Weight PRs", "Rep PRs", "Est. 1RM PRs", "Program adherence"]) {
      expect(html, section).toContain(section);
    }
    expect(html).not.toMatch(/<form|<input|<textarea|<select|sign ?in|log ?in|password/i);
    // The only buttons are the charts' client-side time-range filters (no server calls).
    const buttons = Array.from(html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)).map((m) => m[1]);
    expect(buttons.every((b) => /^(1M|3M|6M|1Y|ALL|All)$/.test(b))).toBe(true);
    // Responsive layout: stacked/2-column on phones, 4-column from lg, and charts fill their container.
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("lg:grid-cols-4");
    expect(html).toContain("max-w-5xl");
    expect(html).toContain("overflow-x-auto");
  }, 90_000);

  it("an unavailable link raises not-found (rendered as the friendly message) for every cause", async () => {
    const token = generateShareToken();
    for (const row of [null, linkRow(token, { revokedAt: new Date() }), linkRow(token, { expiresAt: new Date(0) })]) {
      repo.findByTokenHash.mockResolvedValue(row);
      await expect(render(token)).rejects.toThrow("NEXT_NOT_FOUND");
    }
    const { default: NotFound } = await import("@/app/share/coach/[token]/not-found");
    const html = renderToStaticMarkup(NotFound());
    expect(html).toContain("This coach link is no longer available.");
    expect(html).not.toMatch(/patient|account|exist|revoked|expired at/i);
  });

  it("legacy /coach/<token> links redirect to the new route", async () => {
    const { default: Legacy } = await import("@/app/coach/[token]/page");
    expect(() => Legacy({ params: { token: "abc" } })).toThrow("NEXT_REDIRECT:/share/coach/abc");
  });
});
