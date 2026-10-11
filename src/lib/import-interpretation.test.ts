import { describe, expect, it } from "vitest";

import {
  assessClaims,
  isIncompleteSessionStatus,
  recommendImportType,
  SESSION_STATUS_FOR,
  type ClaimInput,
} from "@/lib/import-interpretation";
import { parseWhatsAppMessage } from "@/lib/whatsapp-parser";
import type { PrInputSet } from "@/lib/analytics";

const NOW = new Date("2026-08-16T10:00:00");

describe("parsing the three WhatsApp behaviours", () => {
  it("A: PR-only update (one line per exercise)", () => {
    const r = parseWhatsAppMessage("Bench 80kg x 10\nLat pulldown 65kg x 10", NOW);
    expect(r.sets).toEqual([
      { exercise: "Bench", reps: 10, weightKg: 80 },
      { exercise: "Lat Pulldown", reps: 10, weightKg: 65 },
    ]);
  });

  it("B: complete workout with an exercise heading and bare set lines", () => {
    const r = parseWhatsAppMessage(
      ["Push day", "", "Bench", "80 x 10", "80 x 9", "80 x 8", "", "Incline DB", "30 x 10", "30 x 9", "30 x 8", "", "Triceps pushdown", "30 x 12", "30 x 11", "30 x 10"].join("\n"),
      NOW
    );
    expect(r.sets).toHaveLength(9);
    expect(r.sets.slice(0, 3)).toEqual([
      { exercise: "Bench", reps: 10, weightKg: 80 },
      { exercise: "Bench", reps: 9, weightKg: 80 },
      { exercise: "Bench", reps: 8, weightKg: 80 },
    ]);
    expect(r.sets[3].exercise).toBe("Incline DB");
    expect(r.sets[8]).toEqual({ exercise: "Triceps Pushdown", reps: 10, weightKg: 30 });
    // Only the title is left over; the exercise headings were consumed.
    expect(r.unparsedLines).toEqual(["Push day"]);
  });

  it("C: partial log where later lines continue the previous exercise", () => {
    const r = parseWhatsAppMessage("Bench 80x10\n80x9\nLat pulldown 65x10", NOW);
    expect(r.sets).toEqual([
      { exercise: "Bench", reps: 10, weightKg: 80 },
      { exercise: "Bench", reps: 9, weightKg: 80 },
      { exercise: "Lat Pulldown", reps: 10, weightKg: 65 },
    ]);
  });

  it("keeps the existing reps x weight reading for small numbers ('Hip abduction 9x50')", () => {
    expect(parseWhatsAppMessage("Hip abduction 9x50", NOW).sets[0]).toMatchObject({ reps: 9, weightKg: 50 });
  });

  it("reads misspelled and assisted lines", () => {
    const r = parseWhatsAppMessage("lat pulldwon 65x10\nassissted chin 25x10", NOW);
    expect(r.sets).toEqual([
      { exercise: "Lat Pulldwon", reps: 10, weightKg: 65 },
      { exercise: "Assissted Chin", reps: 10, weightKg: 25 },
    ]);
  });

  it("records a PR claim without leaving 'PR' in the exercise name", () => {
    const r = parseWhatsAppMessage("PR bench 80 x 10", NOW);
    expect(r.sets).toEqual([{ exercise: "Bench", reps: 10, weightKg: 80, prClaim: true }]);
    expect(parseWhatsAppMessage("Bench 80kg x 10 🏆", NOW).sets[0]).toMatchObject({ exercise: "Bench", prClaim: true });
  });

  it("does not take a bare number line as a set when no exercise precedes it", () => {
    const r = parseWhatsAppMessage("80 x 10", NOW);
    expect(r.sets).toEqual([]);
    expect(r.unparsedLines).toEqual(["80 x 10"]);
  });
});

