/// <reference types="vite/client" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { getServerSession } from "next-auth";

import { authOptions, requireOwner, requireOwnerOrDemo } from "@/lib/auth";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_USERNAME, demoLoginEmail, isDemoModeEnabled } from "@/lib/demo-mode";
import { AuthorizationError, DEMO_READ_ONLY_MESSAGE, ROLES, canWrite, isRole, showsOwnerUi } from "@/lib/rbac";
import { passwordResetService } from "@/lib/services/passwordReset";

const session = vi.mocked(getServerSession);
let fake: FakePrisma;

function as(role: "OWNER" | "COACH" | "DEMO_VIEWER", athleteId = "demo-athlete") {
  session.mockResolvedValue({ user: { id: "u1", email: "x@example.com", role, athleteId }, expires: "2999-01-01T00:00:00.000Z" });
}

beforeEach(() => {
  fake = new FakePrisma({ user: [], athlete: [], exercise: [], exerciseEntry: [], gymBranch: [] });
  (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
  session.mockReset();
  as("DEMO_VIEWER");
});

describe("DEMO_VIEWER role", () => {
  it("is a known role that can never write", () => {
    expect(isRole("DEMO_VIEWER")).toBe(true);
    expect(canWrite(ROLES.DEMO_VIEWER)).toBe(false);
    expect(canWrite(ROLES.OWNER)).toBe(true);
    expect(showsOwnerUi(ROLES.DEMO_VIEWER)).toBe(true);
    expect(showsOwnerUi(ROLES.COACH)).toBe(false);
  });

  it("requireOwner refuses the demo viewer with the read-only message, and coaches generically", async () => {
    await expect(requireOwner()).rejects.toThrow(DEMO_READ_ONLY_MESSAGE);
    as("COACH");
    await expect(requireOwner()).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireOwner()).rejects.not.toThrow(DEMO_READ_ONLY_MESSAGE);
    as("OWNER");
    await expect(requireOwner()).resolves.toMatchObject({ role: "OWNER" });
  });

  it("the read-only owner gate admits the demo viewer and the owner, never a coach", async () => {
    await expect(requireOwnerOrDemo()).resolves.toMatchObject({ role: "DEMO_VIEWER" });
    as("COACH");
    await expect(requireOwnerOrDemo()).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// Every exported server action, called directly with junk input as the demo viewer.
const modules = import.meta.glob("/src/lib/actions/*.ts");

/** Read-only actions the demo viewer may legitimately use. */
const ALLOWED_READS = new Set(["generateAiCoachTipsAction"]);
/** Chat actions are tested separately with realistic text (questions are allowed). */
const CHAT = new Set(["violetInterpretAction"]);
/** Pre-login flows: must not change the demo account either (checked separately). */
const AUTH_FLOWS = new Set(["requestPasswordResetAction", "resetPasswordAction"]);

describe("the demo viewer cannot reach any mutation through server actions", () => {
  it("covers every exported server action", async () => {
    const names: string[] = [];
    for (const [file, load] of Object.entries(modules)) {
      if (file.endsWith("helpers.ts")) continue;
      names.push(...Object.keys((await load()) as object));
    }
    expect(names.length).toBeGreaterThan(50);
  });

  for (const [file, load] of Object.entries(modules)) {
    if (file.endsWith("helpers.ts")) continue;
    it(`${path.basename(file)}: every action is refused as "Demo mode is read only." and writes nothing`, async () => {
      const mod = (await load()) as Record<string, (...a: unknown[]) => Promise<{ ok: boolean; error?: string }>>;
      const checked: string[] = [];
      for (const [name, fn] of Object.entries(mod)) {
        if (typeof fn !== "function" || ALLOWED_READS.has(name) || AUTH_FLOWS.has(name) || CHAT.has(name)) continue;
        // Junk and plausible-looking input: the refusal must come before any use of it.
        for (const args of [[], [{}], ["x", {}], [{ id: "x", name: "x", exerciseId: "x", weightKg: 50, reps: 5 }, {}]]) {
          const res = await fn(...args);
          expect(res.ok, `${name}(${JSON.stringify(args).slice(0, 40)})`).toBe(false);
          expect(res.error, name).toBe(DEMO_READ_ONLY_MESSAGE);
        }
        checked.push(name);
      }
      // training.ts only exposes a read-only action, so it has nothing to refuse.
      if (!file.endsWith("training.ts")) expect(checked.length).toBeGreaterThan(0);
      expect(fake.writes, `writes from ${file}`).toEqual([]);
    }, 30_000);
  }

  it("Violet chat: questions are allowed, but turning text into records is refused", async () => {
    const { violetInterpretAction, violetCommitAction } = await import("@/lib/actions/violet");
    const parse = await violetInterpretAction("Bench press 80kg x 8, weight 78kg");
    expect(parse).toMatchObject({ ok: false, error: DEMO_READ_ONLY_MESSAGE });
    const commit = await violetCommitAction({ rawText: "x", date: "2026-10-08", weight: { value: 70, resolution: "IMPORT", confidence: 1 }, measurements: [], sets: [] });
    expect(commit).toMatchObject({ ok: false, error: DEMO_READ_ONLY_MESSAGE });
    expect(fake.writes).toEqual([]);
  });

  it("the Violet question service is read-only for the demo viewer and blocked for coaches", async () => {
    const { violetCoachService } = await import("@/lib/services/violetCoach");
    as("COACH");
    await expect(violetCoachService.ask("How am I doing?")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(violetCoachService.snapshot()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("services refuse the demo viewer directly (not only via actions)", async () => {
    const { workoutService } = await import("@/lib/services/workout");
    const { exerciseService, exerciseEntryService } = await import("@/lib/services/exercise");
    const { bodyWeightService } = await import("@/lib/services/bodyWeight");
    const { goalService } = await import("@/lib/services/goal");
    const { programService } = await import("@/lib/services/program");
    const { shareLinkService } = await import("@/lib/services/shareLink");
    const { nutritionService } = await import("@/lib/services/nutrition");
    const { athleteService } = await import("@/lib/services/athlete");
    const calls: (() => Promise<unknown>)[] = [
      () => workoutService.start({ date: "2026-10-08" }),
      () => workoutService.logSet({ workoutExerciseId: "w", weightKg: 50, reps: 5 }),
      () => workoutService.finish({}),
      () => exerciseService.create({ name: "X", active: true }),
      () => exerciseService.seedStarterLibrary(),
      () => exerciseEntryService.create({ exerciseId: "x", date: new Date(), reps: 5, weightKg: 50 } as never),
      () => bodyWeightService.create({ date: new Date(), weightKg: 70 } as never),
      () => goalService.create({ type: "BODY_WEIGHT", targetValue: 70 }),
      () => programService.create({ name: "P", templates: [{ name: "D", exercises: [{ exerciseName: "Squat" }] }] }),
      () => programService.confirmProposal({ name: "P", templates: [{ name: "D", exercises: [{ exerciseName: "Squat" }] }] }, "ai"),
      () => shareLinkService.create({}),
      () => nutritionService.setTargets({ calories: 2000 }),
      () => athleteService.updateProfile({ displayName: "Hacked" } as never),
    ];
    for (const call of calls) {
      const err = (await call().catch((e) => e)) as { status?: number; message?: string };
      expect(err.status).toBe(403);
      expect(err.message).toBe(DEMO_READ_ONLY_MESSAGE);
    }
    expect(fake.writes).toEqual([]);
  });
});

describe("there is no other write surface", () => {
  it("the only API routes are NextAuth and a GET health check", () => {
    const api = path.resolve("src/app/api");
    const files: string[] = [];
    const walk = (d: string) =>
      readdirSync(d).forEach((n) => {
        const f = path.join(d, n);
        if (statSync(f).isDirectory()) walk(f);
        else files.push(path.relative(api, f).replace(/\\/g, "/"));
      });
    walk(api);
    expect(files.sort()).toEqual(["auth/[...nextauth]/route.ts", "health/route.ts"]);
    const health = readFileSync(path.join(api, "health/route.ts"), "utf8");
    expect(health).not.toMatch(/export (async )?function (POST|PUT|PATCH|DELETE)/);
  });

  it("every server-action module is covered above (no 'use server' file outside src/lib/actions)", () => {
    const hits: string[] = [];
    const walk = (d: string) =>
      readdirSync(d).forEach((n) => {
        const f = path.join(d, n);
        if (statSync(f).isDirectory()) return walk(f);
        if (/\.(ts|tsx)$/.test(n) && /^["']use server["']/m.test(readFileSync(f, "utf8").slice(0, 200))) hits.push(path.relative(path.resolve("src"), f).replace(/\\/g, "/"));
      });
    walk(path.resolve("src"));
    expect(hits.every((h) => h.startsWith("lib/actions/"))).toBe(true);
  });
});

describe("demo login (prototype only)", () => {
  const authorize = (authOptions.providers[0] as unknown as { options: { authorize: (c: Record<string, string>) => Promise<unknown> } }).options.authorize;
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 4);
  const demoUser = { id: "demo-user", email: DEMO_EMAIL, name: "Demo", role: "DEMO_VIEWER", active: true, passwordHash: hash, failedLoginAttempts: 0, lockedUntil: null };
  const setup = (env: string | undefined) => {
    if (env === undefined) delete process.env.DEMO_MODE_ENABLED;
    else process.env.DEMO_MODE_ENABLED = env;
    fake = new FakePrisma({
      user: [demoUser, { id: "owner-1", email: "owner@example.com", role: "OWNER", active: true, passwordHash: bcrypt.hashSync("owner-password-1", 4), failedLoginAttempts: 0, lockedUntil: null }],
      athlete: [{ id: "demo-athlete", ownerUserId: "demo-user" }, { id: "real-athlete", ownerUserId: "owner-1" }],
    });
    (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
    process.env.OWNER_EMAIL = "owner@example.com";
  };

  it("is off unless DEMO_MODE_ENABLED=true: neither username nor email works", async () => {
    for (const env of [undefined, "", "false", "TRUE", "1"]) {
      setup(env);
      expect(isDemoModeEnabled()).toBe(false);
      expect(demoLoginEmail(DEMO_USERNAME)).toBeNull();
      expect(await authorize({ email: DEMO_USERNAME, password: DEMO_PASSWORD })).toBeNull();
      expect(await authorize({ email: DEMO_EMAIL, password: DEMO_PASSWORD })).toBeNull();
    }
  });

  it("with demo mode on, demo / violetx signs in as DEMO_VIEWER on the DEMO athlete only", async () => {
    setup("true");
    const user = (await authorize({ email: "demo", password: "violetx" })) as { role: string; athleteId: string };
    expect(user).toMatchObject({ role: "DEMO_VIEWER", athleteId: "demo-athlete" });
    expect(user.athleteId).not.toBe("real-athlete");
    const upper = (await authorize({ email: "  DEMO ", password: "violetx" })) as { role: string };
    expect(upper.role).toBe("DEMO_VIEWER");
  });

  it("rejects a wrong password without locking the shared account", async () => {
    setup("true");
    for (let i = 0; i < 8; i++) expect(await authorize({ email: "demo", password: "nope" })).toBeNull();
    expect(fake.writes).toEqual([]);
    expect(await authorize({ email: "demo", password: "violetx" })).not.toBeNull();
  });

  it("only the demo username is recognised; no other username can sign in", async () => {
    setup("true");
    for (const id of ["owner", "admin", "coach", "demo2", "owner@example.com-x"]) {
      expect(await authorize({ email: id, password: "owner-password-1" })).toBeNull();
    }
    // The real owner still signs in normally with an email.
    expect(await authorize({ email: "owner@example.com", password: "owner-password-1" })).toMatchObject({ role: "OWNER", athleteId: "real-athlete" });
  });

  it("a stored demo account cannot sign in once demo mode is switched off", async () => {
    setup("true");
    expect(await authorize({ email: "demo", password: "violetx" })).not.toBeNull();
    setup("false");
    expect(await authorize({ email: "demo", password: "violetx" })).toBeNull();
  });

  it("the demo password can never be changed through the reset flow", async () => {
    setup("true");
    expect(await passwordResetService.requestReset(DEMO_EMAIL)).toEqual({});
    expect(fake.writes).toEqual([]);
    fake.tables.passwordResetToken = [];
    await expect(passwordResetService.resetPassword("whatever", "NewPassword-123")).rejects.toThrow(/invalid or has expired/);
    expect(fake.writes).toEqual([]);
  });
});
