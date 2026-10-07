import { answerWithAi } from "@/ai/coach-qa";
import { aiProviderLabel } from "@/ai/client";
import { analyticsService } from "@/lib/services/analytics";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { checkInService } from "@/lib/services/checkin";
import { goalService } from "@/lib/services/goal";
import { measurementService } from "@/lib/services/measurement";
import { noteService } from "@/lib/services/note";
import { nutritionService } from "@/lib/services/nutrition";
import { requireOwnerAthlete } from "@/lib/services/context";
import { todayIso } from "@/lib/dates";
import {
  answerFromSnapshot,
  buildInsightSnapshot,
  intentOf,
  usesOnlyKnownNumbers,
  type InsightSnapshot,
} from "@/lib/violet-insights";

export interface VioletAnswer {
  answer: string;
  source: "ai" | "rules";
  provider: string;
  missing: string[];
}

const WINDOW_DAYS = 30;

/** Evidence for Violet's observations (viewer-safe numbers only; no note text). */
export async function loadInsightSnapshot(windowDays = WINDOW_DAYS, now: Date = new Date()): Promise<InsightSnapshot> {
  const [analytics, weights, measurements, nutrition, goals, recovery, notes] = await Promise.all([
    analyticsService.get(windowDays <= 30 ? "30D" : "3M", now),
    bodyWeightService.list(),
    measurementService.listEntries(),
    nutritionService.list(),
    goalService.active(),
    checkInService.overview(todayIso(now), 30),
    noteService.list(),
  ]);

  const cutoff = now.getTime() - windowDays * 86_400_000;
  return buildInsightSnapshot({
    now,
    windowDays,
    weights: weights.map((w) => ({ date: w.date, value: w.weightKg })),
    waist: measurements
      .filter((m) => /waist/i.test(m.typeName))
      .map((m) => ({ date: m.date, value: m.value * (m.unit === "INCH" ? 2.54 : 1) })),
    workouts: analytics.totals.workouts,
    workoutsPerWeek: analytics.totals.workoutsPerWeek,
    prCount: analytics.prTimeline.length,
    consistencyPct: analytics.consistency.pct,
    adherencePct: analytics.adherence?.pct ?? null,
    avgSessionRpe: analytics.totals.avgSessionRpe,
    e1rm: analytics.e1rmTrends.map((t) => ({ name: t.name, changePct: t.changePct })),
    nutrition: nutrition.map((n) => ({ date: n.entryDate, calories: n.calories, protein: n.protein, water: n.water })),
    goals: goals.map((g) => ({
      title: g.title,
      pct: g.progress.pct,
      achieved: g.progress.achieved,
      type: g.type,
      targetIsLowerThanStart: g.progress.start !== null && g.progress.target < g.progress.start,
    })),
    readinessAvg7d: recovery.average7d,
    noteCount: notes.filter((n) => new Date(n.date).getTime() >= cutoff).length,
  });
}

export const violetCoachService = {
  async snapshot(windowDays = WINDOW_DAYS): Promise<InsightSnapshot> {
    await requireOwnerAthlete();
    return loadInsightSnapshot(windowDays);
  },

  /**
   * Answer a coaching question from recorded data. AI text is accepted only if
   * it uses numbers that exist in the evidence; otherwise the deterministic
   * answer is returned. Nothing is written to the database.
   */
  async ask(question: string): Promise<VioletAnswer> {
    await requireOwnerAthlete();
    const snapshot = await loadInsightSnapshot();
    const intent = intentOf(question);
    const rules = answerFromSnapshot(intent, snapshot);

    const ai = await answerWithAi(question, snapshot);
    if (ai && usesOnlyKnownNumbers(ai, snapshot)) {
      return { answer: ai, source: "ai", provider: aiProviderLabel(), missing: snapshot.missing };
    }
    return { answer: rules, source: "rules", provider: "violet-rules", missing: snapshot.missing };
  },
};
