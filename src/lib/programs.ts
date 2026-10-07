// Pure program logic: preset splits, a deterministic proposal builder used as
// the AI fallback, today's-workout selection and duration estimates.

import type { ParsedProgram, ProgramType } from "@/lib/program-schemas";

type Ex = [name: string, sets: number, repMin: number, repMax: number, rest?: number];

interface Day {
  name: string;
  exercises: Ex[];
}

const PRESETS: Record<Exclude<ProgramType, "CUSTOM">, { label: string; days: Day[] }> = {
  PPL: {
    label: "Push / Pull / Legs",
    days: [
      { name: "Push", exercises: [["Barbell Bench Press", 3, 6, 8, 150], ["Incline Dumbbell Press", 3, 8, 10, 120], ["Dumbbell Shoulder Press", 3, 8, 10, 120], ["Lateral Raise", 3, 12, 15, 60], ["Triceps Pushdown", 3, 10, 15, 60]] },
      { name: "Pull", exercises: [["Lat Pulldown", 3, 8, 10, 120], ["Seated Cable Row", 3, 8, 10, 120], ["Dumbbell Row", 3, 8, 12, 90], ["Face Pull", 3, 12, 15, 60], ["Barbell Curl", 3, 8, 12, 60]] },
      { name: "Legs", exercises: [["Back Squat", 3, 6, 8, 180], ["Romanian Deadlift", 3, 8, 10, 150], ["Leg Press", 3, 10, 12, 120], ["Leg Curl", 3, 10, 12, 90], ["Standing Calf Raise", 3, 12, 15, 60]] },
    ],
  },
  UPPER_LOWER: {
    label: "Upper / Lower",
    days: [
      { name: "Upper A", exercises: [["Barbell Bench Press", 4, 5, 8, 150], ["Barbell Row", 4, 6, 10, 120], ["Dumbbell Shoulder Press", 3, 8, 10, 90], ["Lat Pulldown", 3, 8, 12, 90], ["Triceps Pushdown", 3, 10, 15, 60], ["Barbell Curl", 3, 10, 12, 60]] },
      { name: "Lower A", exercises: [["Back Squat", 4, 5, 8, 180], ["Romanian Deadlift", 3, 8, 10, 150], ["Leg Press", 3, 10, 12, 120], ["Leg Curl", 3, 10, 12, 90], ["Standing Calf Raise", 4, 10, 15, 60]] },
      { name: "Upper B", exercises: [["Incline Dumbbell Press", 4, 8, 10, 120], ["Seated Cable Row", 4, 8, 10, 120], ["Overhead Press", 3, 6, 8, 120], ["Pull-Up", 3, 6, 10, 120], ["Lateral Raise", 3, 12, 15, 60], ["Overhead Triceps Extension", 3, 10, 15, 60]] },
      { name: "Lower B", exercises: [["Hip Thrust", 4, 8, 10, 120], ["Walking Lunge", 3, 10, 12, 90], ["Leg Extension", 3, 12, 15, 60], ["Leg Curl", 3, 10, 12, 90], ["Hanging Leg Raise", 3, 10, 15, 60]] },
    ],
  },
  FULL_BODY: {
    label: "Full Body",
    days: [
      { name: "Full Body A", exercises: [["Back Squat", 3, 6, 8, 180], ["Barbell Bench Press", 3, 6, 8, 150], ["Barbell Row", 3, 8, 10, 120], ["Lateral Raise", 2, 12, 15, 60], ["Plank", 2, 30, 60, 60]] },
      { name: "Full Body B", exercises: [["Romanian Deadlift", 3, 6, 8, 150], ["Overhead Press", 3, 6, 8, 120], ["Lat Pulldown", 3, 8, 12, 90], ["Leg Press", 3, 10, 12, 120], ["Barbell Curl", 2, 10, 12, 60]] },
      { name: "Full Body C", exercises: [["Incline Dumbbell Press", 3, 8, 10, 120], ["Seated Cable Row", 3, 8, 10, 120], ["Walking Lunge", 3, 10, 12, 90], ["Triceps Pushdown", 3, 10, 15, 60], ["Hanging Leg Raise", 2, 10, 15, 60]] },
    ],
  },
};

