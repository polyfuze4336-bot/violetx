import { cloneElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { getServerSession } from "next-auth";

import { DEMO_EMAIL } from "@/lib/demo-mode";
import { buildDemoDataset } from "@/lib/demo-data";

const TODAY = new Date("2026-10-08T00:00:00Z");
const session = vi.mocked(getServerSession);

function tablesFrom(): Record<string, Record<string, unknown>[]> {
  const d = buildDemoDataset({ athleteId: "demo-athlete", userId: "demo-user", branches: [], today: TODAY });
  const fill = (rows: object[]) =>
    rows.map((r) => {
      const row = r as Record<string, unknown>;
      const stamp = (row.createdAt ?? row.date ?? row.entryDate ?? row.visitedAt ?? TODAY) as Date;
      return { createdAt: stamp, updatedAt: stamp, ...row };
    });
  const branches = Array.from({ length: 24 }, (_, i) => ({
    id: `branch-${i}`,
    name: `Anytime Fitness Demo ${i + 1}`,
    address: null,
    city: ["Petaling Jaya", "Johor Bahru", "George Town", "Kuala Lumpur"][i % 4],
    state: ["Selangor", "Johor", "Penang", "Kuala Lumpur"][i % 4],
    postcode: null,
    latitude: 3 + i * 0.1,
    longitude: 101 + i * 0.1,
    active: true,
    source: "test",
    sourceUpdatedAt: null,
    createdAt: TODAY,
    updatedAt: TODAY,
  }));
  // Give the dataset real branch visits so Gym Journey has content.
  const withBranches = buildDemoDataset({ athleteId: "demo-athlete", userId: "demo-user", branches: branches.map((b) => ({ id: b.id, name: b.name, state: b.state })), today: TODAY });
  return {
    user: [{ id: "demo-user", email: DEMO_EMAIL, role: "DEMO_VIEWER", name: "Demo", active: true }],
    athlete: [{ id: "demo-athlete", ownerUserId: "demo-user", ...d.athlete, defaultWeightUnit: "KG", defaultMeasurementUnit: "CM", trustedAiImports: false, createdAt: TODAY, updatedAt: TODAY }],
    exercise: fill(d.exercises),
    exerciseEntry: fill(d.sets),
    workoutSession: fill(withBranches.sessions),
    workoutExercise: fill(d.workoutExercises),
    workoutProgram: fill(d.programs),
    workoutTemplate: fill(d.templates),
    workoutTemplateExercise: fill(d.templateExercises),
    measurementType: fill(d.measurementTypes),
    measurementEntry: fill(d.measurements),
    bodyWeightEntry: fill(d.bodyWeights),
    nutritionEntry: fill(d.nutrition),
    dailyCheckIn: fill(d.checkIns),
    goal: fill(d.goals),
    note: fill(d.notes),
    gymVisit: fill(withBranches.gymVisits),
    gymBranch: branches,
    aIProposalLog: fill(d.aiProposals),
    coachShareLink: [],
    importBatch: [],
  };
}

/** Resolve async server components so the whole tree can be rendered synchronously. */
async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement(node)) return node;
  const { type, props } = node as { type: unknown; props: Record<string, unknown> };
  if (typeof type === "function" && (type as { constructor: { name: string } }).constructor.name === "AsyncFunction") {
    return resolve(await (type as (p: unknown) => Promise<ReactNode>)(props));
  }
  if (props.children !== undefined) {
    const kids = await resolve(props.children as ReactNode);
    return cloneElement(node, { children: kids } as never);
  }
  return node;
}

async function render(loader: () => Promise<{ default: (p: never) => unknown }>, props: object = {}) {
  const { default: Page } = await loader();
  const el = await (Page as (p: object) => Promise<ReactNode> | ReactNode)(props);
  return renderToStaticMarkup((await resolve(el)) as ReactNode);
}

let fake: FakePrisma;

