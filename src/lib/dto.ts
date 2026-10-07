import type {
  Athlete,
  BodyWeightEntry,
  Exercise,
  ExerciseEntry,
  MeasurementEntry,
  MeasurementType,
  Note,
  Prisma,
} from "@prisma/client";

import type { Unit } from "@/lib/schemas";

type Source = "MANUAL" | "WHATSAPP";

/** Convert a Prisma Decimal (or number) to a JS number. */
export function toNumber(
  value: Prisma.Decimal | number | null | undefined
): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function toNumberOrNull(
  value: Prisma.Decimal | number | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : value.toNumber();
}

function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

// DTO shapes ------------------------------------------------------------------

export interface BodyWeightDTO {
  id: string;
  date: string;
  weightKg: number;
  note: string | null;
  source: Source;
}

export interface MeasurementTypeDTO {
  id: string;
  name: string;
  defaultUnit: Unit;
  active: boolean;
}

export interface MeasurementEntryDTO {
  id: string;
  typeId: string;
  typeName: string;
  date: string;
  value: number;
  unit: Unit;
  note: string | null;
  source: Source;
}

export interface ExerciseDTO {
  id: string;
  name: string;
  category: string | null;
  muscleGroup: string | null;
  equipment: string | null;
  aliases: string | null;
  secondaryMuscles: string | null;
  movementPattern: string | null;
  instructions: string | null;
  tips: string | null;
  isCustom: boolean;
  active: boolean;
}

export interface ExerciseEntryDTO {
  id: string;
  exerciseId: string;
  exerciseName: string;
  date: string;
  reps: number;
  weightKg: number;
  sets: number | null;
  position: number;
  note: string | null;
  source: Source;
}

export interface NoteDTO {
  id: string;
  date: string;
  title: string | null;
  body: string;
}

export interface AthleteProfileDTO {
  id: string;
  displayName: string;
  heightCm: number | null;
  birthDate: string | null;
  sex: string | null;
  defaultWeightUnit: string;
  defaultMeasurementUnit: Unit;
  trustedAiImports: boolean;
}

// Mappers ---------------------------------------------------------------------

export function toBodyWeightDTO(e: BodyWeightEntry): BodyWeightDTO {
  return {
    id: e.id,
    date: e.date.toISOString(),
    weightKg: toNumber(e.weightKg),
    note: e.note,
    source: (e.source as Source) ?? "MANUAL",
  };
}

export function toMeasurementTypeDTO(t: MeasurementType): MeasurementTypeDTO {
  return {
    id: t.id,
    name: t.name,
    defaultUnit: (t.defaultUnit as Unit) ?? "CM",
    active: t.active,
  };
}

export function toMeasurementEntryDTO(
  e: MeasurementEntry & { type?: MeasurementType | null }
): MeasurementEntryDTO {
  return {
    id: e.id,
    typeId: e.typeId,
    typeName: e.type?.name ?? "",
    date: e.date.toISOString(),
    value: toNumber(e.value),
    unit: (e.unit as Unit) ?? "CM",
    note: e.note,
    source: (e.source as Source) ?? "MANUAL",
  };
}

export function toExerciseDTO(e: Exercise): ExerciseDTO {
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    muscleGroup: e.muscleGroup,
    equipment: e.equipment,
    aliases: e.aliases,
    secondaryMuscles: e.secondaryMuscles,
    movementPattern: e.movementPattern,
    instructions: e.instructions,
    tips: e.tips,
    isCustom: e.isCustom,
    active: e.active,
  };
}

export function toExerciseEntryDTO(
  e: ExerciseEntry & { exercise?: Exercise | null }
): ExerciseEntryDTO {
  return {
    id: e.id,
    exerciseId: e.exerciseId,
    exerciseName: e.exercise?.name ?? "",
    date: e.date.toISOString(),
    reps: e.reps,
    weightKg: toNumber(e.weightKg),
    sets: e.sets ?? null,
    position: e.position,
    note: e.note,
    source: (e.source as Source) ?? "MANUAL",
  };
}

export function toNoteDTO(n: Note): NoteDTO {
  return {
    id: n.id,
    date: n.date.toISOString(),
    title: n.title,
    body: n.body,
  };
}

export function toAthleteProfileDTO(a: Athlete): AthleteProfileDTO {
  return {
    id: a.id,
    displayName: a.displayName,
    heightCm: toNumberOrNull(a.heightCm),
    birthDate: toIso(a.birthDate),
    sex: a.sex,
    defaultWeightUnit: a.defaultWeightUnit ?? "KG",
    defaultMeasurementUnit: (a.defaultMeasurementUnit as Unit) ?? "CM",
    trustedAiImports: a.trustedAiImports ?? false,
  };
}
