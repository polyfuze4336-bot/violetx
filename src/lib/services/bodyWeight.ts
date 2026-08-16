import { bodyWeightRepository } from "@/lib/repositories/bodyWeight";
import { NotFoundError } from "@/lib/rbac";
import {
  requireOwnerAthlete,
  requireViewerAthlete,
} from "@/lib/services/context";
import {
  createBodyWeightSchema,
  updateBodyWeightSchema,
  type CreateBodyWeightInput,
  type UpdateBodyWeightInput,
} from "@/lib/schemas";
import { toBodyWeightDTO, type BodyWeightDTO } from "@/lib/dto";

export const bodyWeightService = {
  async list(): Promise<BodyWeightDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const rows = await bodyWeightRepository.list(athleteId);
    return rows.map(toBodyWeightDTO);
  },

  async latest(): Promise<BodyWeightDTO | null> {
    const { athleteId } = await requireViewerAthlete();
    const row = await bodyWeightRepository.latest(athleteId);
    return row ? toBodyWeightDTO(row) : null;
  },

  async create(input: CreateBodyWeightInput): Promise<BodyWeightDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = createBodyWeightSchema.parse(input);
    const created = await bodyWeightRepository.create({
      athleteId,
      date: data.date,
      weightKg: data.weightKg,
      note: data.note ?? null,
      source: "MANUAL",
    });
    return toBodyWeightDTO(created);
  },

  async update(input: UpdateBodyWeightInput): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = updateBodyWeightSchema.parse(input);
    const count = await bodyWeightRepository.update(athleteId, data.id, {
      ...(data.date !== undefined ? { date: data.date } : {}),
      ...(data.weightKg !== undefined ? { weightKg: data.weightKg } : {}),
      ...(data.note !== undefined ? { note: data.note ?? null } : {}),
    });
    if (count === 0) throw new NotFoundError("Body weight entry not found.");
  },

  async delete(id: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const count = await bodyWeightRepository.delete(athleteId, id);
    if (count === 0) throw new NotFoundError("Body weight entry not found.");
  },
};
