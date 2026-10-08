import { spawnSync } from "node:child_process";

import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-mode";
import { DemoSeedError, removeDemo, seedDemo } from "@/lib/demo-seed";

vi.mock("bcryptjs", async (orig) => {
  const real = (await orig()) as { default: typeof import("bcryptjs") };
  // Cost 4 keeps the test fast; the seed itself uses cost 12.
  return { default: { ...real.default, hash: (p: string) => real.default.hash(p, 4) } };
});

type Row = Record<string, unknown>;

/** Tiny in-memory database that enforces unique ids, like the real tables. */
function memoryDb(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { user: [], athlete: [], gymBranch: [], ...initial };
  const rows = (m: string) => (tables[m] ??= []);
  const match = (r: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => (k === "template" ? rows("workoutTemplate").some((t) => t.id === r.templateId && t.athleteId === (v as Row).athleteId) : r[k] === v));
  const model = (m: string) => ({
    findUnique: async ({ where }: { where: Row }) => rows(m).find((r) => match(r, where)) ?? null,
    findMany: async ({ where }: { where?: Row } = {}) => rows(m).filter((r) => match(r, where)),
    deleteMany: async ({ where }: { where?: Row }) => {
      const keep = rows(m).filter((r) => !match(r, where));
      const count = rows(m).length - keep.length;
      tables[m] = keep;
      return { count };
    },
    delete: async ({ where }: { where: Row }) => {
      tables[m] = rows(m).filter((r) => !match(r, where));
    },
    createMany: async ({ data }: { data: Row[] }) => {
      for (const d of data) {
        if (d.id !== undefined && rows(m).some((r) => r.id === d.id)) throw new Error(`Unique constraint failed on ${m}.id = ${String(d.id)}`);
        rows(m).push({ ...d });
      }
      return { count: data.length };
    },
    upsert: async ({ where, update, create }: { where: Row; update: Row; create: Row }) => {
      const hit = rows(m).find((r) => match(r, where));
      if (hit) Object.assign(hit, update);
      else rows(m).push({ ...create });
      return hit ?? create;
    },
  });
  const db = new Proxy(
    {},
    {
      get: (_t, p: string) => {
        if (p === "$transaction") return async (fn: (tx: unknown) => unknown) => fn(db);
        return model(p);
      },
    }
  );
  return { db: db as never, tables };
}

const real = (): Record<string, Row[]> => ({
  user: [{ id: "owner-1", email: "owner@example.com", role: "OWNER" }],
  athlete: [{ id: "real-athlete", ownerUserId: "owner-1" }],
  exercise: [{ id: "real-ex", athleteId: "real-athlete", name: "Real Bench" }],
  exerciseEntry: [{ id: "real-set", athleteId: "real-athlete", exerciseId: "real-ex" }],
  bodyWeightEntry: [{ id: "real-bw", athleteId: "real-athlete" }],
  workoutTemplate: [{ id: "real-tpl", athleteId: "real-athlete" }],
  workoutTemplateExercise: [{ id: "real-tplex", templateId: "real-tpl" }],
  gymBranch: [{ id: "b1", name: "Branch One", state: "Selangor", active: true }, { id: "b2", name: "Branch Two", state: "Johor", active: true }],
});

const counts = (t: Record<string, Row[]>) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.length]));
const TODAY = new Date("2026-10-08T00:00:00Z");

