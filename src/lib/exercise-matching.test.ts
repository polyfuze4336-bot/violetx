import { describe, expect, it } from "vitest";

import { STARTER_EXERCISES } from "@/lib/exercise-library";
import {
  aiShortlist,
  applyAiCandidates,
  buildMatchSources,
  editDistance,
  exerciseIdentityKeys,
  fuzzyFilter,
  isUncertain,
  matchExercise,
  normalizeExerciseName,
  parseExerciseRef,
  type MatchSource,
} from "@/lib/exercise-matching";

// An athlete with an empty library: every canonical exercise is a starter candidate.
const starters = buildMatchSources([], STARTER_EXERCISES);

const top = (input: string, sources: MatchSource[] = starters) => {
  const m = matchExercise(input, sources);
  return { status: m.status, name: m.candidates[0]?.name, m };
};

describe("normalizeExerciseName", () => {
  it("lowercases, trims, collapses spaces and normalises punctuation", () => {
    expect(normalizeExerciseName("  Lat   PULLDOWN ")).toBe("lat pulldown");
    expect(normalizeExerciseName("Chin-Up")).toBe("chin up");
    expect(normalizeExerciseName("Chest Press (Machine)")).toBe("chest press machine");
    expect(normalizeExerciseName("Farmer’s Carry")).toBe("farmer carry");
    expect(normalizeExerciseName("")).toBe("");
  });
  it("treats plurals and gym abbreviations as the same word", () => {
    expect(normalizeExerciseName("DB Rows")).toBe("dumbbell row");
    expect(normalizeExerciseName("Triceps")).toBe(normalizeExerciseName("Tricep"));
    expect(normalizeExerciseName("Leg Press")).toBe("leg press");
  });
  it("computes Damerau-Levenshtein distance with transpositions", () => {
    expect(editDistance("pulldwon", "pulldown")).toBe(1);
    expect(editDistance("pres", "press")).toBe(1);
  });
});

describe("step 2: exact name or alias", () => {
  it.each([
    ["Lat Pulldown", "Lat Pulldown"],
    ["lat pulldown", "Lat Pulldown"],
    ["LAT PULLDOWN", "Lat Pulldown"],
    ["Lat Pull Down", "Lat Pulldown"],
    ["  lat   pull  down ", "Lat Pulldown"],
    ["pulldown", "Lat Pulldown"],
    ["Bench Press", "Barbell Bench Press"],
    ["assisted chin", "Assisted Chin-Up"],
    ["assisted chinup", "Assisted Chin-Up"],
    ["Assisted Chin-Up", "Assisted Chin-Up"],
    ["chin assist", "Assisted Chin-Up"],
    ["cable row", "Seated Cable Row"],
    ["Leg Press", "Leg Press"],
    ["Chin up", "Chin-Up"],
    ["pull up", "Pull-Up"],
  ])("%s -> %s", (input, name) => {
    const r = top(input);
    expect(r.status).toBe("EXACT");
    expect(r.name).toBe(name);
  });

  it("never merges assisted and unassisted versions", () => {
    expect(top("Chin up").name).toBe("Chin-Up");
    expect(top("Pull-Up").name).toBe("Pull-Up");
    expect(top("Assisted Pull-Up").name).toBe("Assisted Pull-Up");
    expect(top("Dip").name).toBe("Dip");
    expect(top("Assisted Dip").name).toBe("Assisted Dip");
  });
});

describe("step 3: spelling mistakes", () => {
  it.each([
    ["lat pulldwon", "Lat Pulldown"],
    ["bench pres", "Barbell Bench Press"],
    ["assissted chin", "Assisted Chin-Up"],
    ["assissted chinn", "Assisted Chin-Up"],
    ["cable roww", "Seated Cable Row"],
    ["leg pres", "Leg Press"],
    ["dumbell curl", "Dumbbell Curl"],
    ["romanain deadlift", "Romanian Deadlift"],
    ["shouler press", "Overhead Press"],
    ["tricep pushdwn", "Triceps Pushdown"],
    ["hip abducton", "Hip Abduction"],
    ["hamstring curll", "Leg Curl"],
    ["seated clf raise", "Seated Calf Raise"],
  ])("%s -> %s (a proposal, not exact)", (input, name) => {
    const r = top(input);
    expect(r.name).toBe(name);
    expect(["HIGH", "AMBIGUOUS"]).toContain(r.status);
    expect(r.status).not.toBe("EXACT");
  });

  it("proposes the three required examples with high confidence", () => {
    for (const input of ["lat pulldwon", "assissted chin", "leg pres", "cable roww", "bench pres"]) {
      expect(top(input).status, input).toBe("HIGH");
    }
  });

  it("scores the intended exercise first with Chin-Up as a weaker alternative", () => {
    const m = matchExercise("assissted chinn", starters);
    expect(m.candidates[0].name).toBe("Assisted Chin-Up");
    expect(m.candidates[0].score).toBeGreaterThan(m.candidates[1]?.score ?? 0);
  });

  it("matches against the athlete's own library and aliases", () => {
    const sources = buildMatchSources(
      [
        { id: "a1", name: "Chess Press", aliases: "Machine Chess" },
        { id: "a2", name: "Hip Abduction", aliases: null },
      ],
      STARTER_EXERCISES
    );
    expect(top("chess press", sources)).toMatchObject({ status: "EXACT", name: "Chess Press" });
    expect(matchExercise("chess pres", sources).candidates[0].ref).toBe("id:a1");
    expect(matchExercise("hip abductoin", sources).candidates[0].ref).toBe("id:a2");
  });
});