describe("WhatsApp list numbering and invisible characters are not part of the exercise name", () => {
  it("strips '2. ' numbering and zero-width marks (real WhatsApp export text)", () => {
    const text = ["1. \u2060leg press 10x100kg", "2. \u2060leg extension 12x40kg", "7) lat pulldown 10x45kg", "- \u200ebench 80x8"].join("\n");
    const r = parseWhatsAppMessage(text, NOW);
    expect(r.sets.map((s) => s.exercise)).toEqual(["Leg Press", "Leg Extension", "Lat Pulldown", "Bench"]);
    expect(r.sets[1]).toMatchObject({ reps: 12, weightKg: 40 });
  });

  it("does not eat real numbers: '2.5 kg' loads and measurements still parse", () => {
    const r = parseWhatsAppMessage("Hip abduction 9x50kg\nwaist 38.5", NOW);
    expect(r.sets[0]).toMatchObject({ exercise: "Hip Abduction", reps: 9, weightKg: 50 });
    expect(r.measurements[0]).toMatchObject({ name: "Waist", value: 38.5 });
  });
});

describe("recommending an import type", () => {
  const sets = (spec: [string, number][]) =>
    spec.flatMap(([exercise, n]) => Array.from({ length: n }, () => ({ exercise })));

  it("PR-only message → PR UPDATE (never 'only two exercises')", () => {
    const r = recommendImportType({ rawText: "Bench 80kg x 10\nLat pulldown 65kg x 10", sets: sets([["Bench", 1], ["Lat Pulldown", 1]]) });
    expect(r.type).toBe("PR_UPDATE");
    expect(r.exercises).toBe(2);
    expect(r.entries).toBe(2);
    expect(r.reason).toMatch(/selected exercise progress rather than a complete workout/);
  });

  it("five exercises with three sets each → FULL", () => {
    const r = recommendImportType({ sets: sets([["Bench", 3], ["Incline", 3], ["Press", 3], ["Raise", 3], ["Pushdown", 3]]) });
    expect(r.type).toBe("FULL");
  });

  it("a few exercises with repeated sets → PARTIAL", () => {
    const r = recommendImportType({ sets: sets([["Bench", 2], ["Lat Pulldown", 1]]) });
    expect(r.type).toBe("PARTIAL");
  });

  it("explicit wording wins over the shape", () => {
    expect(recommendImportType({ rawText: "full workout today", sets: sets([["Bench", 1]]) }).type).toBe("FULL");
    expect(recommendImportType({ rawText: "just did a part of legs", sets: sets([["Squat", 3]]) }).type).toBe("PARTIAL");
    expect(recommendImportType({ rawText: "new PR!", sets: sets([["Bench", 3], ["Row", 3], ["Curl", 3], ["Press", 3]]) }).type).toBe("PR_UPDATE");
  });
});

describe("session status mapping (incomplete is never zero)", () => {
  it("only a full workout is stored as COMPLETED", () => {
    expect(SESSION_STATUS_FOR).toEqual({ PR_UPDATE: "PR_UPDATE", PARTIAL: "PARTIAL", FULL: "COMPLETED" });
    expect(isIncompleteSessionStatus("PR_UPDATE")).toBe(true);
    expect(isIncompleteSessionStatus("PARTIAL")).toBe(true);
    expect(isIncompleteSessionStatus("COMPLETED")).toBe(false);
    expect(isIncompleteSessionStatus(undefined)).toBe(false);
  });
});

// History helper: one set per row, dated before the import day.
const hist = (exerciseId: string, name: string, date: string, weightKg: number, reps: number, assisted = false, position = 0): PrInputSet => ({
  exerciseId,
  exerciseName: name,
  date: `${date}T00:00:00.000Z`,
  weightKg,
  reps,
  position,
  assisted,
});
const claim = (over: Partial<ClaimInput>): ClaimInput => ({
  exerciseId: "bench",
  exerciseName: "Bench Press",
  weightKg: 80,
  reps: 10,
  assisted: false,
  claimedPr: false,
  ...over,
});
const DAY = "2026-08-16";

