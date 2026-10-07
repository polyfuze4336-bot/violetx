import { describe, expect, it } from "vitest";

import {
  estimateMinutes,
  parseDaysFromRequest,
  pickTodayTemplate,
  presetProgram,
  proposeProgramFromRequest,
} from "@/lib/programs";
import { programProposalSchema, programSchema } from "@/lib/program-schemas";
import { STARTER_EXERCISES, exerciseKeys } from "@/lib/exercise-library";

describe("program presets", () => {
  it("only use exercises from the starter library and validate", () => {
    const known = new Set(STARTER_EXERCISES.flatMap((e) => exerciseKeys(e.name, e.aliases)));
    for (const type of ["PPL", "UPPER_LOWER", "FULL_BODY"] as const) {
      const p = presetProgram(type);
      expect(programSchema.safeParse(p).success).toBe(true);
      for (const t of p.templates)
        for (const e of t.exercises) expect(known.has(e.exerciseName.toLowerCase()), e.exerciseName).toBe(true);
    }
  });
});

describe("proposeProgramFromRequest", () => {
  it("builds a four-day upper/lower plan with extra bench volume", () => {
    const p = proposeProgramFromRequest("Create a four-day program focused on improving my bench and reducing body fat.");
    expect(parseDaysFromRequest("a four-day program")).toBe(4);
    expect(p.program.programType).toBe("UPPER_LOWER");
    expect(p.program.templates).toHaveLength(4);
    expect(p.program.templates[0].exercises[0].targetSets).toBe(5);
    expect(p.summary).toMatch(/not medical advice/);
    expect(programProposalSchema.safeParse(p).success).toBe(true);
  });

  it("honours an explicit day count", () => {
    expect(proposeProgramFromRequest("general fitness", 3).program.templates).toHaveLength(3);
    expect(proposeProgramFromRequest("push pull legs", 3).program.programType).toBe("PPL");
    expect(proposeProgramFromRequest("anything", 6).program.templates).toHaveLength(6);
  });
});

describe("program validation", () => {
  const base = {
    name: "Test",
    templates: [{ name: "Day", exercises: [{ exerciseName: "Squat", targetSets: 3, repMin: 5, repMax: 8 }] }],
  };

  it("accepts a valid program and applies defaults", () => {
    const r = programSchema.parse(base);
    expect(r.programType).toBe("CUSTOM");
  });

  it("rejects invalid AI output", () => {
    expect(programSchema.safeParse({ ...base, templates: [] }).success).toBe(false);
    expect(
      programSchema.safeParse({ ...base, templates: [{ name: "D", exercises: [{ exerciseName: "S", repMin: 10, repMax: 5 }] }] }).success
    ).toBe(false);
    expect(programSchema.safeParse({ ...base, templates: [{ name: "D", exercises: [{ exerciseName: "S", targetSets: 99 }] }] }).success).toBe(false);
    expect(programProposalSchema.safeParse({ summary: "", program: base }).success).toBe(false);
    expect(programProposalSchema.safeParse({ nope: true }).success).toBe(false);
  });
});

describe("pickTodayTemplate", () => {
  const t = (id: string, dayOrder: number, weekday: number | null = null) => ({ id, dayOrder, weekday });
  const list = [t("a", 0), t("b", 1), t("c", 2)];

  it("rotates after the last completed template", () => {
    expect(pickTodayTemplate(list, null, 3)?.id).toBe("a");
    expect(pickTodayTemplate(list, "a", 3)?.id).toBe("b");
    expect(pickTodayTemplate(list, "c", 3)?.id).toBe("a");
  });

  it("prefers a template scheduled for today's weekday", () => {
    expect(pickTodayTemplate([t("a", 0, 1), t("b", 1, 3)], "a", 3)?.id).toBe("b");
  });

  it("skips archived templates and handles empty programs", () => {
    expect(pickTodayTemplate([{ ...t("a", 0), archived: true }, t("b", 1)], null, 2)?.id).toBe("b");
    expect(pickTodayTemplate([], null, 1)).toBeNull();
  });
});

describe("estimateMinutes", () => {
  it("rounds to 5 minutes with a sensible floor", () => {
    expect(estimateMinutes([{ targetSets: 3, restSec: 90 }, { targetSets: 3, restSec: 90 }])).toBe(15);
    expect(estimateMinutes([])).toBe(10);
  });
});