describe("very similar exercises are not silently merged", () => {
  it("exact hits stay on the intended exercise", () => {
    expect(top("hip abduction").name).toBe("Hip Abduction");
    expect(top("hip adduction").name).toBe("Hip Adduction");
    expect(top("leg curl").name).toBe("Leg Curl");
    expect(top("leg extension").name).toBe("Leg Extension");
    expect(top("barbell curl").name).toBe("Barbell Curl");
    expect(top("dumbbell curl").name).toBe("Dumbbell Curl");
  });

  it("a typo is resolved to the correct member of a similar pair", () => {
    expect(top("hip adductoin").name).toBe("Hip Adduction");
    expect(top("hip abductoin").name).toBe("Hip Abduction");
  });

  it("an equipment word that differs is never a high-confidence correction", () => {
    // "dumbell" is a known typo of dumbbell, but "barbell curl" must not absorb it.
    expect(top("dumbbel curl").name).toBe("Dumbbell Curl");
    const m = matchExercise("cable press", starters);
    expect(m.status).not.toBe("HIGH");
    expect(m.status).not.toBe("EXACT");
  });

  it("an unassisted name is not corrected into the assisted exercise", () => {
    const m = matchExercise("chinn up", starters);
    expect(m.candidates[0].name).toBe("Chin-Up");
  });
});

describe("ambiguous and unknown input", () => {
  it("a generic word lists several candidates instead of guessing", () => {
    const m = matchExercise("row", starters);
    expect(m.status).toBe("AMBIGUOUS");
    expect(m.candidates.length).toBeGreaterThan(2);
    expect(isUncertain(m)).toBe(true);
  });

  it("a partial name is not a confident match", () => {
    const m = matchExercise("bench", starters);
    expect(m.status).not.toBe("HIGH");
    expect(m.status).not.toBe("EXACT");
  });

  it("unknown or custom exercises have no confident match", () => {
    for (const input of ["zercher carry thing", "Sled Push", "my special finisher", "xyz", "Peloton ride"]) {
      const m = matchExercise(input, starters);
      expect(["NONE", "AMBIGUOUS"], input).toContain(m.status);
      expect(m.status, input).not.toBe("HIGH");
      expect(m.status, input).not.toBe("EXACT");
    }
  });

  it("empty or one-character input matches nothing", () => {
    expect(matchExercise("", starters)).toMatchObject({ status: "NONE", candidates: [] });
    expect(matchExercise("a", starters).status).toBe("NONE");
  });

  it("a custom exercise in the library is matched exactly once it exists", () => {
    const sources = buildMatchSources([{ id: "c1", name: "Sled Push", aliases: null }], STARTER_EXERCISES);
    expect(top("sled push", sources)).toMatchObject({ status: "EXACT", name: "Sled Push" });
    expect(matchExercise("sled pus", sources).candidates[0].ref).toBe("id:c1");
  });
});

describe("duplicate prevention", () => {
  it("Lat Pulldown / Lat Pull Down / lat pulldown share one identity", () => {
    const keys = ["Lat Pulldown", "Lat Pull Down", "lat pulldown", " LAT  PULL-DOWN "].map((n) => exerciseIdentityKeys(n)[0]);
    expect(new Set(keys).size).toBe(1);
  });

  it("all four spellings resolve to the same library exercise", () => {
    const sources = buildMatchSources([{ id: "L1", name: "Lat Pulldown", aliases: null }], STARTER_EXERCISES);
    for (const name of ["Lat Pulldown", "Lat Pull Down", "lat pulldown", "Lat Pulldwon"]) {
      const m = matchExercise(name, sources);
      expect(m.candidates[0].ref, name).toBe("id:L1");
    }
    // The library entry hides the equivalent starter so it is never offered twice.
    expect(sources.filter((s) => s.name === "Lat Pulldown")).toHaveLength(1);
  });

  it("starter exercises already covered by an alias in the library are not offered again", () => {
    const sources = buildMatchSources([{ id: "x", name: "Chin Ups", aliases: "Chin-Up" }], STARTER_EXERCISES);
    expect(sources.some((s) => s.ref === "starter:Chin-Up")).toBe(false);
  });
});

