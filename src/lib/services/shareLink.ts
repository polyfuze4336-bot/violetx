import { bodyWeightRepository } from "@/lib/repositories/bodyWeight";
import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { measurementEntryRepository } from "@/lib/repositories/measurement";
import { shareLinkRepository } from "@/lib/repositories/shareLink";
import { requireOwnerAthlete } from "@/lib/services/context";
import { derivePersonalRecords, derivePrEvents } from "@/lib/services/personalRecord";
import { toNumber } from "@/lib/dto";
import { PATIENT_LABEL } from "@/lib/constants";
import { isAssistedExercise } from "@/lib/progression-type";
import {
  buildAchievements,
  countByKind,
  detectE1rmPrs,
  forCoach,
  toPublicProgressions,
  type PublicAchievement,
  type PublicPrKind,
  type PublicProgression,
} from "@/lib/coach-view";
import { buildInsightSnapshot, composeSummary, recentProgressions } from "@/lib/violet-insights";
import { NotFoundError } from "@/lib/rbac";
import { loadGoals } from "@/lib/services/goal";
import { computeAnalytics } from "@/lib/services/analytics";
import { listWorkoutsFor } from "@/lib/services/workout";
import { readinessHistory } from "@/lib/services/checkin";
import { createShareLinkSchema, type CreateShareLinkInput } from "@/lib/schemas";
import {
  computeShareExpiry,
  generateShareToken,
  hashShareToken,
  isNeverExpiring,
  isWellFormedShareToken,
  shareLinkStatus,
  type ShareLinkStatus,
} from "@/lib/share-link";

export interface ShareLinkDTO {
  id: string;
  label: string | null;
  status: ShareLinkStatus;
  /** null = never expires. */
  expiresAt: string | null;
  createdAt: string;
  lastViewedAt: string | null;
}

export interface CreatedShareLinkDTO {
  link: ShareLinkDTO;
  /** Raw secret. Returned exactly once; only its hash is stored. */
  token: string;
}

/**
 * Everything a coach link can show. Deliberately built from explicit, minimal
 * shapes: no database ids, emails, notes, nutrition, imports or gym names.
 */
export interface SharedProgressDTO {
  weights: { date: string; weightKg: number }[];
  measurements: { typeName: string; unit: string; date: string; value: number }[];
  records: {
    exerciseName: string;
    /** Assisted: weights are assistance (lower = stronger) and no 1RM estimate. */
    assisted: boolean;
    maxWeightKg: number;
    maxWeightReps: number;
    maxReps: number;
    maxRepsWeightKg: number;
    estimatedOneRepMaxKg: number;
    lastPerformed: string;
  }[];
  /** Weight, rep, estimated-1RM and assistance PRs, newest first. */
  achievements: PublicAchievement[];
  prCounts: Record<PublicPrKind, number>;
  /** Last session vs the one before: load, rep and assistance progression. */
  progressions: PublicProgression[];
  recentSets: { exerciseName: string; date: string; reps: number; weightKg: number; assisted: boolean }[];
  /** Goal progress only (no notes). */
  goals: {
    title: string;
    type: string;
    pct: number;
    current: number | null;
    target: number;
    unit: string;
    achieved: boolean;
  }[];
  /** Recent workouts; gym names and notes are deliberately omitted. */
  workouts: {
    date: string;
    name: string | null;
    durationMin: number | null;
    sets: number;
    volumeKg: number;
    exercises: string[];
  }[];
  training: {
    workouts: number;
    workoutsPerWeek: number;
    consistencyPct: number | null;
    adherencePct: number | null;
    weeklyVolume: { label: string; volumeKg: number }[];
    weeklyWorkouts: { label: string; workouts: number }[];
    e1rm: { name: string; changePct: number | null; points: { date: string; e1rm: number }[] }[];
  };
  /** Readiness scores only — never check-in notes or heart rate. */
  readiness: { date: string; score: number }[];
  /** Deterministic Violet observations computed from the data above. */
  observations: { bullets: string[]; conclusion: string | null };
  /** null = the link never expires. */
  expiresAt: string | null;
}

function toDTO(row: {
  id: string;
  label: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastViewedAt: Date | null;
}): ShareLinkDTO {
  return {
    id: row.id,
    label: row.label,
    status: shareLinkStatus(row),
    expiresAt: isNeverExpiring(row.expiresAt) ? null : row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
  };
}

