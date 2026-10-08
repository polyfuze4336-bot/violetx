// Deterministic exercise-name matching. Pure (no IO) so every rule is unit-
// testable. Workflow: normalise -> exact name/alias match -> fuzzy match. An
// optional AI step (src/ai/exercise-match.ts) may only re-rank the shortlist
// built here; the application validates it with `applyAiCandidates`.
//
// A "ref" identifies a candidate the APPLICATION produced:
//   "id:<exercise id>"      an exercise already in the athlete's library
//   "starter:<name>"        a canonical starter exercise not yet in the library
// Nothing here (or in the AI step) ever invents an id.

export type MatchStatus = "EXACT" | "HIGH" | "AMBIGUOUS" | "NONE";

export interface MatchSource {
  ref: string;
  name: string;
  aliases?: string[] | string | null;
  source: "library" | "starter";
}

export interface ExerciseCandidate {
  ref: string;
  name: string;
  /** 0..1 */
  score: number;
  /** The name or alias that matched best. */
  via: string;
  source: "library" | "starter";
  origin: "deterministic" | "ai";
}

export interface ExerciseMatch {
  input: string;
  status: MatchStatus;
  candidates: ExerciseCandidate[];
  /** True when the AI step produced (or re-ranked) the candidates. */
  usedAi?: boolean;
}

export const HIGH_CONFIDENCE = 0.85;
export const AMBIGUOUS_FLOOR = 0.65;
const SECOND_BEST_MARGIN = 0.06;
const QUALIFIER_CAP = 0.8;
const TOKEN_MATCH_FLOOR = 0.75;

// Common gym-chat misspellings the generic distance would otherwise treat as
// "close but uncertain". Token level; applied only after the exact step fails.
const RAW_MISSPELLINGS: Record<string, string> = {
  dumbell: "dumbbell",
  dumbel: "dumbbell",
  dumbbel: "dumbbell",
  barbel: "barbell",
  babell: "barbell",
  asisted: "assisted",
  assissted: "assisted",
  assited: "assisted",
  assisstant: "assisted",
  asssited: "assisted",
  pulldwon: "pulldown",
  pulldwn: "pulldown",
  shouler: "shoulder",
  shoulderr: "shoulder",
  sholder: "shoulder",
  tricept: "triceps",
  bicept: "biceps",
  deadlfit: "deadlift",
  deadlft: "deadlift",
  squatt: "squat",
  sqaut: "squat",
  extention: "extension",
  extenstion: "extension",
  abducton: "abduction",
  adducton: "adduction",
  hamstrng: "hamstring",
  cabel: "cable",
  caable: "cable",
  pres: "press",
};

// Words that change WHICH exercise it is (equipment / variation / direction).
// A mismatch can never be a high-confidence correction: assisted vs unassisted
// and abduction vs adduction are different movements.
const QUALIFIERS = new Set([
  "barbell",
  "dumbbell",
  "cable",
  "smith",
  "machine",
  "assisted",
  "plate",
  "kettlebell",
  "incline",
  "decline",
  "seated",
  "standing",
  "lying",
  "reverse",
  "close",
  "wide",
  "hammer",
  "abduction",
  "adduction",
  "front",
  "single",
  "bulgarian",
  "romanian",
  "sumo",
  "overhead",
]);

const TOKEN_SYNONYMS: Record<string, string> = {
  db: "dumbbell",
  dbs: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  assist: "assisted",
  chinup: "chin up",
  pullup: "pull up",
  situp: "sit up",
  pushup: "push up",
};

function singular(t: string): string {
  // Plural/singular must not split one exercise in two ("rows"/"row").
  // "pres" is a typo of "press", not a plural.
  const plural = t.length >= 3 && t.endsWith("s") && !/(ss|us|is)$/.test(t) && !(t.length === 4 && t.endsWith("es"));
  return plural ? t.slice(0, -1) : t;
}

/** lowercase, strip accents, punctuation -> spaces, collapse spaces, canonical tokens. */
export function normalizeExerciseName(raw: string): string {
  const base = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u0080-\uffff]+/g, " ")
    .trim();
  if (!base) return "";
  return base
    .split(/\s+/)
    .map((t) => TOKEN_SYNONYMS[t] ?? t)
    .join(" ")
    .split(/\s+/)
    .map(singular)
    .join(" ");
}

// Keys are compared against normalised tokens, so they are normalised alike.
const COMMON_MISSPELLINGS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_MISSPELLINGS).map(([k, v]) => [singular(k), v])
);

const compact = (normalized: string) => normalized.replace(/ /g, "");

/** Distinct normalised forms of a name and its aliases. */
export function exerciseLookupKeys(name: string, aliases?: string[] | string | null): string[] {
  const list = Array.isArray(aliases) ? aliases : (aliases ?? "").split(",");
  return Array.from(new Set([name, ...list].map(normalizeExerciseName).filter(Boolean)));
}

/** Space-insensitive keys: "Lat Pull Down" and "Lat Pulldown" are the same exercise. */
export function exerciseIdentityKeys(name: string, aliases?: string[] | string | null): string[] {
  return exerciseLookupKeys(name, aliases).map(compact);
}

