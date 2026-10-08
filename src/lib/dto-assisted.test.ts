import { describe, expect, it } from "vitest";

import { toExerciseEntryDTO } from "@/lib/dto";

const base = {
  id: "e1",
  exerciseId: "x1",
  athleteId: "a1",
  date: new Date("2026-03-01T00:00:00Z"),
  reps: 8,
  weightKg: 35,
  sets: null,
  position: 0,
  note: null,
  source: "MANUAL",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("toExerciseEntryDTO assisted flag", () => {
  it("flags assisted machines so displays say 'assistance'", () => {
    const dto = toExerciseEntryDTO({
      ...base,
      exercise: { name: "Assisted Chin-Up", equipment: "Assisted Machine" },
    } as never);
    expect(dto.assisted).toBe(true);
  });

  it("does not flag conventional lifts", () => {
    const dto = toExerciseEntryDTO({
      ...base,
      exercise: { name: "Bench Press", equipment: "Barbell" },
    } as never);
    expect(dto.assisted).toBe(false);
  });
});
