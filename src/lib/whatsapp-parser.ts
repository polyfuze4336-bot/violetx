// Pure WhatsApp message parser. Turns a pasted coach/athlete message into
// structured, editable fitness data. No IO, no framework — fully unit-testable.

export type Unit = "CM" | "INCH";

export interface ParsedMeasurement {
  name: string;
  value: number;
  /** null when no unit was written — the review screen resolves a default. */
  unit: Unit | null;
}

export interface ParsedExerciseSet {
  exercise: string;
  reps: number;
  weightKg: number;
}

export interface ParsedImport {
  date: string | null; // ISO date (yyyy-mm-dd) if a date line was found
  weightKg: number | null;
  measurements: ParsedMeasurement[];
  sets: ParsedExerciseSet[];
  /** Lines that could not be interpreted, for user review. */
  unparsedLines: string[];
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a date from a single line. Supports several common formats. */
export function parseDateLine(line: string): string | null {
  const text = line.trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isValid(d) ? toIsoDate(d) : null;
  }

  const dMonY = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})$/);
  if (dMonY) {
    const month = monthIndex(dMonY[2]);
    if (month !== undefined) {
      const d = new Date(normalizeYear(dMonY[3]), month, Number(dMonY[1]));
      return isValid(d) ? toIsoDate(d) : null;
    }
  }

  const monDY = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (monDY) {
    const month = monthIndex(monDY[1]);
    if (month !== undefined) {
      const d = new Date(normalizeYear(monDY[3]), month, Number(monDY[2]));
      return isValid(d) ? toIsoDate(d) : null;
    }
  }

  const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    const d = new Date(normalizeYear(numeric[3]), month, day);
    return isValid(d) && month >= 0 && month <= 11 ? toIsoDate(d) : null;
  }

  return null;
}

function monthIndex(raw: string): number | undefined {
  const key = raw.toLowerCase();
  return MONTHS[key] ?? MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)];
}

/**
 * Find a date anywhere in a line, including year-less "12 August" (assumes the
 * current year) and "Gym update 12 Aug" style headers.
 */
function findDateInLine(line: string, now: Date): string | null {
  const full = parseDateLine(line);
  if (full) return full;

  const year = now.getFullYear();

  const dMon = line.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:\s+(\d{2,4}))?\b/);
  if (dMon) {
    const mi = monthIndex(dMon[2]);
    const day = Number(dMon[1]);
    if (mi !== undefined && day >= 1 && day <= 31) {
      const d = new Date(dMon[3] ? normalizeYear(dMon[3]) : year, mi, day);
      if (isValid(d)) return toIsoDate(d);
    }
  }

  const monD = line.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{2,4}))?\b/);
  if (monD) {
    const mi = monthIndex(monD[1]);
    const day = Number(monD[2]);
    if (mi !== undefined && day >= 1 && day <= 31) {
      const d = new Date(monD[3] ? normalizeYear(monD[3]) : year, mi, day);
      if (isValid(d)) return toIsoDate(d);
    }
  }

  return null;
}

function normalizeYear(raw: string): number {
  const n = Number(raw);
  return raw.length <= 2 ? 2000 + n : n;
}