export const shareLinkService = {
  // --- Owner-managed (writes are OWNER-only, enforced here) ---
  async list(): Promise<ShareLinkDTO[]> {
    const { athleteId } = await requireOwnerAthlete();
    const rows = await shareLinkRepository.list(athleteId);
    return rows.map(toDTO);
  },

  async create(input: CreateShareLinkInput): Promise<CreatedShareLinkDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = createShareLinkSchema.parse(input);
    const token = generateShareToken();
    const row = await shareLinkRepository.create({
      athleteId,
      tokenHash: hashShareToken(token),
      label: data.label?.trim() || null,
      expiresAt: computeShareExpiry(data.expiresInDays),
    });
    return { link: toDTO(row), token };
  },

  async revoke(id: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const count = await shareLinkRepository.revoke(athleteId, id);
    if (count === 0) throw new NotFoundError("Share link not found.");
  },

  // --- Public, token-authorised, strictly read-only ---
  /**
   * Resolve a raw token to read-only progress data. Returns null for
   * malformed, unknown, expired or revoked tokens (indistinguishable to the
   * caller). Notes, nutrition and imports are deliberately never included.
   */
  async getSharedProgress(token: string): Promise<SharedProgressDTO | null> {
    if (!isWellFormedShareToken(token)) return null;
    const link = await shareLinkRepository.findByTokenHash(
      hashShareToken(token)
    );
    if (!link || shareLinkStatus(link) !== "active") return null;

    const athleteId = link.athleteId;
    const [weights, measurements, entries, goals, workouts, analytics, readiness] = await Promise.all([
      bodyWeightRepository.list(athleteId),
      measurementEntryRepository.list(athleteId),
      exerciseEntryRepository.list(athleteId),
      loadGoals(athleteId),
      listWorkoutsFor(athleteId, 12),
      computeAnalytics(athleteId, "3M"),
      readinessHistory(athleteId, 30),
    ]);
    // Best-effort bookkeeping; never fail the view because of it.
    void shareLinkRepository.touch(link.id).catch(() => undefined);

    const now = new Date();
    const working = entries.filter((e) => e.setType !== "WARMUP");
    const setRows = working.map((e) => ({
      exerciseName: e.exercise?.name ?? "",
      date: e.date.toISOString(),
      reps: e.reps,
      weightKg: toNumber(e.weightKg),
      assisted: isAssistedExercise({ name: e.exercise?.name, equipment: e.exercise?.equipment }),
    }));
    const achievements = buildAchievements(derivePrEvents(entries), detectE1rmPrs(setRows));
    const assistedNames = new Set(setRows.filter((r) => r.assisted).map((r) => r.exerciseName));
    const rawProgressions = recentProgressions(setRows, now, 90, assistedNames);
    const progressions = toPublicProgressions(rawProgressions);
    const weightReadings = weights.map((w) => ({ date: w.date.toISOString(), value: toNumber(w.weightKg) }));
    const waist = measurements
      .filter((m) => /waist/i.test(m.type?.name ?? ""))
      .map((m) => ({ date: m.date.toISOString(), value: toNumber(m.value) * (m.unit === "INCH" ? 2.54 : 1) }));
    const last7 = readiness.slice(-7).map((r) => r.score);
    const summary = composeSummary(
      buildInsightSnapshot({
        now,
        windowDays: 90,
        weights: weightReadings,
        waist,
        workouts: analytics.totals.workouts,
        workoutsPerWeek: analytics.totals.workoutsPerWeek,
        prCount: achievements.filter((a) => new Date(a.date).getTime() >= now.getTime() - 90 * 86_400_000).length,
        consistencyPct: analytics.consistency.pct,
        adherencePct: analytics.adherence?.pct ?? null,
        avgSessionRpe: null,
        e1rm: analytics.e1rmTrends.map((t) => ({ name: t.name, changePct: t.changePct })),
        progressions: rawProgressions,
        // Nutrition and notes are private to the athlete and never shared.
        nutrition: [],
        goals: goals
          .filter((g) => g.status === "ACTIVE")
          .map((g) => ({
            title: g.title,
            pct: g.progress.pct,
            achieved: g.progress.achieved,
            type: g.type,
            targetIsLowerThanStart: g.progress.start !== null && g.progress.target < g.progress.start,
          })),
        readinessAvg7d: last7.length ? Math.round(last7.reduce((a, b) => a + b, 0) / last7.length) : null,
        noteCount: 0,
      })
    );

    return {
      weights: weights.map((w) => ({ date: w.date.toISOString(), weightKg: toNumber(w.weightKg) })),
      measurements: measurements.map((m) => ({
        typeName: m.type?.name ?? "",
        unit: m.unit,
        date: m.date.toISOString(),
        value: toNumber(m.value),
      })),
      records: derivePersonalRecords(entries).map((r) => ({
        exerciseName: r.exerciseName,
        assisted: r.assisted,
        maxWeightKg: r.maxWeightKg,
        maxWeightReps: r.maxWeightReps,
        maxReps: r.maxReps,
        maxRepsWeightKg: r.maxRepsWeightKg,
        estimatedOneRepMaxKg: r.estimatedOneRepMaxKg,
        lastPerformed: r.lastPerformed,
      })),
      achievements: achievements.slice(0, 30),
      prCounts: countByKind(achievements),
      progressions,
      recentSets: setRows
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12),
      goals: goals
        .filter((g) => g.status === "ACTIVE")
        .map((g) => ({
          title: g.title,
          type: g.type,
          pct: g.progress.pct,
          current: g.progress.current,
          target: g.progress.target,
          unit: g.unit,
          achieved: g.progress.achieved,
        })),
      workouts: workouts
        .filter((w) => w.status === "COMPLETED")
        .map((w) => ({
          date: w.date,
          name: w.name,
          durationMin: w.durationMin,
          sets: w.sets,
          volumeKg: w.volumeKg,
          exercises: w.exercises.slice(0, 6),
        })),
      training: {
        workouts: analytics.totals.workouts,
        workoutsPerWeek: analytics.totals.workoutsPerWeek,
        consistencyPct: analytics.consistency.pct,
        adherencePct: analytics.adherence?.pct ?? null,
        weeklyVolume: analytics.buckets.map((b) => ({ label: b.label, volumeKg: b.volumeKg })),
        weeklyWorkouts: analytics.buckets.map((b) => ({ label: b.label, workouts: b.workouts })),
        e1rm: analytics.e1rmTrends.map((t) => ({ name: t.name, changePct: t.changePct, points: t.points })),
      },
      readiness,
      observations: {
        bullets: summary.bullets.filter((b) => !b.startsWith("Not enough data")),
        conclusion: summary.conclusion ? forCoach(summary.conclusion, PATIENT_LABEL) : null,
      },
      expiresAt: isNeverExpiring(link.expiresAt) ? null : link.expiresAt.toISOString(),
    };
  },
};
