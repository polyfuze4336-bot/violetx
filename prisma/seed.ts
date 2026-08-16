import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "athlete@example.com";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "VioletX-Dev-Pass1";
const COACH_EMAIL = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

// Sample data is only inserted outside production and only when the athlete has
// no records yet — never overwrite or pollute real data.
const SEED_SAMPLE =
  process.env.NODE_ENV !== "production" ||
  process.env.SEED_SAMPLE_DATA === "true";

const DEFAULT_MEASUREMENT_TYPES: { name: string; defaultUnit: string }[] = [
  { name: "Waist", defaultUnit: "INCH" },
  { name: "Hip", defaultUnit: "INCH" },
  { name: "Chest", defaultUnit: "INCH" },
  { name: "Thigh", defaultUnit: "INCH" },
  { name: "Upper arm", defaultUnit: "INCH" },
];

const DEFAULT_EXERCISES: {
  name: string;
  category: string;
  muscleGroup: string;
  equipment: string;
}[] = [
  { name: "Hip Abduction", category: "Glutes", muscleGroup: "Abductors", equipment: "Machine" },
  { name: "Hip Adduction", category: "Legs", muscleGroup: "Adductors", equipment: "Machine" },
  { name: "Chest Press", category: "Chest", muscleGroup: "Pectorals", equipment: "Machine" },
  { name: "Shoulder Press", category: "Shoulders", muscleGroup: "Deltoids", equipment: "Machine" },
  { name: "Lat Pulldown", category: "Back", muscleGroup: "Lats", equipment: "Cable" },
  { name: "Seated Row", category: "Back", muscleGroup: "Upper back", equipment: "Cable" },
  { name: "Leg Press", category: "Legs", muscleGroup: "Quadriceps", equipment: "Machine" },
  { name: "Leg Extension", category: "Legs", muscleGroup: "Quadriceps", equipment: "Machine" },
  { name: "Leg Curl", category: "Legs", muscleGroup: "Hamstrings", equipment: "Machine" },
  { name: "Squat", category: "Legs", muscleGroup: "Quadriceps", equipment: "Barbell" },
  { name: "Deadlift", category: "Full Body", muscleGroup: "Posterior chain", equipment: "Barbell" },
  { name: "Bench Press", category: "Chest", muscleGroup: "Pectorals", equipment: "Barbell" },
  { name: "Bicep Curl", category: "Arms", muscleGroup: "Biceps", equipment: "Dumbbell" },
  { name: "Tricep Extension", category: "Arms", muscleGroup: "Triceps", equipment: "Cable" },
];