export function presetProgram(type: Exclude<ProgramType, "CUSTOM">): ParsedProgram {
  const preset = PRESETS[type];
  return {
    name: preset.label,
    programType: type,
    description: undefined,
    templates: preset.days.map((d) => ({
      name: d.name,
      weekday: null,
      exercises: d.exercises.map(([exerciseName, targetSets, repMin, repMax, restSec]) => ({
        exerciseName,
        targetSets,
        repMin,
        repMax,
        restSec: restSec ?? null,
      })),
    })),
  };
}

export interface DeterministicProposal {
  summary: string;
  program: ParsedProgram;
}

const DAY_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** Days per week mentioned in a request ("four-day", "4 days"), else null. */
export function parseDaysFromRequest(request: string): number | null {
  const lower = request.toLowerCase();
  const num = lower.match(/\b([1-6])\s*(?:-|\s)?\s*(?:days?|x\b|sessions?|times)/);
  if (num) return Number(num[1]);
  const word = lower.match(/\b(one|two|three|four|five|six)[\s-]*(?:days?|sessions?)/);
  return word ? DAY_WORDS[word[1]] : null;
}

/**
 * Rule-based proposal from a free-text request. Used when the AI is not
 * configured or its output fails validation, so the feature always works.
 */
export function proposeProgramFromRequest(request: string, daysOverride?: number): DeterministicProposal {
  const lower = request.toLowerCase();
  const days = daysOverride ?? parseDaysFromRequest(request) ?? 4;
  const wantsPpl = /push|pull|\bppl\b/.test(lower);
  const type: Exclude<ProgramType, "CUSTOM"> =
    days >= 5 ? "PPL" : days === 4 ? "UPPER_LOWER" : days === 3 && wantsPpl ? "PPL" : "FULL_BODY";
  const program = presetProgram(type);
  const notes: string[] = [`${PRESETS[type].label} suits ${days} training day${days === 1 ? "" : "s"} per week.`];

  let templates = program.templates;
  if (type === "PPL" && days >= 5) {
    // Run the PPL cycle again for 5–6 days.
    templates = [...templates, ...program.templates.slice(0, days - 3).map((t) => ({ ...t, name: `${t.name} 2` }))];
  } else if (templates.length > days && days >= 1) {
    templates = templates.slice(0, days);
  }

  const emphasis = /bench|chest|push/.test(lower);
  if (emphasis) {
    templates = templates.map((t) => ({
      ...t,
      exercises: t.exercises.map((e, i) =>
        /bench press|chest press/i.test(e.exerciseName) && i === 0 ? { ...e, targetSets: (e.targetSets ?? 3) + 1 } : e
      ),
    }));
    notes.push("Bench volume is slightly higher to support your bench goal.");
  }
  if (/fat|lean|cut|lose|weight loss/.test(lower)) {
    notes.push("Rest times are moderate; pair this with a modest calorie deficit and high protein — this is general guidance, not medical advice.");
  }
  return {
    summary: notes.join(" "),
    program: { ...program, templates },
  };
}

// --- Today's workout ----------------------------------------------------------

export interface TemplateRef {
  id: string;
  dayOrder: number;
  weekday: number | null;
  archived?: boolean;
}

/**
 * Pick the template to train today: one scheduled for today's weekday, otherwise
 * the next in rotation after the most recently completed one.
 */
export function pickTodayTemplate<T extends TemplateRef>(
  templates: T[],
  lastCompletedTemplateId: string | null,
  weekday: number
): T | null {
  const live = templates.filter((t) => !t.archived).sort((a, b) => a.dayOrder - b.dayOrder);
  if (live.length === 0) return null;
  const scheduled = live.find((t) => t.weekday === weekday);
  if (scheduled) return scheduled;
  const unscheduled = live.filter((t) => t.weekday === null || t.weekday === undefined);
  const pool = unscheduled.length > 0 ? unscheduled : live;
  const idx = pool.findIndex((t) => t.id === lastCompletedTemplateId);
  return pool[(idx + 1) % pool.length];
}

/** Rough session length: ~45 s per set plus rest, rounded to 5 min. */
export function estimateMinutes(exercises: { targetSets: number; restSec: number | null }[]): number {
  const sec = exercises.reduce((a, e) => a + e.targetSets * (45 + (e.restSec ?? 90)), 0);
  return Math.max(10, Math.round(sec / 60 / 5) * 5);
}
