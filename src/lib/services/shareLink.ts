import { bodyWeightRepository } from "@/lib/repositories/bodyWeight";
import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { measurementEntryRepository } from "@/lib/repositories/measurement";
import { shareLinkRepository } from "@/lib/repositories/shareLink";
import { requireOwnerAthlete } from "@/lib/services/context";
import {
  derivePersonalRecords,
  derivePrEvents,
  type PersonalRecordDTO,
  type PrEventDTO,
} from "@/lib/services/personalRecord";
import {
  toBodyWeightDTO,
  toExerciseEntryDTO,
  toMeasurementEntryDTO,
  type BodyWeightDTO,
  type ExerciseEntryDTO,
  type MeasurementEntryDTO,
} from "@/lib/dto";
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
  isWellFormedShareToken,
  shareLinkStatus,
  type ShareLinkStatus,
} from "@/lib/share-link";

export interface ShareLinkDTO {
  id: string;
  label: string | null;
  status: ShareLinkStatus;
  expiresAt: string;
  createdAt: string;
  lastViewedAt: string | null;
}

export interface CreatedShareLinkDTO {
  link: ShareLinkDTO;
  /** Raw secret. Returned exactly once; only its hash is stored. */
  token: string;
}

export interface SharedProgressDTO {
  weights: BodyWeightDTO[];
  measurements: MeasurementEntryDTO[];
  records: PersonalRecordDTO[];
  prEvents: PrEventDTO[];
  recentSets: ExerciseEntryDTO[];
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
    e1rm: { name: string; changePct: number | null; points: { date: string; e1rm: number }[] }[];
  };
  /** Readiness scores only — never check-in notes or heart rate. */
  readiness: { date: string; score: number }[];
  expiresAt: string;
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
    expiresAt: row.expiresAt.toISOString(),
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
      listWorkoutsFor(athleteId, 8),
      computeAnalytics(athleteId, "3M"),
      readinessHistory(athleteId, 30),
    ]);
    // Best-effort bookkeeping; never fail the view because of it.
    void shareLinkRepository.touch(link.id).catch(() => undefined);

    return {
      weights: weights.map((w) => ({ ...toBodyWeightDTO(w), note: null })),
      measurements: measurements.map((m) => ({
        ...toMeasurementEntryDTO(m),
        note: null,
      })),
      records: derivePersonalRecords(entries),
      prEvents: derivePrEvents(entries),
      recentSets: entries
        .slice(0, 12)
        .map((e) => ({ ...toExerciseEntryDTO(e), note: null })),
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
        e1rm: analytics.e1rmTrends.map((t) => ({ name: t.name, changePct: t.changePct, points: t.points })),
      },
      readiness,
      expiresAt: link.expiresAt.toISOString(),
    };
  },
};