/** Damerau-Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

const similarity = (a: string, b: string) => 1 - editDistance(a, b) / Math.max(a.length, b.length, 1);

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 3) return 0;
  const s = similarity(a, b);
  return s >= TOKEN_MATCH_FLOOR ? s : 0;
}

/** The qualifier words an exercise name carries (typos of qualifiers included). */
function qualifiersOf(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    if (QUALIFIERS.has(t)) {
      out.add(t);
      continue;
    }
    if (t.length < 6) continue;
    let best: string | null = null;
    let bestSim = 0.8;
    let tie = false;
    Array.from(QUALIFIERS).forEach((q) => {
      const s = similarity(t, q);
      if (s > bestSim) {
        best = q;
        bestSim = s;
        tie = false;
      } else if (s === bestSim && best) tie = true;
    });
    if (best && !tie) out.add(best);
  }
  return out;
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && Array.from(a).every((x) => b.has(x));

function scoreAgainstKey(inputNorm: string, keyNorm: string, inputQualifiers: Set<string>): number {
  const ic = compact(inputNorm);
  const kc = compact(keyNorm);
  if (ic === kc) return 1;

  const it = inputNorm.split(" ");
  const kt = keyNorm.split(" ");
  const best = (t: string, pool: string[]) => pool.reduce((m, p) => Math.max(m, tokenSimilarity(t, p)), 0);
  const recall = it.reduce((a, t) => a + best(t, kt), 0) / it.length;
  const precision = kt.reduce((a, t) => a + best(t, it), 0) / kt.length;
  let score = Math.max(similarity(ic, kc), recall * 0.65 + precision * 0.35);

  if (!sameSet(inputQualifiers, qualifiersOf(kt))) score = Math.min(score, QUALIFIER_CAP);
  return Math.round(score * 1000) / 1000;
}