// Curated sample of Anytime Fitness Malaysia branches (locally controlled
// dataset; replace via a branch sync mechanism). Coordinates are approximate.
const GYM_BRANCHES: {
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}[] = [
  { name: "Anytime Fitness KLCC", city: "Kuala Lumpur", state: "Kuala Lumpur", latitude: 3.1578, longitude: 101.7117 },
  { name: "Anytime Fitness Bangsar", city: "Kuala Lumpur", state: "Kuala Lumpur", latitude: 3.1289, longitude: 101.6789 },
  { name: "Anytime Fitness Mont Kiara", city: "Kuala Lumpur", state: "Kuala Lumpur", latitude: 3.1725, longitude: 101.6509 },
  { name: "Anytime Fitness Cheras", city: "Kuala Lumpur", state: "Kuala Lumpur", latitude: 3.1045, longitude: 101.744 },
  { name: "Anytime Fitness Setapak", city: "Kuala Lumpur", state: "Kuala Lumpur", latitude: 3.2015, longitude: 101.7256 },
  { name: "Anytime Fitness Petaling Jaya", city: "Petaling Jaya", state: "Selangor", latitude: 3.1073, longitude: 101.6068 },
  { name: "Anytime Fitness Subang Jaya", city: "Subang Jaya", state: "Selangor", latitude: 3.0567, longitude: 101.5851 },
  { name: "Anytime Fitness Shah Alam", city: "Shah Alam", state: "Selangor", latitude: 3.0733, longitude: 101.5185 },
  { name: "Anytime Fitness Puchong", city: "Puchong", state: "Selangor", latitude: 3.0169, longitude: 101.6167 },
  { name: "Anytime Fitness Kajang", city: "Kajang", state: "Selangor", latitude: 2.9931, longitude: 101.7871 },
  { name: "Anytime Fitness Klang", city: "Klang", state: "Selangor", latitude: 3.0449, longitude: 101.4455 },
  { name: "Anytime Fitness George Town", city: "George Town", state: "Penang", latitude: 5.4141, longitude: 100.3288 },
  { name: "Anytime Fitness Bayan Lepas", city: "Bayan Lepas", state: "Penang", latitude: 5.2945, longitude: 100.2779 },
  { name: "Anytime Fitness Butterworth", city: "Butterworth", state: "Penang", latitude: 5.3991, longitude: 100.3638 },
  { name: "Anytime Fitness Johor Bahru City", city: "Johor Bahru", state: "Johor", latitude: 1.4655, longitude: 103.7578 },
  { name: "Anytime Fitness Skudai", city: "Skudai", state: "Johor", latitude: 1.5353, longitude: 103.6591 },
  { name: "Anytime Fitness Bukit Indah", city: "Iskandar Puteri", state: "Johor", latitude: 1.4738, longitude: 103.6584 },
  { name: "Anytime Fitness Ipoh", city: "Ipoh", state: "Perak", latitude: 4.5975, longitude: 101.0901 },
  { name: "Anytime Fitness Melaka Raya", city: "Malacca City", state: "Melaka", latitude: 2.1896, longitude: 102.2501 },
  { name: "Anytime Fitness Seremban", city: "Seremban", state: "Negeri Sembilan", latitude: 2.7297, longitude: 101.9381 },
  { name: "Anytime Fitness Kota Kinabalu", city: "Kota Kinabalu", state: "Sabah", latitude: 5.9804, longitude: 116.0735 },
  { name: "Anytime Fitness Kuching", city: "Kuching", state: "Sarawak", latitude: 1.5533, longitude: 110.3592 },
  { name: "Anytime Fitness Miri", city: "Miri", state: "Sarawak", latitude: 4.3999, longitude: 113.9914 },
  { name: "Anytime Fitness Alor Setar", city: "Alor Setar", state: "Kedah", latitude: 6.1264, longitude: 100.3673 },
  { name: "Anytime Fitness Kuantan", city: "Kuantan", state: "Pahang", latitude: 3.8168, longitude: 103.3256 },
  { name: "Anytime Fitness Kota Bharu", city: "Kota Bharu", state: "Kelantan", latitude: 6.1254, longitude: 102.2381 },
  { name: "Anytime Fitness Kuala Terengganu", city: "Kuala Terengganu", state: "Terengganu", latitude: 5.3296, longitude: 103.1370 },
  { name: "Anytime Fitness Putrajaya", city: "Putrajaya", state: "Putrajaya", latitude: 2.9264, longitude: 101.6964 },
];

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const DATES = [
  d("2026-06-01"),
  d("2026-06-15"),
  d("2026-07-03"),
  d("2026-07-20"),
  d("2026-08-16"),
];

// Body series (4 readings) aligned to dates [0, 1, 3, 4].
const BODY_DATES = [DATES[0], DATES[1], DATES[3], DATES[4]];
const WEIGHT_KG = [75.0, 74.8, 74.5, 74.2];
const MEASUREMENTS: Record<string, number[]> = {
  Waist: [41.7, 40.8, 39.5, 38.5],
  Hip: [39.4, 38.9, 38.5, 38.1],
  Chest: [38.2, 38.1, 38.0, 37.9],
  Thigh: [24.0, 23.7, 23.4, 23.2],
  "Upper arm": [13.0, 13.1, 13.2, 13.4],
};

// Strength progression (matches the design examples).
const STRENGTH: Record<
  string,
  { dates: Date[]; sets: { reps: number; weightKg: number }[] }
> = {
  "Hip Abduction": {
    dates: DATES,
    sets: [
      { reps: 8, weightKg: 43 },
      { reps: 12, weightKg: 43 },
      { reps: 10, weightKg: 45 },
      { reps: 8, weightKg: 47 },
      { reps: 9, weightKg: 50 },
    ],
  },
  "Hip Adduction": {
    dates: [DATES[0], DATES[2], DATES[4]],
    sets: [
      { reps: 10, weightKg: 36 },
      { reps: 10, weightKg: 39 },
      { reps: 8, weightKg: 43 },
    ],
  },
  "Chest Press": {
    dates: [DATES[0], DATES[2], DATES[4]],
    sets: [
      { reps: 10, weightKg: 40 },
      { reps: 10, weightKg: 42 },
      { reps: 10, weightKg: 45 },
    ],
  },
  "Lat Pulldown": {
    dates: [DATES[0], DATES[2], DATES[4]],
    sets: [
      { reps: 8, weightKg: 45 },
      { reps: 8, weightKg: 47 },
      { reps: 8, weightKg: 50 },
    ],
  },
};

