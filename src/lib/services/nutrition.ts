import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/rbac";
import {
  requireOwnerAthlete,
  requireViewerAthlete,
} from "@/lib/services/context";
import { toNumber } from "@/lib/dto";
import {
  createNutritionSchema,
  nutritionTargetsSchema,
  type CreateNutritionInput,
  type NutritionTargetsInput,
} from "@/lib/schemas";
import type { NutritionTargets } from "@/lib/nutrition-intel";

export interface NutritionEntryDTO {
  id: string;
  entryDate: string;
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fibre: number | null;
  water: number | null;
  notes: string | null;
}

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : toNumber(v as number);
}

export const nutritionService = {
  async getTargets(): Promise<NutritionTargets> {
    const { athleteId } = await requireViewerAthlete();
    const a = await prisma.athlete.findUnique({
      where: { id: athleteId },
      select: { calorieTarget: true, proteinTarget: true, carbTarget: true, fatTarget: true, waterTargetL: true },
    });
    return {
      calories: a?.calorieTarget ?? null,
      protein: a?.proteinTarget ?? null,
      carbohydrates: a?.carbTarget ?? null,
      fat: a?.fatTarget ?? null,
      waterL: num(a?.waterTargetL),
    };
  },

  async setTargets(input: NutritionTargetsInput): Promise<NutritionTargets> {
    const { athleteId } = await requireOwnerAthlete();
    const data = nutritionTargetsSchema.parse(input);
    await prisma.athlete.update({
      where: { id: athleteId },
      data: {
        calorieTarget: data.calories ?? null,
        proteinTarget: data.protein ?? null,
        carbTarget: data.carbohydrates ?? null,
        fatTarget: data.fat ?? null,
        waterTargetL: data.waterL ?? null,
      },
    });
    return nutritionService.getTargets();
  },

  async list(): Promise<NutritionEntryDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const rows = await prisma.nutritionEntry.findMany({
      where: { athleteId },
      orderBy: { entryDate: "desc" },
      take: 60,
    });
    return rows.map((e) => ({
      id: e.id,
      entryDate: e.entryDate.toISOString(),
      calories: e.calories ?? null,
      protein: num(e.protein),
      carbohydrates: num(e.carbohydrates),
      fat: num(e.fat),
      fibre: num(e.fibre),
      water: num(e.water),
      notes: e.notes,
    }));
  },

  async create(input: CreateNutritionInput): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = createNutritionSchema.parse(input);
    await prisma.nutritionEntry.create({
      data: {
        athleteId,
        entryDate: data.entryDate,
        calories: data.calories ?? null,
        protein: data.protein ?? null,
        carbohydrates: data.carbohydrates ?? null,
        fat: data.fat ?? null,
        fibre: data.fibre ?? null,
        water: data.water ?? null,
        notes: data.notes ?? null,
        source: "MANUAL",
      },
    });
  },

  async delete(id: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const result = await prisma.nutritionEntry.deleteMany({
      where: { id, athleteId },
    });
    if (result.count === 0) throw new NotFoundError("Nutrition entry not found.");
  },
};