describe("claimed PRs are checked by the PR engine", () => {
  it("rep PR: 80 × 8 → 80 × 10", () => {
    const [a] = assessClaims({ history: [hist("bench", "Bench Press", "2026-08-01", 80, 8)], claims: [claim({})], day: DAY });
    expect(a.status).toBe("CONFIRMED_PR");
    expect(a.prType).toBe("REPS");
    expect(a.label).toBe("Rep PR");
    expect(a.detail).toBe("+2 reps at 80 kg");
    expect(a.previous).toEqual({ weightKg: 80, reps: 8 });
  });

  it("weight PR: 80 × 8 → 82.5 × 8", () => {
    const [a] = assessClaims({ history: [hist("bench", "Bench Press", "2026-08-01", 80, 8)], claims: [claim({ weightKg: 82.5, reps: 8 })], day: DAY });
    expect(a.prType).toBe("WEIGHT");
    expect(a.detail).toBe("+2.5 kg");
  });

  it("weight PR on a lat pulldown: 60 × 10 → 65 × 10", () => {
    const [a] = assessClaims({
      history: [hist("lat", "Lat Pulldown", "2026-08-01", 60, 10)],
      claims: [claim({ exerciseId: "lat", exerciseName: "Lat Pulldown", weightKg: 65, reps: 10 })],
      day: DAY,
    });
    expect(a.prType).toBe("WEIGHT");
    expect(a.detail).toBe("+5 kg");
  });

  it("assistance PR: 30 kg assistance → 25 kg assistance", () => {
    const [a] = assessClaims({
      history: [hist("chin", "Assisted Chin-Up", "2026-08-01", 30, 10, true)],
      claims: [claim({ exerciseId: "chin", exerciseName: "Assisted Chin-Up", weightKg: 25, reps: 10, assisted: true })],
      day: DAY,
    });
    expect(a.status).toBe("CONFIRMED_PR");
    expect(a.prType).toBe("ASSISTANCE");
    expect(a.label).toBe("Assistance PR");
    expect(a.detail).toMatch(/5 kg less assistance/);
  });

  it("a claimed PR that history already beats is NOT a PR (80 × 10 vs 80 × 11)", () => {
    const [a] = assessClaims({
      history: [hist("bench", "Bench Press", "2026-07-01", 80, 8), hist("bench", "Bench Press", "2026-08-01", 80, 11)],
      claims: [claim({ claimedPr: true })],
      day: DAY,
    });
    expect(a.status).toBe("NOT_A_PR");
    expect(a.existingBest).toEqual({ weightKg: 80, reps: 11 });
    expect(a.message).toMatch(/PR claim detected/);
    expect(a.message).toMatch(/80 kg × 11/);
    expect(a.message).toMatch(/saved as a progress entry/);
  });

  it("rep records stay contextual to load (60 × 15 does not beat 100 × 10)", () => {
    const [a] = assessClaims({
      history: [hist("bench", "Bench Press", "2026-08-01", 100, 10)],
      claims: [claim({ weightKg: 60, reps: 15 })],
      day: DAY,
    });
    expect(a.status).toBe("NOT_A_PR");
    expect(a.existingBest).toEqual({ weightKg: 100, reps: 10 });
  });

  it("an exercise with no history is a first record, not a PR", () => {
    const [a, b] = assessClaims({
      history: [],
      claims: [claim({ exerciseId: null, exerciseName: "Sled Push", claimedPr: true }), claim({ exerciseId: "bench" })],
      day: DAY,
    });
    expect(a.status).toBe("FIRST_RECORD");
    expect(b.status).toBe("FIRST_RECORD");
  });

  it("an unconfirmed exercise name is not assessed yet", () => {
    const [a] = assessClaims({ history: [hist("bench", "Bench Press", "2026-08-01", 80, 8)], claims: [claim({ unresolved: true, exerciseId: null })], day: DAY });
    expect(a.status).toBe("UNRESOLVED");
  });

  it("several sets in one import produce one achievement, the rest support it", () => {
    const out = assessClaims({
      history: [hist("bench", "Bench Press", "2026-08-01", 80, 8)],
      claims: [claim({ reps: 10 }), claim({ reps: 9 }), claim({ reps: 8 })],
      day: DAY,
    });
    expect(out.map((a) => a.status)).toEqual(["CONFIRMED_PR", "SUPPORTING", "SUPPORTING"]);
    expect(out.filter((a) => a.status === "CONFIRMED_PR")).toHaveLength(1);
  });

  it("only history before the import day is the baseline (no self-comparison)", () => {
    const [a] = assessClaims({
      history: [hist("bench", "Bench Press", "2026-08-01", 80, 8), hist("bench", "Bench Press", DAY, 80, 10)],
      claims: [claim({})],
      day: DAY,
    });
    expect(a.status).toBe("CONFIRMED_PR");
  });
});