async function main() {
  const ownerPasswordHash = await bcrypt.hash(OWNER_PASSWORD, 12);
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { role: "OWNER", passwordHash: ownerPasswordHash, active: true },
    create: {
      email: OWNER_EMAIL,
      name: "Patient X",
      role: "OWNER",
      passwordHash: ownerPasswordHash,
    },
  });

  if (COACH_EMAIL && COACH_PASSWORD) {
    const coachPasswordHash = await bcrypt.hash(COACH_PASSWORD, 12);
    await prisma.user.upsert({
      where: { email: COACH_EMAIL.toLowerCase() },
      update: { role: "COACH", passwordHash: coachPasswordHash, active: true },
      create: {
        email: COACH_EMAIL.toLowerCase(),
        name: "Coach",
        role: "COACH",
        passwordHash: coachPasswordHash,
      },
    });
  }

  const athlete = await prisma.athlete.upsert({
    where: { ownerUserId: owner.id },
    update: {},
    create: {
      ownerUserId: owner.id,
      displayName: "Patient X",
      defaultWeightUnit: "KG",
      defaultMeasurementUnit: "INCH",
    },
  });

  for (const type of DEFAULT_MEASUREMENT_TYPES) {
    await prisma.measurementType.upsert({
      where: { athleteId_name: { athleteId: athlete.id, name: type.name } },
      update: {},
      create: {
        athleteId: athlete.id,
        name: type.name,
        defaultUnit: type.defaultUnit,
      },
    });
  }

  for (const ex of DEFAULT_EXERCISES) {
    await prisma.exercise.upsert({
      where: { athleteId_name: { athleteId: athlete.id, name: ex.name } },
      update: {},
      create: {
        athleteId: athlete.id,
        name: ex.name,
        category: ex.category,
        muscleGroup: ex.muscleGroup,
        equipment: ex.equipment,
      },
    });
  }

  if (SEED_SAMPLE) {
    const existing = await prisma.bodyWeightEntry.count({
      where: { athleteId: athlete.id },
    });
    if (existing === 0) {
      await seedSampleData(athlete.id);
      console.log("Sample development data created.");
    } else {
      console.log("Sample data skipped (records already exist).");
    }
  }

  // Gym branches are reference data — seed once if the table is empty.
  if ((await prisma.gymBranch.count()) === 0) {
    await prisma.gymBranch.createMany({
      data: GYM_BRANCHES.map((g) => ({
        name: g.name,
        city: g.city,
        state: g.state,
        latitude: g.latitude,
        longitude: g.longitude,
        source: "seed-sample",
        sourceUpdatedAt: new Date(),
      })),
    });
    console.log(`Seeded ${GYM_BRANCHES.length} gym branches.`);
  }

  // Sample gym visits (dev only, when the athlete has none).
  if (
    SEED_SAMPLE &&
    (await prisma.gymVisit.count({ where: { athleteId: athlete.id } })) === 0
  ) {
    const someBranches = await prisma.gymBranch.findMany({
      take: 6,
      orderBy: { name: "asc" },
    });
    const visitDates = [
      "2026-06-05",
      "2026-06-20",
      "2026-07-05",
      "2026-07-18",
      "2026-08-02",
      "2026-08-16",
    ];
    await prisma.gymVisit.createMany({
      data: someBranches.map((b, i) => ({
        athleteId: athlete.id,
        gymBranchId: b.id,
        visitedAt: d(visitDates[i] ?? "2026-08-16"),
        source: "MANUAL",
      })),
    });
    console.log("Seeded sample gym visits.");
  }

  console.log(
    `Seed complete. Owner: ${owner.email}, Athlete: ${athlete.displayName} (${athlete.id})`
  );
}

async function seedSampleData(athleteId: string) {
  await prisma.bodyWeightEntry.createMany({
    data: WEIGHT_KG.map((weightKg, i) => ({
      athleteId,
      date: BODY_DATES[i],
      weightKg,
      source: "MANUAL",
    })),
  });

  const types = await prisma.measurementType.findMany({ where: { athleteId } });
  const typeByName = new Map(types.map((t) => [t.name, t]));
  for (const [name, values] of Object.entries(MEASUREMENTS)) {
    const type = typeByName.get(name);
    if (!type) continue;
    await prisma.measurementEntry.createMany({
      data: values.map((value, i) => ({
        athleteId,
        typeId: type.id,
        date: BODY_DATES[i],
        value,
        unit: type.defaultUnit,
        source: "MANUAL",
      })),
    });
  }

  const exercises = await prisma.exercise.findMany({ where: { athleteId } });
  const exByName = new Map(exercises.map((e) => [e.name, e]));
  for (const [name, plan] of Object.entries(STRENGTH)) {
    const ex = exByName.get(name);
    if (!ex) continue;
    await prisma.exerciseEntry.createMany({
      data: plan.sets.map((s, i) => ({
        athleteId,
        exerciseId: ex.id,
        date: plan.dates[i],
        reps: s.reps,
        weightKg: s.weightKg,
        position: 0,
        source: "MANUAL",
      })),
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
