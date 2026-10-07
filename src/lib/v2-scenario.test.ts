import { describe, expect, it } from "vitest";

import { buildAnalytics } from "@/lib/analytics-engine";
import { computeGoalProgress } from "@/lib/goals";
import { estimateMinutes, pickTodayTemplate, presetProgram } from "@/lib/programs";
import { buildInsightSnapshot, composeSummary, progressInsight, summaryText } from "@/lib/violet-insights";
import { buildWeeklyReview } from "@/lib/weekly-review";
import { computeWorkoutAchievements } from "@/lib/gym-workouts";
import { detectSetPrs, suggestProgression, summarizeSessions, type LoggedSet } from "@/lib/workout-engine";

/**
 * End-to-end lifecycle on the pure engines (the services add auth + persistence,
 * covered by their own tests): program → today → start → previous performance →
 * log sets → PR → finish → analytics → goal → weekly review → Violet → gym journey.
 */
describe("V2 lifecycle scenario", () => {
  const NOW = new Date("2026-08-20T10:00:00Z"); // Thursday
  const program = presetProgram("PPL");

  // History from earlier weeks (bench only, for brevity).
  const history: LoggedSet[] = [
    ...[["2026-07-30", 77.5], ["2026-08-06", 80], ["2026-08-13", 80]].flatMap(([d, w]) =>
      [8, 8, 7].map((reps) => ({ date: d as string, weightKg: w as number, reps, sessionId: `s-${d}` }))
    ),
  ];

  it("runs the whole loop consistently", () => {
    // 1. Program + today's workout (Push is first; nothing completed yet).
    const templates = program.templates.map((t, i) => ({ id: `t${i}`, dayOrder: i, weekday: null }));
    expect(pickTodayTemplate(templates, null, 4)?.id).toBe("t0");
    expect(estimateMinutes(program.templates[0].exercises.map((e) => ({ targetSets: e.targetSets ?? 3, restSec: e.restSec ?? null })))).toBeGreaterThanOrEqual(20);

    // 2. Previous performance and an explainable target.
    const last = summarizeSessions(history)[0];
    expect(last.date).toBe("2026-08-13");
    const target = suggestProgression(history, { repMin: 6, repMax: 8 });
    expect(target.rationale.length).toBeGreaterThan(20);
    expect(target.weightKg).not.toBeNull();

    // 3. Log today's sets; the heavier set is a PR with the right delta.
    const today = "2026-08-20";
    const sets = [
      { weightKg: 82.5, reps: 8 },
      { weightKg: 82.5, reps: 8 },
      { weightKg: 82.5, reps: 7 },
    ];
    const soFar: typeof sets = [];
    const prTypes: string[] = [];
    for (const s of sets) {
      prTypes.push(...detectSetPrs({ set: s, priorHistory: history, sessionSetsSoFar: soFar }).map((p) => p.type));
      soFar.push(s);
    }
    expect(prTypes).toContain("WEIGHT");
    const todaySets: LoggedSet[] = sets.map((s) => ({ date: today, sessionId: "today", ...s }));
    const all = [...history, ...todaySets];

    // 4. History now includes the workout; sessions summarise correctly.
    expect(summarizeSessions(all)[0].date).toBe(today);

    // 5. Analytics update (volume, e1RM trend).
    const toRow = (s: LoggedSet) => ({ date: s.date, exerciseId: "bench", exerciseName: "Bench Press", muscleGroup: null, reps: s.reps, weightKg: s.weightKg, sets: null, sessionId: s.sessionId, setType: null });
    const analytics = buildAnalytics(
      {
        sets: all.map(toRow),
        sessions: [{ id: "today", date: today, durationMin: 55, sessionRpe: 8 }],
        weights: [{ date: "2026-08-01", value: 79.5 }, { date: "2026-08-19", value: 78.6 }],
        measurements: [],
        prs: [{ date: today, exerciseName: "Bench Press", type: "WEIGHT", weightKg: 82.5, reps: 8 }],
        plannedPerWeek: 3,
      },
      "30D",
      NOW
    );
    expect(analytics.totals.workouts).toBe(4);
    expect(analytics.e1rmTrends[0].changePct).toBeGreaterThan(0);
    expect(analytics.prTimeline).toHaveLength(1);

    // 6. Goal progress reflects the new estimated strength.
    const series = analytics.e1rmTrends[0].points.map((p) => ({ date: p.date, value: p.e1rm }));
    const goal = computeGoalProgress({ type: "STRENGTH", startValue: series[0].value, targetValue: 120, startDate: "2026-07-01" }, { series }, NOW);
    expect(goal.current).toBeGreaterThan(series[0].value);
    expect(goal.pct).toBeGreaterThan(0);

    // 7. Weekly review includes the workout and PR.
    const review = buildWeeklyReview({
      weekStart: "2026-08-17",
      sets: all.map(toRow),
      prs: [{ date: today, exerciseName: "Bench Press", type: "WEIGHT", weightKg: 82.5, reps: 8, prevWeightKg: 80 }],
      weights: [{ date: "2026-08-12", value: 79.2 }, { date: "2026-08-19", value: 78.6 }],
      waistCm: [],
      checkIns: [{ date: today, score: 78 }],
      nutrition: [],
      targets: null,
      plannedPerWeek: 3,
    });
    expect(review.training.workouts).toBe(1);
    expect(review.strength.prs[0].label).toContain("+2.5 kg");

    // 8. Violet states only what the data shows and admits gaps.
    const snapshot = buildInsightSnapshot({
      now: NOW,
      windowDays: 30,
      weights: [{ date: "2026-08-01", value: 79.5 }, { date: "2026-08-19", value: 78.6 }],
      waist: [],
      workouts: analytics.totals.workouts,
      workoutsPerWeek: analytics.totals.workoutsPerWeek,
      prCount: analytics.prTimeline.length,
      consistencyPct: analytics.consistency.pct,
      adherencePct: analytics.adherence?.pct ?? null,
      avgSessionRpe: analytics.totals.avgSessionRpe,
      e1rm: analytics.e1rmTrends.map((t) => ({ name: t.name, changePct: t.changePct })),
      nutrition: [],
      goals: [],
      readinessAvg7d: 78,
      noteCount: 0,
    });
    const text = summaryText(composeSummary(snapshot));
    expect(text).toContain("Weight: −0.9 kg");
    expect(text).toMatch(/Not enough data yet for: .*waist.*nutrition/);
    // Only one rising step so far (80 -> 82.5 kg): Violet does not overstate a trend.
    expect(progressInsight(analytics.e1rmTrends, analytics.consistency.pct)).toBeNull();

    // 9. Gym journey recognises the workout milestones.
    const ach = Object.fromEntries(
      computeWorkoutAchievements({ totalWorkouts: analytics.totals.workouts, totalPrs: 1, gymsVisited: 1, statesVisited: 1, consistentWeeks: 0 }).map((a) => [a.key, a.unlocked])
    );
    expect(ach["first-workout"]).toBe(true);
    expect(ach["first-pr"]).toBe(true);
    expect(ach["workouts-10"]).toBe(false);
  });

  it("keeps historical (pre-V2) strength data compatible: no session, no set type, no RPE", () => {
    const legacy: LoggedSet[] = [
      { date: "2026-07-01", weightKg: 60, reps: 10 },
      { date: "2026-07-01", weightKg: 60, reps: 10 },
      { date: "2026-07-08", weightKg: 62.5, reps: 8 },
    ];
    const sessions = summarizeSessions(legacy);
    expect(sessions.map((s) => s.date)).toEqual(["2026-07-08", "2026-07-01"]);
    expect(suggestProgression(legacy).kind).not.toBe("baseline");
    expect(detectSetPrs({ set: { weightKg: 65, reps: 8 }, priorHistory: legacy, sessionSetsSoFar: [] }).map((p) => p.type)).toContain("WEIGHT");
  });
});
