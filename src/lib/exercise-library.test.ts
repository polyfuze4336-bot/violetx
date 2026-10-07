import { describe, expect, it } from "vitest";

import { STARTER_EXERCISES, exerciseKeys } from "@/lib/exercise-library";
import { MUSCLE_GROUPS, resolveMuscleGroup } from "@/lib/training-analytics";

describe("starter exercise library", () => {
  it("has unique names and aliases (case-insensitive)", () => {
    const seen = new Set<string>();
    for (const ex of STARTER_EXERCISES) {
      for (const key of exerciseKeys(ex.name, ex.aliases)) {
        expect(seen.has(key), `duplicate key ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("uses valid muscle groups and consistent inference", () => {
    for (const ex of STARTER_EXERCISES) {
      expect(MUSCLE_GROUPS).toContain(ex.primary);
      for (const s of ex.secondary ?? []) expect(MUSCLE_GROUPS).toContain(s);
      expect(resolveMuscleGroup(ex.name, ex.primary)).toBe(ex.primary);
    }
  });

  it("parses comma separated aliases", () => {
    expect(exerciseKeys("Bench", "Flat Bench, Barbell Bench")).toEqual(["bench", "flat bench", "barbell bench"]);
  });
});
