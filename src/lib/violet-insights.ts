// Pure evidence layer for Violet's coach answers. Facts are computed from
// recorded data only; anything missing is reported as missing, never guessed.

export interface Reading {
  date: string;
  value: number;
}

export interface InsightInput {
  now: Date;
  windowDays: number;
  weights: Reading[];
  /** Waist in cm. */
  waist: Reading[];
  workouts: number;
  workoutsPerWeek: number;
  prCount: number;
  consistencyPct: number | null;
  adherencePct: number | null;
  avgSessionRpe: number | null;
  e1rm: { name: string; changePct: number | null }[];
  nutrition: { date: string; calories: number | null; protein: number | null; water: number | null }[];
  goals: { title: string; pct: number; achieved: boolean; targetIsLowerThanStart: boolean; type: string }[];
  readinessAvg7d: number | null;
  noteCount: number;
}

export interface SeriesFact {
  from: number;
  to: number;
  change: number;
  readings: number;
}

export interface InsightSnapshot {
  windowDays: number;
  weight: SeriesFact | null;
  waist: SeriesFact | null;
  workouts: { count: number; perWeek: number; consistencyPct: number | null; adherencePct: number | null; avgSessionRpe: number | null };
  strength: { lift: string; changePct: number }[];
  prCount: number;
  nutrition: { daysLogged: number; avgCalories: number | null; avgProtein: number | null; avgWaterL: number | null } | null;
  goals: { title: string; pct: number; achieved: boolean; type: string }[];
  weightLossGoal: boolean;
  readinessAvg7d: number | null;
  noteCount: number;
  /** Data categories with nothing recorded in the window. */
  missing: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function seriesFact(points: Reading[], from: Date): SeriesFact | null {
  const inWindow = points
    .filter((p) => new Date(p.date).getTime() >= from.getTime())
    .sort((a, b) => a.date.localeCompare(b.date));
  if (inWindow.length < 2) return null;
  const first = inWindow[0].value;
  const last = inWindow[inWindow.length - 1].value;
  return { from: round1(first), to: round1(last), change: round1(last - first), readings: inWindow.length };
}

export function buildInsightSnapshot(i: InsightInput): InsightSnapshot {
  const from = new Date(i.now.getTime() - i.windowDays * 86_400_000);
  const nutritionRows = i.nutrition.filter((n) => new Date(n.date).getTime() >= from.getTime());
  const calories = nutritionRows.map((n) => n.calories).filter((v): v is number => v !== null);
  const protein = nutritionRows.map((n) => n.protein).filter((v): v is number => v !== null);
  const water = nutritionRows.map((n) => n.water).filter((v): v is number => v !== null);

  const weight = seriesFact(i.weights, from);
  const waist = seriesFact(i.waist, from);
  const strength = i.e1rm.filter((e): e is { name: string; changePct: number } => e.changePct !== null).map((e) => ({ lift: e.name, changePct: e.changePct }));
  const nutrition =
    nutritionRows.length > 0
      ? {
          daysLogged: new Set(nutritionRows.map((n) => n.date.slice(0, 10))).size,
          avgCalories: calories.length ? Math.round(avg(calories)!) : null,
          avgProtein: protein.length ? Math.round(avg(protein)!) : null,
          avgWaterL: water.length ? round1(avg(water)!) : null,
        }
      : null;

  const missing: string[] = [];
  if (!weight) missing.push("body weight (needs at least two weigh-ins)");
  if (!waist) missing.push("waist measurements (needs at least two)");
  if (i.workouts === 0) missing.push("workouts");
  if (strength.length === 0) missing.push("strength trends (needs repeated sessions of an exercise)");
  if (!nutrition) missing.push("nutrition logs");
  if (i.readinessAvg7d === null) missing.push("recovery check-ins");
  if (i.goals.length === 0) missing.push("goals");

  return {
    windowDays: i.windowDays,
    weight,
    waist,
    workouts: {
      count: i.workouts,
      perWeek: i.workoutsPerWeek,
      consistencyPct: i.consistencyPct,
      adherencePct: i.adherencePct,
      avgSessionRpe: i.avgSessionRpe,
    },
    strength,
    prCount: i.prCount,
    nutrition,
    goals: i.goals.map((g) => ({ title: g.title, pct: g.pct, achieved: g.achieved, type: g.type })),
    weightLossGoal: i.goals.some((g) => g.type === "BODY_WEIGHT" && g.targetIsLowerThanStart),
    readinessAvg7d: i.readinessAvg7d,
    noteCount: i.noteCount,
    missing,
  };
}

const signed = (n: number, unit = "") =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;

export interface Summary {
  headline: string;
  bullets: string[];
  conclusion: string | null;
}

/** Deterministic "How am I doing?" summary — only states what the data shows. */
export function composeSummary(s: InsightSnapshot): Summary {
  const bullets: string[] = [];
  if (s.weight) bullets.push(`Weight: ${signed(s.weight.change, "kg")} (${s.weight.from} → ${s.weight.to} kg)`);
  if (s.waist) bullets.push(`Waist: ${signed(s.waist.change, "cm")} (${s.waist.from} → ${s.waist.to} cm)`);
  if (s.workouts.count > 0) {
    bullets.push(`Workouts: ${s.workouts.count} (${s.workouts.perWeek}/week)`);
    if (s.workouts.adherencePct !== null) bullets.push(`Program adherence: ${s.workouts.adherencePct}%`);
  }
  for (const st of s.strength.slice(0, 3)) bullets.push(`${st.lift} estimated 1RM: ${signed(st.changePct, "%")}`);
  if (s.prCount > 0) bullets.push(`New PRs: ${s.prCount}`);
  if (s.nutrition?.avgProtein != null) bullets.push(`Average protein logged: ${s.nutrition.avgProtein} g/day (${s.nutrition.daysLogged} days logged)`);
  if (s.readinessAvg7d !== null) bullets.push(`Average readiness (7 days): ${s.readinessAvg7d}/100`);

  let conclusion: string | null = null;
  const strengthHeld = s.strength.length > 0 && s.strength.every((x) => x.changePct >= -2);
  const strengthUp = s.strength.some((x) => x.changePct > 0);
  if (s.weight && s.weight.change < 0 && strengthHeld) {
    conclusion = `You're losing weight while ${strengthUp ? "maintaining or improving" : "maintaining"} recorded strength, which is a positive trend${s.weightLossGoal ? " relative to your stated goal" : ""}.`;
  } else if (s.weight && s.weight.change < 0 && s.strength.length > 0 && !strengthHeld) {
    conclusion = "Weight is trending down but some recorded lifts are slipping — worth watching protein, sleep and total recovery.";
  } else if (s.weight && s.weight.change > 0 && strengthUp) {
    conclusion = "Weight and recorded strength are both rising, consistent with a muscle-gain phase if that matches your goal.";
  } else if (bullets.length > 0 && s.workouts.count > 0 && s.workouts.consistencyPct !== null && s.workouts.consistencyPct >= 75) {
    conclusion = "Consistency is strong — keep logging every session so trends stay reliable.";
  }

  const hasEvidence = bullets.length > 0;
  if (s.missing.length > 0) bullets.push(`Not enough data yet for: ${s.missing.join("; ")}.`);
  return {
    headline: hasEvidence ? `Over the last ${s.windowDays} days:` : `There isn't enough recorded data in the last ${s.windowDays} days to assess progress.`,
    bullets,
    conclusion,
  };
}

export function summaryText(sum: Summary): string {
  return [sum.headline, ...sum.bullets.map((b) => `• ${b}`), ...(sum.conclusion ? ["", sum.conclusion] : [])].join("\n");
}

export type Intent = "progress" | "training" | "strength" | "body" | "nutrition" | "recovery" | "goals" | "general";

export function intentOf(text: string): Intent {
  const t = text.toLowerCase();
  if (/how am i doing|how'?s my progress|how is my progress|overall|progress/.test(t)) return "progress";
  if (/protein|calorie|nutrition|eat|water|diet|macro/.test(t)) return "nutrition";
  if (/recover|readiness|sleep|sore|tired|fatigue/.test(t)) return "recovery";
  if (/goal|target|on track/.test(t)) return "goals";
  if (/bench|squat|deadlift|press|strength|1rm|pr\b|prs\b|stronger|lift/.test(t)) return "strength";
  if (/weight|waist|body|fat|measure/.test(t)) return "body";
  if (/workout|train|session|frequency|consisten|volume/.test(t)) return "training";
  return "general";
}

/** Questions are not data: used to route a message to Q&A instead of import parsing. */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.endsWith("?") ||
    /^(how|what|why|when|where|which|am i|are my|is my|do i|did i|can you|could you|should i|any|tell me|show me|give me)\b/.test(t)
  );
}

