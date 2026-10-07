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
    const [weights, measurements, entries] = await Promise.all([
      bodyWeightRepository.list(athleteId),
      measurementEntryRepository.list(athleteId),
      exerciseEntryRepository.list(athleteId),
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
      expiresAt: link.expiresAt.toISOString(),
    };
  },
};
