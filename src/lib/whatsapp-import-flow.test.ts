import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { getServerSession } from "next-auth";

import { AuthenticationError, AuthorizationError } from "@/lib/rbac";
import { analyticsService } from "@/lib/services/analytics";
import { exerciseService } from "@/lib/services/exercise";
import { importService } from "@/lib/services/import";
import { personalRecordService } from "@/lib/services/personalRecord";
import { trainingProgressService } from "@/lib/services/trainingProgress";
import { violetCoachService } from "@/lib/services/violetCoach";
import { weeklyReviewService } from "@/lib/services/weeklyReview";
import { workoutService } from "@/lib/services/workout";
import { parseWhatsAppMessage } from "@/lib/whatsapp-parser";
import { recommendImportType, type ImportType } from "@/lib/import-interpretation";

const session = vi.mocked(getServerSession);
let fake: FakePrisma;

const asRole = (role: string) =>
  session.mockResolvedValue({
    user: { id: role === "OWNER" ? "owner-1" : `${role.toLowerCase()}-1`, email: `${role.toLowerCase()}@example.com`, role, athleteId: "athlete-1" },
    expires: "2999-01-01T00:00:00.000Z",
  });

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

beforeEach(() => {
  fake = new FakePrisma(
    {
      user: [{ id: "owner-1", email: "owner@example.com", role: "OWNER", active: true }],
      athlete: [{ id: "athlete-1", ownerUserId: "owner-1", displayName: "Patient X", defaultWeightUnit: "KG", defaultMeasurementUnit: "CM", heightCm: 176, calorieTarget: null }],
    },
    true
  );
  (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
  session.mockReset();
  asRole("OWNER");
});

type SetInput = { exercise: string; exerciseRef?: string; reps: number; weightKg: number };

async function commit(importType: ImportType | undefined, date: string, sets: SetInput[]) {
  return importService.commit({
    date: at(date),
    importType,
    weightResolution: "IMPORT",
    measurements: [],
    sets: sets.map((s) => ({ ...s, resolution: "IMPORT" as const })),
  });
}

/** Real history: earlier full workouts saved through the same import path. */
async function seedHistory() {
  await exerciseService.seedStarterLibrary();
  await commit("FULL", day(-14), [
    { exercise: "Barbell Bench Press", reps: 8, weightKg: 80 },
    { exercise: "Barbell Bench Press", reps: 8, weightKg: 80 },
    { exercise: "Lat Pulldown", reps: 10, weightKg: 60 },
    { exercise: "Assisted Chin-Up", reps: 10, weightKg: 30 },
  ]);
}

const sessions = () => (fake.tables.workoutSession ?? []) as { id: string; status: string; date: Date; name: string | null }[];

describe("PR UPDATE import (selected progress, not a workout)", () => {
  it("parses the WhatsApp message and recommends PR UPDATE", () => {
    const parsed = parseWhatsAppMessage("Bench 80kg x10\nAssisted chin 25kg x10");
    expect(parsed.sets).toHaveLength(2);
    expect(recommendImportType({ rawText: "Bench 80kg x10\nAssisted chin 25kg x10", sets: parsed.sets }).type).toBe("PR_UPDATE");
  });

  it("the PR engine confirms a rep PR and an assistance PR before anything is saved", async () => {
    await seedHistory();
    const tablesBefore = JSON.stringify(fake.tables.exerciseEntry);
    const out = await importService.assess({
      date: at(day(0)),
      sets: [
        { exercise: "Barbell Bench Press", reps: 10, weightKg: 80 },
        { exercise: "Assisted Chin-Up", reps: 10, weightKg: 25 },
        { exercise: "Lat Pulldown", reps: 10, weightKg: 65 },
      ],
    });
    expect(out[0]).toMatchObject({ status: "CONFIRMED_PR", prType: "REPS", label: "Rep PR", detail: "+2 reps at 80 kg", previous: { weightKg: 80, reps: 8 } });
    expect(out[1]).toMatchObject({ status: "CONFIRMED_PR", prType: "ASSISTANCE", assisted: true });
    expect(out[1].detail).toMatch(/5 kg less assistance/);
    expect(out[2]).toMatchObject({ status: "CONFIRMED_PR", prType: "WEIGHT", detail: "+5 kg" });
    // Nothing was written by the check.
    expect(JSON.stringify(fake.tables.exerciseEntry)).toBe(tablesBefore);
  });

  it("saves two progress entries without pretending it was the whole workout", async () => {
    await seedHistory();
    const completedBefore = sessions().filter((s) => s.status === "COMPLETED").length;
    const structureBefore = (fake.tables.workoutExercise ?? []).length;

    const summary = await commit("PR_UPDATE", day(0), [
      { exercise: "Barbell Bench Press", reps: 10, weightKg: 80 },
      { exercise: "Assisted Chin-Up", reps: 10, weightKg: 25 },
    ]);
    expect(summary).toMatchObject({ importType: "PR_UPDATE", setsCreated: 2 });

    // Filed as a PR update: not a completed workout, no exercise structure.
    const update = sessions().find((s) => s.status === "PR_UPDATE")!;
    expect(update.name).toBe("PR / progress update");
    expect(sessions().filter((s) => s.status === "COMPLETED")).toHaveLength(completedBefore);
    expect(fake.tables.workoutExercise ?? []).toHaveLength(structureBefore);

    // The PR engine counts both entries against history.
    const prs = await personalRecordService.prEvents();
    const today = prs.filter((p) => p.date.startsWith(day(0)));
    expect(today.map((p) => p.type).sort()).toEqual(["ASSISTANCE", "REPS"]);

    // Lists: hidden from completed workouts, visible as an update.
    expect((await workoutService.listSessions(20)).map((s) => s.status)).not.toContain("PR_UPDATE");
    const all = await workoutService.listSessions(20, { includeIncomplete: true });
    expect(all.find((s) => s.status === "PR_UPDATE")).toMatchObject({ fromWhatsApp: true, sets: 2 });
  });

  it("does not become a workout day: analytics, weekly review and tips treat missing data as unknown", async () => {
    await seedHistory();
    const before = await analyticsService.get("3M");
    await commit("PR_UPDATE", day(0), [
      { exercise: "Barbell Bench Press", reps: 10, weightKg: 80 },
      { exercise: "Assisted Chin-Up", reps: 10, weightKg: 25 },
    ]);

    const after = await analyticsService.get("3M");
    expect(after.totals.workouts).toBe(before.totals.workouts); // no extra workout
    expect(after.incomplete).toEqual({ days: 1, sets: 2 });
    expect(after.totals.sets).toBe(before.totals.sets + 2); // the recorded sets still count
    expect(after.prTimeline.some((p) => p.type === "REPS" && p.date === day(0))).toBe(true);
    expect(after.observations.join(" ")).toMatch(/Based on your recorded exercises/);

    const review = await weeklyReviewService.get();
    expect(review.training.workouts).toBe(0);
    expect(review.training.progressUpdates).toBe(1);
    expect(review.consistency.done).toBe(0);
    expect(review.observation).not.toMatch(/No workouts were recorded|only/i);
    expect(review.observation).toMatch(/1 PR or progress update/);
    expect(review.observation).toMatch(/Based on your recorded exercises/);
    expect(review.nextWeek.join(" ")).not.toMatch(/get back into rhythm/);

    const progress = await trainingProgressService.get("week");
    expect(progress.window.hasIncompleteRecords).toBe(true);
    const titles = progress.tips.map((t) => t.title).join(" | ");
    expect(titles).toMatch(/recorded exercises only/);
    expect(titles).not.toMatch(/Train at least 3 times|not trained in 4 weeks|add \d+–\d+ weekly sets/i);
    expect(progress.periods.at(-1)!.sessions).toBe(0);
    expect(progress.periods.at(-1)!.updates).toBe(1);

    const snap = await violetCoachService.snapshot();
    expect(snap.workouts.progressUpdates).toBe(1);
    const answer = await violetCoachService.ask("How am I doing?");
    expect(answer.answer).toMatch(/based on your recorded exercises/i);
    expect(answer.answer).not.toMatch(/only (performed|did)|skipped|short workout/i);
  });
});

describe("FULL workout import", () => {
  it("creates a normal completed workout with its exercise structure", async () => {
    await exerciseService.seedStarterLibrary();
    const parsed = parseWhatsAppMessage(
      ["Push day", "Bench", "80 x 10", "80 x 9", "80 x 8", "Incline DB", "30 x 10", "30 x 9", "30 x 8", "Shoulder press", "25 x 10", "25 x 9", "25 x 8", "Lateral raise", "10 x 15", "10 x 15", "10 x 12", "Triceps pushdown", "30 x 12", "30 x 11", "30 x 10"].join("\n")
    );
    expect(parsed.sets).toHaveLength(15);
    expect(recommendImportType({ rawText: "", sets: parsed.sets }).type).toBe("FULL");

    const summary = await commit("FULL", day(0), parsed.sets.map((s) => ({ exercise: s.exercise, reps: s.reps, weightKg: s.weightKg })));
    expect(summary).toMatchObject({ importType: "FULL", setsCreated: 15 });

    const s = sessions().find((x) => x.status === "COMPLETED")!;
    expect(s).toBeTruthy();
    const structure = (fake.tables.workoutExercise ?? []) as { sessionId: string; exerciseId: string; sortOrder: number }[];
    expect(structure).toHaveLength(5); // Bench, Incline, Shoulder press, Lateral raise, Triceps pushdown
    expect(new Set(structure.map((w) => w.exerciseId)).size).toBe(structure.length); // one per exercise
    expect(structure.map((w) => w.sortOrder)).toEqual(structure.map((_, i) => i));
    const entries = (fake.tables.exerciseEntry ?? []) as { sessionId: string; workoutExerciseId: string | null }[];
    expect(entries.every((e) => e.sessionId === s.id && e.workoutExerciseId)).toBe(true);

    // Counts as a workout, with volume.
    const a = await analyticsService.get("3M");
    expect(a.totals.workouts).toBe(1);
    expect(a.totals.sets).toBe(15);
    expect(a.totals.volumeKg).toBeGreaterThan(0);
    expect(a.incomplete.days).toBe(0);
    const review = await weeklyReviewService.get();
    expect(review.training.workouts).toBe(1);
    expect(review.training.progressUpdates).toBe(0);
    expect((await workoutService.listSessions(10))[0].status).toBe("COMPLETED");
  });
});

describe("PARTIAL workout import", () => {
  it("is saved as incomplete and never counted as a workout or poor adherence", async () => {
    await exerciseService.seedStarterLibrary();
    const parsed = parseWhatsAppMessage("Bench 80x10\n80x9\nLat pulldown 65x10");
    expect(recommendImportType({ rawText: "", sets: parsed.sets }).type).toBe("PARTIAL");
    const summary = await commit("PARTIAL", day(0), parsed.sets.map((s) => ({ exercise: s.exercise, reps: s.reps, weightKg: s.weightKg })));
    expect(summary).toMatchObject({ importType: "PARTIAL", setsCreated: 3 });
    expect(sessions().map((s) => s.status)).toEqual(["PARTIAL"]);

    const a = await analyticsService.get("3M");
    expect(a.totals.workouts).toBe(0);
    expect(a.totals.workoutsPerWeek).toBe(0);
    expect(a.incomplete).toEqual({ days: 1, sets: 3 });
    expect((await weeklyReviewService.get()).training.progressUpdates).toBe(1);
    expect((await workoutService.listSessions(10)).length).toBe(0);
    expect((await workoutService.listSessions(10, { includeIncomplete: true }))[0].status).toBe("PARTIAL");
  });

  it("defaults to PARTIAL when a caller does not say: unknown is never a completed workout", async () => {
    await exerciseService.seedStarterLibrary();
    const summary = await commit(undefined, day(0), [{ exercise: "Leg Press", reps: 12, weightKg: 100 }]);
    expect(summary.importType).toBe("PARTIAL");
    expect(sessions()[0].status).toBe("PARTIAL");
  });

  it("a partial day that also has a full workout still counts once, as a workout", async () => {
    await exerciseService.seedStarterLibrary();
    await commit("FULL", day(0), [{ exercise: "Leg Press", reps: 12, weightKg: 100 }]);
    await commit("PR_UPDATE", day(0), [{ exercise: "Leg Press", reps: 14, weightKg: 100 }]);
    const a = await analyticsService.get("3M");
    expect(a.totals.workouts).toBe(1);
    expect(a.incomplete.days).toBe(0);
  });
});

describe("claims the history does not support", () => {
  it("'PR bench 80 x 10' with 80 × 11 on record: claim detected, not a PR, still importable as a progress entry", async () => {
    await exerciseService.seedStarterLibrary();
    await commit("FULL", day(-10), [{ exercise: "Barbell Bench Press", reps: 8, weightKg: 80 }]);
    await commit("FULL", day(-5), [{ exercise: "Barbell Bench Press", reps: 11, weightKg: 80 }]);

    const parsed = parseWhatsAppMessage("PR bench 80 x 10");
    expect(parsed.sets[0].prClaim).toBe(true);
    const [claim] = await importService.assess({
      date: at(day(0)),
      sets: [{ exercise: "Barbell Bench Press", reps: 10, weightKg: 80, prClaim: true }],
    });
    expect(claim.status).toBe("NOT_A_PR");
    expect(claim.existingBest).toEqual({ weightKg: 80, reps: 11 });
    expect(claim.message).toMatch(/PR claim detected/);

    const eventsBefore = (await personalRecordService.prEvents()).length;
    const summary = await commit("PR_UPDATE", day(0), [{ exercise: "Barbell Bench Press", reps: 10, weightKg: 80 }]);
    expect(summary.setsCreated).toBe(1); // imported as a progress entry
    // ...without creating a false PR achievement.
    expect((await personalRecordService.prEvents()).length).toBe(eventsBefore);
  });

  it("rep records stay tied to the load: 60 × 15 is not a PR over 100 × 10", async () => {
    await exerciseService.seedStarterLibrary();
    await commit("FULL", day(-5), [{ exercise: "Barbell Bench Press", reps: 10, weightKg: 100 }]);
    const [a] = await importService.assess({ date: at(day(0)), sets: [{ exercise: "Barbell Bench Press", reps: 15, weightKg: 60 }] });
    expect(a.status).toBe("NOT_A_PR");
  });
});

describe("spelling and unknown exercises in WhatsApp imports", () => {
  it("'lat pulldwon 65x10' waits for confirmation, then maps to Lat Pulldown without a duplicate", async () => {
    await seedHistory();
    const exercisesBefore = (await exerciseService.list()).length;
    const lat = (await exerciseService.list()).find((e) => e.name === "Lat Pulldown")!;

    // Until the name is confirmed the PR check does not guess.
    const [pending] = await importService.assess({ date: at(day(0)), sets: [{ exercise: "Lat Pulldwon", reps: 10, weightKg: 65, unresolved: true }] });
    expect(pending.status).toBe("UNRESOLVED");

    // After the user confirms Lat Pulldown (id ref), it is checked against that exercise.
    const [checked] = await importService.assess({ date: at(day(0)), sets: [{ exercise: "Lat Pulldwon", exerciseRef: `id:${lat.id}`, reps: 10, weightKg: 65 }] });
    expect(checked).toMatchObject({ status: "CONFIRMED_PR", prType: "WEIGHT" });

    await commit("PR_UPDATE", day(0), [{ exercise: "Lat Pulldwon", exerciseRef: `id:${lat.id}`, reps: 10, weightKg: 65 }]);
    const after = await exerciseService.list();
    expect(after).toHaveLength(exercisesBefore);
    expect(after.some((e) => e.name.toLowerCase().includes("pulldwon"))).toBe(false);
  });

  it("'assissted chin 25x10' is parsed and mapped to Assisted Chin-Up assistance", async () => {
    await seedHistory();
    const chin = (await exerciseService.list()).find((e) => e.name === "Assisted Chin-Up")!;
    const parsed = parseWhatsAppMessage("assissted chin 25x10");
    expect(parsed.sets[0]).toMatchObject({ reps: 10, weightKg: 25 });
    const [a] = await importService.assess({ date: at(day(0)), sets: [{ exercise: parsed.sets[0].exercise, exerciseRef: `id:${chin.id}`, reps: 10, weightKg: 25 }] });
    expect(a).toMatchObject({ status: "CONFIRMED_PR", prType: "ASSISTANCE", assisted: true });
  });

  it("an unknown exercise is a first record and is created as a custom exercise on confirmation", async () => {
    await exerciseService.seedStarterLibrary();
    const [a] = await importService.assess({ date: at(day(0)), sets: [{ exercise: "Sled Push", reps: 10, weightKg: 100, prClaim: true }] });
    expect(a.status).toBe("FIRST_RECORD");
    const summary = await commit("PR_UPDATE", day(0), [{ exercise: "Sled Push", reps: 10, weightKg: 100 }]);
    expect(summary.newExercises).toEqual(["Sled Push"]);
  });
});

describe("authorization", () => {
  it("only the owner can assess or save an import", async () => {
    const input = { date: at(day(0)), sets: [{ exercise: "Bench", reps: 8, weightKg: 60 }] };
    vi.stubEnv("DEMO_MODE_ENABLED", "true");
    session.mockResolvedValue(null);
    await expect(importService.assess(input)).rejects.toBeInstanceOf(AuthenticationError);
    for (const role of ["COACH", "DEMO_VIEWER"]) {
      asRole(role);
      await expect(importService.assess(input)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(commit("PR_UPDATE", day(0), input.sets)).rejects.toBeInstanceOf(AuthorizationError);
    }
    expect(fake.tables.exerciseEntry ?? []).toHaveLength(0);
    vi.unstubAllEnvs();
  });
});