/** Deterministic answer for a focused question. */
export function answerFromSnapshot(intent: Intent, s: InsightSnapshot): string {
  const full = composeSummary(s);
  const pick = (re: RegExp) => full.bullets.filter((b) => re.test(b));
  switch (intent) {
    case "strength": {
      const lines = s.strength.map((x) => `• ${x.lift} estimated 1RM: ${signed(x.changePct, "%")}`);
      if (s.prCount > 0) lines.push(`• New PRs: ${s.prCount}`);
      return lines.length ? `Strength over the last ${s.windowDays} days:\n${lines.join("\n")}` : "There isn't enough repeated lifting data in this period to show a strength trend yet.";
    }
    case "body": {
      const lines = pick(/^(Weight|Waist)/);
      return lines.length ? `Body changes over the last ${s.windowDays} days:\n${lines.map((l) => `• ${l}`).join("\n")}` : "I need at least two weigh-ins or waist measurements in this period to describe a trend.";
    }
    case "nutrition":
      return s.nutrition
        ? `Nutrition logged on ${s.nutrition.daysLogged} day(s): ${[s.nutrition.avgCalories != null ? `${s.nutrition.avgCalories} kcal/day` : null, s.nutrition.avgProtein != null ? `${s.nutrition.avgProtein} g protein/day` : null, s.nutrition.avgWaterL != null ? `${s.nutrition.avgWaterL} L water/day` : null].filter(Boolean).join(", ") || "no totals recorded"}.`
        : "No nutrition has been logged in this period, so I can't comment on it.";
    case "recovery":
      return s.readinessAvg7d !== null ? `Your average readiness over the last 7 days is ${s.readinessAvg7d}/100. This is fitness and recovery guidance, not medical advice.` : "No recovery check-ins are recorded yet — a quick daily check-in unlocks readiness insights.";
    case "goals":
      return s.goals.length ? `Goals:\n${s.goals.map((g) => `• ${g.title}: ${g.achieved ? "achieved" : `${g.pct}%`}`).join("\n")}` : "You haven't set any goals yet.";
    case "training": {
      const lines = pick(/^(Workouts|Program adherence|New PRs)/);
      return lines.length ? `Training over the last ${s.windowDays} days:\n${lines.map((l) => `• ${l}`).join("\n")}` : "No workouts are recorded in this period.";
    }
    default:
      return summaryText(full);
  }
}

