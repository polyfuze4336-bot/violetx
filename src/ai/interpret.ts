// Violet interpretation: turns an untrusted message into confidence-scored,
// structured proposals using the deterministic parser. Pure and testable.

import {
  parseWhatsAppMessage,
  resolveMeasurementUnit,
  type ParsedImport,
  type Unit,
} from "@/lib/whatsapp-parser";

export interface MeasurementProposal {
  name: string;
  value: number;
  unit: Unit;
  assumedUnit: boolean;
  confidence: number;
}

export interface SetProposal {
  exercise: string;
  reps: number;
  weightKg: number;
  confidence: number;
  needsResolution: boolean;
}

export interface VioletInterpretation {
  reply: string;
  date: string | null;
  weightKg: number | null;
  weightConfidence: number | null;
  measurements: MeasurementProposal[];
  sets: SetProposal[];
  questions: string[];
  unparsedLines: string[];
}

export interface InterpretContext {
  measurementTypes: { name: string; defaultUnit: Unit }[];
  defaultMeasurementUnit: Unit;
  knownExercises: string[];
}

// Generic single-word names that are too ambiguous to save without confirming.
const AMBIGUOUS_EXERCISE = new Set([
  "press",
  "row",
  "curl",
  "fly",
  "raise",
  "pull",
  "push",
  "extension",
]);

export function interpretMessage(
  text: string,
  ctx: InterpretContext,
  now: Date = new Date()
): VioletInterpretation {
  return buildInterpretation(parseWhatsAppMessage(text, now), ctx);
}

/**
 * Turn a structured extraction (from the parser OR the LLM) into confidence-
 * scored proposals. Shared so parser and AI paths behave identically and stay
 * safe: the output is always validated, editable data — never executable
 * instructions. `replyOverride` lets the AI supply a conversational reply.
 */
export function buildInterpretation(
  parsed: ParsedImport,
  ctx: InterpretContext,
  replyOverride?: string
): VioletInterpretation {
  const typeByName = new Map(
    ctx.measurementTypes.map((t) => [t.name.toLowerCase(), t.defaultUnit])
  );
  const knownExercises = new Set(
    ctx.knownExercises.map((e) => e.toLowerCase())
  );

  const measurements: MeasurementProposal[] = parsed.measurements.map((m) => {
    const assumedUnit = m.unit === null;
    const unit = resolveMeasurementUnit(
      m.unit,
      typeByName.get(m.name.toLowerCase()),
      ctx.defaultMeasurementUnit
    );
    return {
      name: m.name,
      value: m.value,
      unit,
      assumedUnit,
      confidence: assumedUnit ? 0.7 : 0.98,
    };
  });

  const questions: string[] = [];
  const sets: SetProposal[] = parsed.sets.map((s) => {
    const known = knownExercises.has(s.exercise.toLowerCase());
    const ambiguous =
      !known && AMBIGUOUS_EXERCISE.has(s.exercise.trim().toLowerCase());
    if (ambiguous) {
      questions.push(`Which exercise did you mean by "${s.exercise}"?`);
    }
    return {
      exercise: s.exercise,
      reps: s.reps,
      weightKg: s.weightKg,
      confidence: known ? 0.96 : ambiguous ? 0.5 : 0.85,
      needsResolution: ambiguous,
    };
  });

  const parts: string[] = [];
  const measCount =
    measurements.length + (parsed.weightKg != null ? 1 : 0);
  if (measCount > 0) {
    parts.push(`${measCount} body measurement${measCount === 1 ? "" : "s"}`);
  }
  if (sets.length > 0) {
    parts.push(`${sets.length} strength record${sets.length === 1 ? "" : "s"}`);
  }

  let reply: string;
  if (replyOverride && replyOverride.trim()) {
    reply = replyOverride.trim();
  } else if (parts.length === 0) {
    reply =
      "I couldn't find any measurements or workout records in that message. Try including something like \"Waist 38.5\" or \"Hip abduction 9x50kg\".";
  } else {
    reply = `I found ${parts.join(" and ")}${
      parsed.date ? ` from ${parsed.date}` : ""
    }.`;
    if (questions.length > 0) {
      reply += " I need to confirm a couple of things before saving.";
    } else {
      reply += " Would you like me to save these?";
    }
  }

  return {
    reply,
    date: parsed.date,
    weightKg: parsed.weightKg,
    weightConfidence: parsed.weightKg != null ? 0.98 : null,
    measurements,
    sets,
    questions,
    unparsedLines: parsed.unparsedLines,
  };
}