describe("demo seed", () => {
  it("creates the read-only demo user, athlete and history", async () => {
    const { db, tables } = memoryDb(real());
    const data = await seedDemo(db, TODAY);
    const user = tables.user.find((u) => u.email === DEMO_EMAIL)!;
    expect(user).toMatchObject({ role: "DEMO_VIEWER", active: true });
    expect(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash as string)).toBe(true);
    const athlete = tables.athlete.find((a) => a.ownerUserId === user.id)!;
    expect(athlete.displayName).toBe("Demo Athlete");
    expect(tables.exerciseEntry.filter((r) => r.athleteId === athlete.id)).toHaveLength(data.sets.length);
    expect(tables.gymVisit.length).toBeGreaterThan(0);
  });

  it("is idempotent: running twice (or three times, on different days) creates no duplicates", async () => {
    const { db, tables } = memoryDb(real());
    await seedDemo(db, TODAY);
    const first = counts(tables);
    await seedDemo(db, TODAY);
    expect(counts(tables)).toEqual(first);
    // A later day re-anchors the history (the schedule shifts), but never accumulates rows.
    await seedDemo(db, new Date("2026-11-20T00:00:00Z"));
    expect(tables.exerciseEntry.length).toBeLessThan(first.exerciseEntry * 1.3);
    expect(tables.exerciseEntry.length).toBeGreaterThan(first.exerciseEntry * 0.7);
    expect(tables.exercise).toHaveLength(first.exercise);
    expect(tables.goal).toHaveLength(first.goal);
    for (const [name, list] of Object.entries(tables)) {
      const ids = list.map((r) => r.id);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
    expect(tables.user.filter((u) => u.email === DEMO_EMAIL)).toHaveLength(1);
    expect(tables.athlete).toHaveLength(2);
  });

  it("never touches the real athlete's data", async () => {
    const { db, tables } = memoryDb(real());
    await seedDemo(db, TODAY);
    await seedDemo(db, TODAY);
    expect(tables.exercise.find((r) => r.id === "real-ex")).toBeTruthy();
    expect(tables.exerciseEntry.find((r) => r.id === "real-set")).toBeTruthy();
    expect(tables.bodyWeightEntry.find((r) => r.id === "real-bw")).toBeTruthy();
    expect(tables.workoutTemplateExercise.find((r) => r.id === "real-tplex")).toBeTruthy();
    expect(tables.athlete.find((a) => a.id === "real-athlete")).toBeTruthy();
    expect(tables.user.find((u) => u.id === "owner-1")?.role).toBe("OWNER");
  });

  it("refuses to modify a non-demo account that has the demo email", async () => {
    const seed = real();
    seed.user.push({ id: "x", email: DEMO_EMAIL, role: "OWNER" });
    const { db, tables } = memoryDb(seed);
    const before = counts(tables);
    await expect(seedDemo(db, TODAY)).rejects.toBeInstanceOf(DemoSeedError);
    await expect(removeDemo(db)).rejects.toBeInstanceOf(DemoSeedError);
    expect(counts(tables)).toEqual(before);
  });

  it("uses real gym branches when they exist, and works without any", async () => {
    const withBranches = memoryDb(real());
    await seedDemo(withBranches.db, TODAY);
    expect(withBranches.tables.gymVisit.every((v) => ["b1", "b2"].includes(v.gymBranchId as string))).toBe(true);
    const none = memoryDb({ ...real(), gymBranch: [] });
    await seedDemo(none.db, TODAY);
    expect(none.tables.gymVisit).toHaveLength(0);
  });

  it("can remove the demo account and only the demo data", async () => {
    const { db, tables } = memoryDb(real());
    await seedDemo(db, TODAY);
    expect(await removeDemo(db)).toBe(true);
    expect(tables.user.map((u) => u.id)).toEqual(["owner-1"]);
    expect(tables.athlete.map((a) => a.id)).toEqual(["real-athlete"]);
    expect(tables.exerciseEntry.map((r) => r.id)).toEqual(["real-set"]);
    expect(await removeDemo(db)).toBe(false);
  });
});

describe("seed command", () => {
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync("npx", ["tsx", "scripts/seed-demo.ts", ...args], {
      encoding: "utf8",
      shell: true,
      // No ALLOW_DEMO_SEED or database settings leak in from the test runner.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env } as unknown as NodeJS.ProcessEnv,
    });

  it("refuses to run unless explicitly enabled (never automatic)", () => {
    const r = run([], { DATABASE_URL: "sqlserver://example.invalid;database=x" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/ALLOW_DEMO_SEED=true/);
  }, 90_000);

  it("--dry-run needs no database and reports the dataset", () => {
    const r = run(["--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/sets\s+\d{3,}/);
    expect(r.stdout).toMatch(/sessions\s+\d+/);
  }, 90_000);

  it("the seed is not wired into build, test, deploy or CI", async () => {
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
    for (const name of ["build", "start", "postinstall", "test", "prisma:migrate"]) expect(pkg[name]).not.toMatch(/seed/);
    for (const wf of ["ci.yml", "deploy.yml"]) expect(readFileSync(`.github/workflows/${wf}`, "utf8")).not.toMatch(/seed:demo|seed-demo|ALLOW_DEMO_SEED/);
  });
});
