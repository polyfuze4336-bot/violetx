import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";

import { FakePrisma } from "@/test/fake-prisma";
import { countAthleteData, resolveWipeTarget, wipeAthleteData, WipeError } from "@/lib/account-wipe";
import { STARTER_EXERCISES } from "@/lib/exercise-library";

function world() {
  const mine = { athleteId: "a1" };
  const theirs = { athleteId: "a2" };
  const fake = new FakePrisma(
    {
      user: [
        { id: "u1", email: "me@example.com", role: "OWNER" },
        { id: "u2", email: "other@example.com", role: "OWNER" },
        { id: "u3", email: "coach@example.com", role: "COACH" },
        { id: "u4", email: "demo@violetx.demo", role: "DEMO_VIEWER" },
      ],
      athlete: [
        { id: "a1", ownerUserId: "u1", displayName: "Patient X", heightCm: 176 },
        { id: "a2", ownerUserId: "u2", displayName: "Patient X" },
        { id: "a4", ownerUserId: "u4", displayName: "Demo" },
      ],
      exercise: [{ id: "x1", ...mine, name: "Fake Bench" }, { id: "x2", ...theirs, name: "Barbell Bench Press" }],
      exerciseEntry: [
        { id: "e1", ...mine, exerciseId: "x1", reps: 8, weightKg: 80, importBatchId: "b1" },
        { id: "e2", ...mine, exerciseId: "x1", reps: 8, weightKg: 82.5 },
        { id: "e3", ...theirs, exerciseId: "x2", reps: 5, weightKg: 100 },
      ],
      workoutSession: [{ id: "s1", ...mine, status: "COMPLETED" }, { id: "s2", ...theirs, status: "COMPLETED" }],
      workoutExercise: [{ id: "w1", ...mine, sessionId: "s1", exerciseId: "x1" }, { id: "w2", ...theirs, sessionId: "s2", exerciseId: "x2" }],
      workoutProgram: [{ id: "p1", ...mine }, { id: "p2", ...theirs }],
      workoutTemplate: [{ id: "t1", ...mine, programId: "p1" }, { id: "t2", ...theirs, programId: "p2" }],
      workoutTemplateExercise: [{ id: "te1", templateId: "t1", exerciseId: "x1" }, { id: "te2", templateId: "t2", exerciseId: "x2" }],
      bodyWeightEntry: [{ id: "bw1", ...mine, weightKg: 80 }, { id: "bw2", ...theirs, weightKg: 70 }],
      measurementType: [{ id: "mt1", ...mine, name: "Waist" }, { id: "mt2", ...theirs, name: "Waist" }],
      measurementEntry: [{ id: "m1", ...mine, typeId: "mt1", value: 88 }, { id: "m2", ...theirs, typeId: "mt2", value: 90 }],
      nutritionEntry: [{ id: "n1", ...mine }, { id: "n2", ...theirs }],
      dailyCheckIn: [{ id: "c1", ...mine }, { id: "c2", ...theirs }],
      goal: [{ id: "g1", ...mine }, { id: "g2", ...theirs }],
      note: [{ id: "no1", ...mine }, { id: "no2", ...theirs }],
      gymVisit: [{ id: "gv1", ...mine }, { id: "gv2", ...theirs }],
      coachShareLink: [{ id: "l1", ...mine, tokenHash: "h1" }, { id: "l2", ...theirs, tokenHash: "h2" }],
      aIProposalLog: [{ id: "ai1", ...mine }, { id: "ai2", ...theirs }],
      importBatch: [{ id: "b1", ...mine }, { id: "b2", ...theirs }],
      aIAction: [{ id: "aa1", importBatchId: "b1" }, { id: "aa2", importBatchId: "b2" }],
    },
    true
  );
  return { fake, db: fake.client() as unknown as PrismaClient };
}

const n = (fake: FakePrisma, table: string, athleteId?: string) =>
  ((fake.tables[table] ?? []) as Record<string, unknown>[]).filter((r) => !athleteId || r.athleteId === athleteId).length;

describe("wiping one account's data", () => {
  it("counts what would be deleted without changing anything", async () => {
    const { fake, db } = world();
    const snapshot = JSON.stringify(fake.tables);
    const c = await countAthleteData(db, "a1");
    expect(c).toMatchObject({ exerciseEntries: 2, workoutSessions: 1, exercises: 1, bodyWeights: 1, measurements: 1, goals: 1, shareLinks: 1, templates: 1, imports: 1 });
    expect(JSON.stringify(fake.tables)).toBe(snapshot);
  });

  it("deletes only that athlete's rows and keeps the login, profile and everyone else's data", async () => {
    const { fake, db } = world();
    const target = await resolveWipeTarget(db, " ME@example.com ");
    expect(target).toEqual({ userId: "u1", athleteId: "a1" });
    const deleted = await wipeAthleteData(db, target.athleteId);
    expect(deleted.exerciseEntries).toBe(2);

    for (const t of ["exercise", "exerciseEntry", "workoutSession", "workoutExercise", "workoutProgram", "workoutTemplate", "bodyWeightEntry", "measurementType", "measurementEntry", "nutritionEntry", "dailyCheckIn", "goal", "note", "gymVisit", "coachShareLink", "aIProposalLog", "importBatch"]) {
      expect(n(fake, t, "a1"), `${t} (mine)`).toBe(0);
      expect(n(fake, t, "a2"), `${t} (other athlete)`).toBe(1);
    }
    // Children of my templates and imports went too, the other athlete's stayed.
    expect((fake.tables.workoutTemplateExercise as { id: string }[]).map((r) => r.id)).toEqual(["te2"]);
    expect((fake.tables.aIAction as { id: string }[]).map((r) => r.id)).toEqual(["aa2"]);
    // The login and the athlete profile remain.
    expect((fake.tables.user as { id: string }[]).map((u) => u.id)).toEqual(["u1", "u2", "u3", "u4"]);
    expect((fake.tables.athlete as { id: string }[]).find((a) => a.id === "a1")).toMatchObject({ displayName: "Patient X", heightCm: 176 });
    expect(Object.values(await countAthleteData(db, "a1")).every((v) => v === 0)).toBe(true);
  });

  it("can restore the canonical starter library so names start clean", async () => {
    const { fake, db } = world();
    await wipeAthleteData(db, "a1", { reseedStarter: true });
    const mine = (fake.tables.exercise as { athleteId: string; name: string }[]).filter((e) => e.athleteId === "a1");
    expect(mine).toHaveLength(STARTER_EXERCISES.length);
    expect(mine.some((e) => e.name === "Fake Bench")).toBe(false);
    expect(mine.map((e) => e.name)).toContain("Lat Pulldown");
    expect(n(fake, "exerciseEntry", "a1")).toBe(0);
  });

  it("refuses coaches, the demo account, unknown emails and blank input", async () => {
    const { fake, db } = world();
    const snapshot = JSON.stringify(fake.tables);
    for (const email of ["coach@example.com", "demo@violetx.demo", "nobody@example.com", ""]) {
      await expect(resolveWipeTarget(db, email), email).rejects.toBeInstanceOf(WipeError);
    }
    expect(JSON.stringify(fake.tables)).toBe(snapshot);
  });
});
