import { athleteRepository } from "@/lib/repositories/note";
import { NotFoundError } from "@/lib/rbac";
import {
  requireOwnerAthlete,
  requireViewerAthlete,
} from "@/lib/services/context";
import {
  updateAthleteProfileSchema,
  type UpdateAthleteProfileInput,
} from "@/lib/schemas";
import { toAthleteProfileDTO, type AthleteProfileDTO } from "@/lib/dto";

export const athleteService = {
  async getProfile(): Promise<AthleteProfileDTO> {
    const { athleteId } = await requireViewerAthlete();
    const athlete = await athleteRepository.getById(athleteId);
    if (!athlete) throw new NotFoundError("Athlete not found.");
    return toAthleteProfileDTO(athlete);
  },

  async updateProfile(
    input: UpdateAthleteProfileInput
  ): Promise<AthleteProfileDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = updateAthleteProfileSchema.parse(input);
    const updated = await athleteRepository.update(athleteId, {
      ...(data.displayName !== undefined
        ? { displayName: data.displayName }
        : {}),
      ...(data.heightCm !== undefined ? { heightCm: data.heightCm } : {}),
      ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
      ...(data.sex !== undefined ? { sex: data.sex ?? null } : {}),
      ...(data.defaultMeasurementUnit !== undefined
        ? { defaultMeasurementUnit: data.defaultMeasurementUnit }
        : {}),
      ...(data.trustedAiImports !== undefined
        ? { trustedAiImports: data.trustedAiImports }
        : {}),
    });
    return toAthleteProfileDTO(updated);
  },
};