beforeAll(() => {
  fake = new FakePrisma(tablesFrom());
  (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
});

beforeEach(() => {
  fake.writes.length = 0;
  session.mockReset();
  session.mockResolvedValue({
    user: { id: "demo-user", email: DEMO_EMAIL, name: "Demo", role: "DEMO_VIEWER", athleteId: "demo-athlete" },
    expires: "2999-01-01T00:00:00.000Z",
  });
});

const PAGES: [string, () => Promise<{ default: (p: never) => unknown }>, object, RegExp][] = [
  ["Home", () => import("@/app/dashboard/page"), {}, /Evolution|progress/i],
  ["Workout log", () => import("@/app/dashboard/workouts/page"), {}, /Workout log|Upper|Lower|Full Body/],
  ["Programs", () => import("@/app/dashboard/programs/page"), {}, /Upper \/ Lower/],
  ["Weekly review", () => import("@/app/dashboard/review/page"), { searchParams: {} }, /review|week/i],
  ["Goals", () => import("@/app/dashboard/goals/page"), {}, /Reach 78 kg/],
  ["Recovery", () => import("@/app/dashboard/recovery/page"), {}, /recover|readiness/i],
  ["Violet", () => import("@/app/dashboard/coach/page"), {}, /Violet/],
  ["Training progress", () => import("@/app/dashboard/progress/page"), { searchParams: {} }, /Back Squat|Bench|Assisted/],
  ["Analytics", () => import("@/app/dashboard/analytics/page"), { searchParams: {} }, /Volume|workout/i],
  ["Body weight", () => import("@/app/dashboard/weight/page"), {}, /kg/],
  ["Strength", () => import("@/app/dashboard/strength/page"), {}, /Bench|Squat/],
  ["Measurements", () => import("@/app/dashboard/measurements/page"), {}, /Waist/],
  ["Nutrition", () => import("@/app/dashboard/nutrition/page"), {}, /calor/i],
  ["Gym Journey", () => import("@/app/dashboard/gym/page"), {}, /Gym|journey|visited/i],
  ["History", () => import("@/app/dashboard/history/page"), { searchParams: {} }, /Bench|Squat|PR/],
  ["Records", () => import("@/app/dashboard/records/page"), {}, /Bench|Squat/],
  ["Exercises", () => import("@/app/dashboard/exercises/page"), {}, /Assisted Chin-Up/],
  ["Notes", () => import("@/app/dashboard/notes/page"), {}, /Holiday week|Chin-ups/],
];

describe("the seeded demo account can open every major page", () => {
  it.each(PAGES)("%s renders with demo data and writes nothing", async (_name, loader, props, expected) => {
    const html = await render(loader, props);
    expect(html.length).toBeGreaterThan(500);
    expect(html).toMatch(expected);
    expect(html).not.toMatch(/application error|something went wrong/i);
    expect(fake.writes).toEqual([]);
  }, 60_000);

  it("exercise detail pages work for weighted and assisted lifts", async () => {
    const ex = (fake.tables.exercise as { id: string; name: string }[]);
    for (const name of ["Barbell Bench Press", "Assisted Chin-Up"]) {
      const id = ex.find((e) => e.name === name)!.id;
      const html = await render(() => import("@/app/dashboard/exercises/[id]/page"), { params: { id } });
      expect(html).toContain(name);
      if (name === "Assisted Chin-Up") expect(html).toMatch(/Lower assistance = stronger|assistance/i);
    }
    expect(fake.writes).toEqual([]);
  }, 60_000);

  it("shows owner-style content (nutrition is visible) but owner-only write pages redirect away", async () => {
    for (const [loader, to] of [
      [() => import("@/app/dashboard/settings/page"), "/dashboard"],
      [() => import("@/app/dashboard/import/page"), "/dashboard"],
      [() => import("@/app/dashboard/workout/page"), "/dashboard/workouts"],
    ] as const) {
      await expect(render(loader as never)).rejects.toThrow(/NEXT_REDIRECT/);
      void to;
    }
  }, 60_000);
});

describe("demo UX", () => {
  it("the dashboard layout shows the DEMO MODE banner (and the owner/coach banners are not shown)", async () => {
    const html = await render(() => import("@/app/dashboard/layout") as never, { children: "content" });
    expect(html).toContain("DEMO MODE");
    expect(html).toContain("Explore VioletX using pre-populated fitness data. Changes are disabled.");
    expect(html).not.toContain("read-only</strong> coach access");
  }, 60_000);

  it("the sign-in form accepts a username", async () => {
    const html = await render(() => import("@/app/signin/page") as never);
    expect(html).toContain("Email or username");
    expect(html).not.toContain('type="email"');
  }, 60_000);
});