/**
 * Guard against invented metrics in AI text: every "precise" number (decimals or
 * 3+ digits) must appear in the evidence. Small integers (counts, days) pass.
 */
export function usesOnlyKnownNumbers(answer: string, s: InsightSnapshot): boolean {
  const known: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number") known.push(Math.abs(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(s);
  const nums = answer.match(/\d+(?:\.\d+)?/g) ?? [];
  return nums.every((raw) => {
    const n = Number(raw);
    const precise = raw.includes(".") || raw.length >= 3;
    if (!precise) return true;
    return known.some((k) => Math.abs(k - n) <= 0.051 || Math.abs(Math.round(k) - n) < 0.5);
  });
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/**
 * One-line, evidence-based observation for the dashboard: an estimated-strength
 * series that rose for several consecutive sessions, else strong consistency.
 */
export function progressInsight(
  e1rm: { name: string; points: { date: string; e1rm: number }[] }[],
  consistencyPct: number | null
): string | null {
  let best: { name: string; run: number } | null = null;
  for (const t of e1rm) {
    let run = 0;
    for (let i = t.points.length - 1; i > 0; i--) {
      if (t.points[i].e1rm > t.points[i - 1].e1rm) run += 1;
      else break;
    }
    if (run >= 2 && (!best || run > best.run)) best = { name: t.name, run };
  }
  if (best) {
    const n = best.run;
    return `Your ${best.name.toLowerCase()} estimated strength has progressed for ${COUNT_WORDS[n] ?? n} consecutive sessions.`;
  }
  if (consistencyPct !== null && consistencyPct >= 75) return "Your training consistency has been strong recently.";
  return null;
}