describe("starter library integrity", () => {
  it("has no two exercises sharing a normalised name or alias", () => {
    const owner = new Map<string, string>();
    for (const ex of STARTER_EXERCISES) {
      for (const key of exerciseIdentityKeys(ex.name, ex.aliases)) {
        expect(owner.get(key) ?? ex.name, `${ex.name} collides on "${key}"`).toBe(ex.name);
        owner.set(key, ex.name);
      }
    }
  });

  it("covers every muscle group and the main equipment types", () => {
    const groups = new Set(STARTER_EXERCISES.map((e) => e.primary));
    for (const g of ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes & Hips", "Calves", "Core"]) {
      expect(groups.has(g as never), g).toBe(true);
    }
    const equipment = new Set(STARTER_EXERCISES.map((e) => e.equipment));
    for (const e of ["Barbell", "Dumbbell", "Cable", "Smith Machine", "Plate-Loaded", "Machine", "Assisted Machine", "Cardio", "Bodyweight"]) {
      expect(equipment.has(e), e).toBe(true);
    }
  });
});

describe("AI proposals are validated by the application", () => {
  const sources = starters;
  const shortlist = aiShortlist("assissted chinn", sources, 10);
  const base = matchExercise("assissted chinn", sources);

  it("builds a bounded shortlist of known exercises only", () => {
    expect(shortlist.length).toBeLessThanOrEqual(10);
    expect(shortlist.every((s) => sources.some((x) => x.ref === s.ref))).toBe(true);
  });

  it("accepts valid shortlist indexes and turns them into candidates", () => {
    const i = shortlist.findIndex((s) => s.name === "Assisted Chin-Up") + 1;
    const out = applyAiCandidates(base, shortlist, [{ index: i, confidence: 0.96 }]);
    expect(out.usedAi).toBe(true);
    expect(out.status).toBe("HIGH");
    expect(out.candidates[0]).toMatchObject({ name: "Assisted Chin-Up", origin: "ai", ref: "starter:Assisted Chin-Up" });
  });

  it("drops invented, out-of-range and duplicate indexes (the model cannot add ids)", () => {
    const out = applyAiCandidates(base, shortlist, [
      { index: 999, confidence: 1 },
      { index: 0, confidence: 1 },
      { index: -3, confidence: 1 },
      { index: 1.5, confidence: 1 },
    ]);
    expect(out).toBe(base);
    const i = shortlist.findIndex((s) => s.name === "Assisted Chin-Up") + 1;
    const dup = applyAiCandidates(base, shortlist, [
      { index: i, confidence: 0.9 },
      { index: i, confidence: 0.5 },
    ]);
    expect(dup.candidates.filter((c) => c.name === "Assisted Chin-Up")).toHaveLength(1);
    for (const c of dup.candidates) expect(sources.some((s) => s.ref === c.ref)).toBe(true);
  });

  it("clamps confidence and never lets a variation mismatch reach high confidence", () => {
    const sl = aiShortlist("chin", sources, 20);
    const i = sl.findIndex((s) => s.name === "Assisted Chin-Up") + 1;
    const out = applyAiCandidates(matchExercise("chin", sources), sl, [{ index: i, confidence: 5 }]);
    expect(out.candidates[0].score).toBeLessThanOrEqual(0.85);
    expect(out.status).not.toBe("HIGH");
  });

  it("two close AI candidates stay ambiguous", () => {
    const a = shortlist.findIndex((s) => s.name === "Assisted Chin-Up") + 1;
    const b = shortlist.findIndex((s) => s.name === "Assisted Pull-Up") + 1;
    const out = applyAiCandidates(base, shortlist, [
      { index: a, confidence: 0.92 },
      { index: b, confidence: 0.88 },
    ]);
    expect(out.status).toBe("AMBIGUOUS");
  });
});

describe("exercise refs", () => {
  it("parses only well-formed refs", () => {
    expect(parseExerciseRef("id:abc")).toEqual({ kind: "id", id: "abc" });
    expect(parseExerciseRef("starter:Leg Press")).toEqual({ kind: "starter", name: "Leg Press" });
    expect(parseExerciseRef("id:")).toBeNull();
    expect(parseExerciseRef("abc")).toBeNull();
    expect(parseExerciseRef(undefined)).toBeNull();
  });
});

describe("search tolerance", () => {
  const items = [{ n: "Lat Pulldown" }, { n: "Leg Press" }, { n: "Barbell Curl" }];
  it("finds exercises despite typos and ignores unrelated ones", () => {
    expect(fuzzyFilter(items, "lat pulldwon", (i) => [i.n])[0].n).toBe("Lat Pulldown");
    expect(fuzzyFilter(items, "leg pres", (i) => [i.n]).map((i) => i.n)).toEqual(["Leg Press"]);
    expect(fuzzyFilter(items, "", (i) => [i.n])).toHaveLength(3);
    expect(fuzzyFilter(items, "zzzz", (i) => [i.n])).toEqual([]);
  });
});
