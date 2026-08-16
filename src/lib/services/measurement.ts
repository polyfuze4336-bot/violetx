import {
  measurementEntryRepository,
  measurementTypeRepository,
} from "@/lib/repositories/measurement";
import { AuthorizationError, NotFoundError } from "@/lib/rbac";
import {
  requireOwnerAthlete,
  requireViewerAthlete,
} from "@/lib/services/context";
import {
  createMeasurementEntrySchema,
  createMeasurementTypeSchema,
  updateMeasurementEntrySchema,
  updateMeasurementTypeSchema,
  type CreateMeasurementEntryInput,
  type CreateMeasurementTypeInput,
  type UpdateMeasurementEntryInput,
  type UpdateMeasurementTypeInput,
} from "@/lib/schemas";
import {
  toMeasurementEntryDTO,
  toMeasurementTypeDTO,
  type MeasurementEntryDTO,
  type MeasurementTypeDTO,
} from "@/lib/dto";

export const measurementService = {
  // --- Measurement types (owner-managed) ---
  async listTypes(): Promise<MeasurementTypeDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const rows = await measurementTypeRepository.list(athleteId);
    return rows.map(toMeasurementTypeDTO);
  },

  async createType(
    input: CreateMeasurementTypeInput
  ): Promise<MeasurementTypeDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = createMeasurementTypeSchema.parse(input);
    const existing = await measurementTypeRepository.findByName(
      athleteId,
      data.name
    );
    if (existing) {
      throw new AuthorizationError(
        `A measurement called "${data.name}" already exists.`
      );
    }
    const created = await measurementTypeRepository.create({
      athleteId,
      name: data.name,
      defaultUnit: data.defaultUnit,
    });
    return toMeasurementTypeDTO(created);
  },

  async updateType(input: UpdateMeasurementTypeInput): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = updateMeasurementTypeSchema.parse(input);
    const count = await measurementTypeRepository.update(athleteId, data.id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.defaultUnit !== undefined
        ? { defaultUnit: data.defaultUnit }
        : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    });
    if (count === 0) throw new NotFoundError("Measurement type not found.");
  },

  async deleteType(id: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const entryCount = await measurementTypeRepository.countEntries(
      athleteId,
      id
    );
    if (entryCount > 0) {
      throw new AuthorizationError(
        "Cannot delete a measurement that still has readings. Delete its readings first."
      );
    }
    const count = await measurementTypeRepository.delete(athleteId, id);
    if (count === 0) throw new NotFoundError("Measurement type not found.");
  },

  // --- Measurement entries ---
  async listEntries(typeId?: string): Promise<MeasurementEntryDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const rows = await measurementEntryRepository.list(athleteId, typeId);
    return rows.map(toMeasurementEntryDTO);
  },

  async createEntry(
    input: CreateMeasurementEntryInput
  ): Promise<MeasurementEntryDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = createMeasurementEntrySchema.parse(input);
    const type = await measurementTypeRepository.getById(
      athleteId,
      data.typeId
    );
    if (!type) throw new NotFoundError("Measurement type not found.");
    const created = await measurementEntryRepository.create({
      athleteId,
      typeId: data.typeId,
      date: data.date,
      value: data.value,
      unit: data.unit,
      note: data.note ?? null,
      source: "MANUAL",
    });
    return toMeasurementEntryDTO({ ...created, type });
  },

  async updateEntry(input: UpdateMeasurementEntryInput): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = updateMeasurementEntrySchema.parse(input);
    const count = await measurementEntryRepository.update(athleteId, data.id, {
      ...(data.typeId !== undefined ? { typeId: data.typeId } : {}),
      ...(data.date !== undefined ? { date: data.date } : {}),
      ...(data.value !== undefined ? { value: data.value } : {}),
      ...(data.unit !== undefined ? { unit: data.unit } : {}),
      ...(data.note !== undefined ? { note: data.note ?? null } : {}),
    });
    if (count === 0) throw new NotFoundError("Measurement reading not found.");
  },

  async deleteEntry(id: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const count = await measurementEntryRepository.delete(athleteId, id);
    if (count === 0) throw new NotFoundError("Measurement reading not found.");
  },
};