function rank(inputNorm: string, sources: MatchSource[]): ExerciseCandidate[] {
  const qualifiers = qualifiersOf(inputNorm.split(" "));
  const out: ExerciseCandidate[] = [];
  for (const s of sources) {
    let best = 0;
    let via = s.name;
    for (const key of exerciseLookupKeys(s.name, s.aliases)) {
      const sc = scoreAgainstKey(inputNorm, key, qualifiers);
      if (sc > best) {
        best = sc;
        via = key;
      }
    }
    if (best > 0) out.push({ ref: s.ref, name: s.name, score: best, via, source: s.source, origin: "deterministic" });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function classify(ranked: ExerciseCandidate[]): MatchStatus {
  const [top, second] = ranked;
  if (!top) return "NONE";
  if (top.score >= HIGH_CONFIDENCE && (!second || top.score - second.score >= SECOND_BEST_MARGIN)) return "HIGH";
  return top.score >= AMBIGUOUS_FLOOR ? "AMBIGUOUS" : "NONE";
}

const MAX_CANDIDATES = 5;

/**
 * Steps 1-3 of the matching workflow. EXACT means the normalised name (or its
 * space-insensitive form) equals a canonical name or alias, so no guessing was
 * needed. HIGH / AMBIGUOUS are PROPOSALS for the user to confirm.
 */
export function matchExercise(input: string, sources: MatchSource[]): ExerciseMatch {
  const norm = normalizeExerciseName(input);
  if (norm.length < 2) return { input, status: "NONE", candidates: [] };
  const ic = compact(norm);

  // Step 2: exact name / alias.
  const exact = sources.filter((s) => exerciseLookupKeys(s.name, s.aliases).some((k) => compact(k) === ic));
  if (exact.length > 0) {
    const libraryFirst = exact.some((e) => e.source === "library") ? exact.filter((e) => e.source === "library") : exact;
    const candidates = libraryFirst.map<ExerciseCandidate>((s) => ({
      ref: s.ref,
      name: s.name,
      score: 1,
      via: norm,
      source: s.source,
      origin: "deterministic",
    }));
    return { input, status: candidates.length === 1 ? "EXACT" : "AMBIGUOUS", candidates: candidates.slice(0, MAX_CANDIDATES) };
  }

  // Step 3a: a known misspelling that becomes an exact name once corrected.
  const corrected = norm
    .split(" ")
    .map((t) => COMMON_MISSPELLINGS[t] ?? t)
    .join(" ");
  if (corrected !== norm) {
    const cc = compact(normalizeExerciseName(corrected));
    const hits = sources.filter((s) => exerciseLookupKeys(s.name, s.aliases).some((k) => compact(k) === cc));
    if (hits.length === 1) {
      return {
        input,
        status: "HIGH",
        candidates: [{ ref: hits[0].ref, name: hits[0].name, score: 0.97, via: corrected, source: hits[0].source, origin: "deterministic" }],
      };
    }
  }

  // Step 3b: fuzzy.
  const ranked = rank(norm, sources);
  const status = classify(ranked);
  return { input, status, candidates: ranked.filter((c) => c.score >= 0.5).slice(0, MAX_CANDIDATES) };
}

/** Whether the optional AI step is worth running for this deterministic result. */
export function isUncertain(match: ExerciseMatch): boolean {
  if (match.status === "AMBIGUOUS") return true;
  if (match.status !== "NONE") return false;
  const norm = normalizeExerciseName(match.input);
  return norm.length >= 4 && (match.candidates[0]?.score ?? 0) >= 0.4;
}

/** Top candidates (any score) the AI is allowed to choose from. */
export function aiShortlist(input: string, sources: MatchSource[], size = 25): MatchSource[] {
  const norm = normalizeExerciseName(input);
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  return rank(norm, sources)
    .filter((c) => c.score >= 0.2)
    .slice(0, size)
    .map((c) => byRef.get(c.ref)!)
    .filter(Boolean);
}

export interface AiCandidate {
  /** 1-based position in the shortlist the model was shown. */
  index: number;
  confidence: number;
}

const AI_HIGH = 0.9;
const AI_MARGIN = 0.08;

/**
 * Validate AI output against the shortlist. Out-of-range / duplicate indexes
 * are dropped, so the model can never introduce an exercise or id of its own.
 * A candidate whose equipment/variation words differ from the input (e.g.
 * assisted vs unassisted) is capped below the high-confidence bar.
 */
export function applyAiCandidates(match: ExerciseMatch, shortlist: MatchSource[], ai: AiCandidate[]): ExerciseMatch {
  const norm = normalizeExerciseName(match.input);
  const inputQualifiers = qualifiersOf(norm.split(" "));
  const seen = new Set<string>();
  const valid: ExerciseCandidate[] = [];
  for (const c of ai) {
    if (!Number.isInteger(c.index) || c.index < 1 || c.index > shortlist.length) continue;
    const src = shortlist[c.index - 1];
    if (seen.has(src.ref)) continue;
    seen.add(src.ref);
    let confidence = Math.min(1, Math.max(0, Number.isFinite(c.confidence) ? c.confidence : 0));
    const clash = !sameSet(inputQualifiers, qualifiersOf(normalizeExerciseName(src.name).split(" ")));
    if (clash) confidence = Math.min(confidence, 0.85);
    valid.push({ ref: src.ref, name: src.name, score: Math.round(confidence * 100) / 100, via: src.name, source: src.source, origin: "ai" });
  }
  if (valid.length === 0) return match;
  valid.sort((a, b) => b.score - a.score);
  const [top, second] = valid;
  const status: MatchStatus =
    top.score >= AI_HIGH && (!second || top.score - second.score >= AI_MARGIN)
      ? "HIGH"
      : top.score >= 0.6
        ? "AMBIGUOUS"
        : "NONE";
  return { input: match.input, status, candidates: valid.slice(0, MAX_CANDIDATES), usedAi: true };
}

/** Typo-tolerant ordering for search boxes: substring hits first, then fuzzy. */
export function fuzzyFilter<T>(items: T[], query: string, textOf: (item: T) => string[]): T[] {
  const q = normalizeExerciseName(query);
  if (!q) return items;
  const scored = items
    .map((item) => {
      const texts = textOf(item).filter(Boolean);
      const norms = texts.map(normalizeExerciseName);
      if (norms.some((n) => n.includes(q) || compact(n).includes(compact(q)))) return { item, score: 1 };
      const fuzzy = texts.reduce((m, t) => Math.max(m, exerciseLookupKeys(t).reduce((mm, k) => Math.max(mm, scoreAgainstKey(q, k, new Set())), 0)), 0);
      return { item, score: fuzzy >= 0.7 ? fuzzy : 0 };
    })
    .filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.item);
}

// --- Refs ---------------------------------------------------------------------

export type ParsedRef = { kind: "id"; id: string } | { kind: "starter"; name: string } | null;

export const libraryRef = (id: string) => `id:${id}`;
export const starterRef = (name: string) => `starter:${name}`;

export function parseExerciseRef(ref: string | null | undefined): ParsedRef {
  if (!ref) return null;
  if (ref.startsWith("id:") && ref.length > 3) return { kind: "id", id: ref.slice(3) };
  if (ref.startsWith("starter:") && ref.length > 8) return { kind: "starter", name: ref.slice(8) };
  return null;
}

/**
 * Library exercises plus the canonical starter exercises the athlete does not
 * have yet (skipped when any name/alias already exists, mirroring the seeder).
 */
export function buildMatchSources(
  library: { id: string; name: string; aliases?: string | null }[],
  starters: { name: string; aliases?: string[] }[]
): MatchSource[] {
  const out: MatchSource[] = library.map((e) => ({ ref: libraryRef(e.id), name: e.name, aliases: e.aliases, source: "library" }));
  const taken = new Set(library.flatMap((e) => exerciseLookupKeys(e.name, e.aliases).map(compact)));
  for (const s of starters) {
    if (exerciseLookupKeys(s.name, s.aliases).some((k) => taken.has(compact(k)))) continue;
    out.push({ ref: starterRef(s.name), name: s.name, aliases: s.aliases, source: "starter" });
  }
  return out;
}
