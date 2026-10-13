import { describe, expect, it } from "vitest";

import { STARTER_EXERCISES } from "@/lib/exercise-library";
import { buildMatchSources, formatExerciseName, matchExercise } from "@/lib/exercise-matching";
import { buildProgressMatrix, type TrainingSet } from "@/lib/training-analytics";
import { groupExportMessages, readWhatsAppExport } from "@/lib/whatsapp-export";

const sources = buildMatchSources([], STARTER_EXERCISES);
const resolve = (n: string) => {
  const m = matchExercise(n, sources);
  return { status: m.status, name: m.candidates[0]?.name };
};

describe("real-world typos from a gym chat", () => {
  const cases: [string, string][] = [
    ["Hip Addxution", "Hip Adduction"],
    ["Hip Abducttuon", "Hip Abduction"],
    ["Seates Row", "Seated Cable Row"],
    ["Ovehead Tciep Exten", "Overhead Triceps Extension"],
    ["Tcipesa Pressdown", "Triceps Pushdown"],
    ["Triceps Pressdown", "Triceps Pushdown"],
    ["Vertical Chess Press", "Vertical Chest Press (Machine)"],
    ["Bertical Chest Press", "Vertical Chest Press (Machine)"],
    ["Chess Press", "Chest Press (Machine)"],
    ["Seated Calrf Raise", "Seated Calf Raise"],
    ["Pect Fly", "Pec Fly (Machine)"],
    ["Singe Hand Cable Pull Low Row", "Single-Arm Cable Row"],
    ["Incline Bench Press Smith", "Smith Machine Incline Bench Press"],
    ["Lat Pull", "Lat Pulldown"],
  ];
  it.each(cases)("%s -> %s", (input, expected) => {
    const r = resolve(input);
    expect(r.name).toBe(expected);
    expect(["EXACT", "HIGH"]).toContain(r.status);
  });

  it("does not guess for a word it cannot place", () => {
    expect(resolve("Dependent Curl").status).not.toBe("HIGH");
    expect(resolve("Dependent Curl").status).not.toBe("EXACT");
  });

  it("keeps abduction and adduction apart", () => {
    expect(resolve("Hip Abduction").name).toBe("Hip Abduction");
    expect(resolve("Hip Adduction").name).toBe("Hip Adduction");
  });

  it("keeps every new canonical name stable under formatting", () => {
    for (const e of STARTER_EXERCISES) expect(formatExerciseName(e.name)).toBe(e.name);
  });
});

describe("chat export: every entry is captured", () => {
  const txt = [
    "[7/16/26, 10:44:27 AM] You: dip assisted 10x 34kg",
    "[7/16/26, 11:01:10 AM] You: Pect fly 12 27kg",
    "[7/16/26, 11:05:10 AM] You: Ovehead tciep exten 10 9kg",
    "[7/16/26, 11:09:10 AM] You: Bertical chest press 7\u2019x 12.5kg",
    "[7/16/26, 11:12:10 AM] You: 123 tricep cable pull 8 x 20kg",
    "[7/16/26, 11:14:10 AM] You: Incline bench press smith",
    "8x 15kg",
  ].join("\n");
  const md = [
    "# WhatsApp Chat Export: Gym Rep",
    "",
    "## 16 July 2026",
    "",
    "[10:44 am] **You:** dip assisted 10x 34kg",
    "",
    "[11:01 am] **You:** Pect fly 12 27kg",
    "",
    "## 17 July 2026",
    "",
    "[9:00 am] **You:** Chest press 6 x 32kg",
  ].join("\n");
  const group = (t: string) => groupExportMessages(readWhatsAppExport(t).messages, { knownMeasurementNames: [] });

  it("reads all sets and leaves nothing unread (txt)", () => {
    const days = group(txt);
    expect(days.flatMap((d) => d.sets)).toHaveLength(6);
    expect(days.flatMap((d) => d.unparsedLines)).toEqual([]);
    const names = days.flatMap((d) => d.sets.map((s) => s.exercise.toLowerCase()));
    expect(names).toContain("tricep cable pull");
    expect(names).toContain("pect fly");
  });

  it("reads the markdown export", () => {
    const days = group(md);
    expect(days.map((d) => d.date)).toEqual(["2026-07-16", "2026-07-17"]);
    expect(days.flatMap((d) => d.sets)).toHaveLength(3);
  });

  it("reports lines it cannot read instead of dropping them", () => {
    const days = group("[7/16/26, 10:44:27 AM] You: Mystery machine 3 sets of 20kg heavy\n");
    expect(days[0]?.unparsedLines.length).toBeGreaterThan(0);
  });
});

describe("progress matrix from the very first set", () => {
  const set = (date: string, reps: number, weightKg: number): TrainingSet => ({
    date,
    exerciseId: "cp",
    exerciseName: "Chest Press (Machine)",
    muscleGroup: null,
    reps,
    weightKg,
    sets: null,
  });
  const now = new Date("2026-10-12T10:00:00Z");
  const rows = [set("2026-07-16", 6, 32), set("2026-08-20", 12, 32), set("2026-10-05", 8, 40)];

  it("spans every period back to the first entry", () => {
    const m = buildProgressMatrix(rows, "week", "all", now);
    expect(m.columns.length).toBeGreaterThan(12);
    expect(m.rows[0].cells[0]).toMatchObject({ weightKg: 32, reps: 6 });
  });

  it("measures change and rep gain from the baseline, not a 6-week window", () => {
    const m = buildProgressMatrix(rows, "week", "all", now);
    const t = m.rows[0].trend;
    expect(t.first).toMatchObject({ weightKg: 32, reps: 6 });
    expect(t.last).toMatchObject({ weightKg: 40, reps: 8 });
    expect(t.pct).toBe(25);
    expect(t.repGainAtBaseline).toEqual({ atKg: 32, from: 6, to: 12 });
  });

  it("a numeric window still limits columns", () => {
    expect(buildProgressMatrix(rows, "week", 6, now).columns).toHaveLength(6);
  });
});