function isValid(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function unitFrom(raw: string | undefined): Unit | null {
  if (!raw) return null;
  const u = raw.toLowerCase();
  if (u.includes("inch") || u === '"' || u === "in") return "INCH";
  if (u.includes("cm")) return "CM";
  return null;
}

/**
 * Resolve the unit for a measurement: the written unit if present, else the
 * measurement type's default, else the athlete's configured default. Used so a
 * unit-less value like "hip - 38.1" is never saved with a silently-wrong unit.
 */
export function resolveMeasurementUnit(
  parsed: Unit | null,
  typeDefault: Unit | undefined,
  athleteDefault: Unit
): Unit {
  return parsed ?? typeDefault ?? athleteDefault;
}

/** Title-case a name: "hip abduction" -> "Hip Abduction". */
function titleCase(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

const WEIGHT_LABEL = /^(?:body\s*)?weight$/i;
const UNIT_TOKEN = "(kgs?|cm|inch(?:es)?|in|\")";

/**
 * Parse a measurement / body-weight line. Separator is optional so bare
 * "hip 38.1" works. Supports "-", ":", "=" separators and cm/inch/" units.
 */
function parseMeasurementLine(
  line: string
):
  | { kind: "weight"; weightKg: number }
  | { kind: "measurement"; measurement: ParsedMeasurement }
  | null {
  const m = line.match(
    new RegExp(
      `^([A-Za-z][A-Za-z\\s.]*?)\\s*[-:=–—]?\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT_TOKEN}?\\.?$`,
      "i"
    )
  );
  if (!m) return null;

  const label = m[1].trim();
  const value = Number(m[2].replace(",", "."));
  const unitRaw = m[3]?.toLowerCase();
  if (!Number.isFinite(value)) return null;

  const isKg = unitRaw === "kg" || unitRaw === "kgs";
  if (WEIGHT_LABEL.test(label) || isKg) {
    return { kind: "weight", weightKg: value };
  }

  return {
    kind: "measurement",
    measurement: { name: titleCase(label), value, unit: unitFrom(unitRaw) },
  };
}

/**
 * Parse an exercise-set line in many human styles:
 *   "Hip abduction 9x50kg" / "9 x 50kg" / "50kg x 9" / "9x50"
 *   "Hip Abduction - 9 reps 50kg"
 */
function parseExerciseLine(line: string): ParsedExerciseSet | null {
  // "<name> [-] <reps> reps <weight>[kg]"
  const repsWord = line.match(
    /^(.+?)[\s-]+(\d+)\s*reps?\s*(?:x|of|at|-)?\s*(\d+(?:[.,]\d+)?)\s*(kgs?)?\.?$/i
  );
  if (repsWord) {
    return makeSet(repsWord[1], repsWord[2], repsWord[3]);
  }

  // "<name> <n>[kg] x <n>[kg]" — decide reps vs weight by which side has kg.
  const cross = line.match(
    /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(kgs?)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(kgs?)?\.?$/i
  );
  if (cross) {
    const name = cross[1];
    const leftNum = cross[2];
    const leftKg = Boolean(cross[3]);
    const rightNum = cross[4];
    const rightKg = Boolean(cross[5]);

    if (leftKg && !rightKg) {
      return makeSet(name, rightNum, leftNum); // weight x reps
    }
    // right has kg, or neither -> reps x weight
    return makeSet(name, leftNum, rightNum);
  }

  return null;
}

function makeSet(
  nameRaw: string,
  repsRaw: string,
  weightRaw: string
): ParsedExerciseSet | null {
  const exercise = titleCase(nameRaw);
  const reps = Number(repsRaw);
  const weightKg = Number(weightRaw.replace(",", "."));
  if (
    !exercise ||
    !Number.isInteger(reps) ||
    reps < 0 ||
    !Number.isFinite(weightKg)
  ) {
    return null;
  }
  return { exercise, reps, weightKg };
}

/** Parse a full WhatsApp message into structured fitness data. */
export function parseWhatsAppMessage(
  text: string,
  now: Date = new Date()
): ParsedImport {
  const result: ParsedImport = {
    date: null,
    weightKg: null,
    measurements: [],
    sets: [],
    unparsedLines: [],
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const set = parseExerciseLine(line);
    if (set) {
      result.sets.push(set);
      continue;
    }

    const measurement = parseMeasurementLine(line);
    if (measurement) {
      if (measurement.kind === "weight") {
        result.weightKg = measurement.weightKg;
      } else {
        result.measurements.push(measurement.measurement);
      }
      continue;
    }

    if (result.date === null) {
      const date = findDateInLine(line, now);
      if (date) {
        result.date = date;
        continue;
      }
    }

    result.unparsedLines.push(line);
  }

  return result;
}
