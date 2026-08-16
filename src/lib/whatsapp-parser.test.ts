import { describe, expect, it } from "vitest";

import {
  parseDateLine,
  parseWhatsAppMessage,
  resolveMeasurementUnit,
} from "@/lib/whatsapp-parser";

const EXAMPLE = `16 Aug 2026

Weight - 74.2kg
Waist - 38.5
Hip - 38.1
Chest - 37.9
Thigh - 23.2
Upper arm - 13.4 inch

Hip abduction 9x50kg
Hip adduction 3x43kg
Chest press 10x45kg
Lat pulldown 8x50kg`;

describe("parseDateLine", () => {
  it("parses common date formats", () => {
    expect(parseDateLine("16 Aug 2026")).toBe("2026-08-16");
    expect(parseDateLine("16 August 2026")).toBe("2026-08-16");
    expect(parseDateLine("2026-08-16")).toBe("2026-08-16");
    expect(parseDateLine("16/08/2026")).toBe("2026-08-16");
    expect(parseDateLine("Aug 16, 2026")).toBe("2026-08-16");
    expect(parseDateLine("Weight - 74.2kg")).toBeNull();
  });
});

describe("parseWhatsAppMessage - the example message", () => {
  const parsed = parseWhatsAppMessage(EXAMPLE);

  it("extracts date and weight", () => {
    expect(parsed.date).toBe("2026-08-16");
    expect(parsed.weightKg).toBe(74.2);
  });

  it("extracts measurements, leaving unit-less ones uncertain", () => {
    expect(parsed.measurements).toEqual([
      { name: "Waist", value: 38.5, unit: null },
      { name: "Hip", value: 38.1, unit: null },
      { name: "Chest", value: 37.9, unit: null },
      { name: "Thigh", value: 23.2, unit: null },
      { name: "Upper Arm", value: 13.4, unit: "INCH" },
    ]);
  });

  it("title-cases exercise names and reads reps x weight", () => {
    expect(parsed.sets).toEqual([
      { exercise: "Hip Abduction", reps: 9, weightKg: 50 },
      { exercise: "Hip Adduction", reps: 3, weightKg: 43 },
      { exercise: "Chest Press", reps: 10, weightKg: 45 },
      { exercise: "Lat Pulldown", reps: 8, weightKg: 50 },
    ]);
  });

  it("leaves nothing unparsed", () => {
    expect(parsed.unparsedLines).toEqual([]);
  });
});

describe("exercise parsing styles", () => {
  const cases: [
    string,
    { exercise: string; reps: number; weightKg: number },
  ][] = [
    ["Hip abduction 9x50kg", { exercise: "Hip Abduction", reps: 9, weightKg: 50 }],
    ["Hip abduction 9 x 50kg", { exercise: "Hip Abduction", reps: 9, weightKg: 50 }],
    ["Hip abduction 50kg x 9", { exercise: "Hip Abduction", reps: 9, weightKg: 50 }],
    ["hip abduct 9x50", { exercise: "Hip Abduct", reps: 9, weightKg: 50 }],
    ["Hip Abduction - 9 reps 50kg", { exercise: "Hip Abduction", reps: 9, weightKg: 50 }],
  ];

  it.each(cases)("parses '%s'", (input, expected) => {
    const parsed = parseWhatsAppMessage(input);
    expect(parsed.sets[0]).toEqual(expected);
  });

  it("handles 'Hip adduction 3 x 43kg'", () => {
    const parsed = parseWhatsAppMessage("Hip adduction 3 x 43kg");
    expect(parsed.sets[0]).toEqual({
      exercise: "Hip Adduction",
      reps: 3,
      weightKg: 43,
    });
  });
});

describe("date detection in a message", () => {
  const now = new Date("2026-08-16T00:00:00");

  it("detects a year-less date in a header line", () => {
    const parsed = parseWhatsAppMessage(
      "Gym update 12 August\n\nHip abduction 9x50",
      now
    );
    expect(parsed.date).toBe("2026-08-12");
    expect(parsed.sets[0]).toEqual({
      exercise: "Hip Abduction",
      reps: 9,
      weightKg: 50,
    });
  });

  it("does not treat exercise lines as dates", () => {
    const parsed = parseWhatsAppMessage("Hip abduction 9x50kg", now);
    expect(parsed.date).toBeNull();
  });
});

describe("measurement parsing styles", () => {
  it("supports separators and no separator", () => {
    expect(parseWhatsAppMessage("hip 38.1").measurements[0]).toEqual({
      name: "Hip",
      value: 38.1,
      unit: null,
    });
    expect(parseWhatsAppMessage("hip - 38.1").measurements[0]).toEqual({
      name: "Hip",
      value: 38.1,
      unit: null,
    });
    expect(parseWhatsAppMessage("hip: 38.1").measurements[0]).toEqual({
      name: "Hip",
      value: 38.1,
      unit: null,
    });
  });

  it("reads explicit units", () => {
    expect(parseWhatsAppMessage("hip 38.1 inch").measurements[0]).toEqual({
      name: "Hip",
      value: 38.1,
      unit: "INCH",
    });
    expect(parseWhatsAppMessage('Hip = 38.1"').measurements[0]).toEqual({
      name: "Hip",
      value: 38.1,
      unit: "INCH",
    });
    expect(parseWhatsAppMessage("Chest: 37.9 cm").measurements[0]).toEqual({
      name: "Chest",
      value: 37.9,
      unit: "CM",
    });
  });

  it("resolves the default unit for a unit-less value ('hip - 38.1' -> inch)", () => {
    const m = parseWhatsAppMessage("hip - 38.1").measurements[0];
    expect(m).toEqual({ name: "Hip", value: 38.1, unit: null });
    // Athlete's configured default measurement unit is inch.
    expect(resolveMeasurementUnit(m.unit, "INCH", "CM")).toBe("INCH");
    // Explicit unit always wins over defaults.
    expect(resolveMeasurementUnit("CM", "INCH", "INCH")).toBe("CM");
  });

  it("treats a kg value as body weight", () => {
    const parsed = parseWhatsAppMessage("Weight - 74.2kg");
    expect(parsed.weightKg).toBe(74.2);
    expect(parsed.measurements).toHaveLength(0);
  });

  it("handles the lowercase section example", () => {
    const parsed = parseWhatsAppMessage(
      "Weight - 74.2kg\n\nwaist - 38.5\nhip - 38.1\nupper arm - 13.4inch\n\nHip abduction 9x50kg\nHip adduction 3 x 43kg"
    );
    expect(parsed.weightKg).toBe(74.2);
    expect(parsed.measurements).toEqual([
      { name: "Waist", value: 38.5, unit: null },
      { name: "Hip", value: 38.1, unit: null },
      { name: "Upper Arm", value: 13.4, unit: "INCH" },
    ]);
    expect(parsed.sets).toEqual([
      { exercise: "Hip Abduction", reps: 9, weightKg: 50 },
      { exercise: "Hip Adduction", reps: 3, weightKg: 43 },
    ]);
  });
});
