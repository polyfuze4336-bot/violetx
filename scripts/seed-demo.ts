// Prototype demo seed CLI. See docs/DEMO-MODE.md.
//
//   ALLOW_DEMO_SEED=true npm run seed:demo               create / refresh the demo account
//   npm run seed:demo -- --dry-run                       build and summarise only (no database)
//   ALLOW_DEMO_SEED=true npm run seed:demo -- --remove   delete the demo account and its data
//
// PROTOTYPE ONLY. It refuses to run unless ALLOW_DEMO_SEED=true, is never part
// of build or deploy, only touches the demo user's own athlete, and is
// idempotent (it rebuilds the demo rows, so running twice creates no duplicates).

import { PrismaClient } from "@prisma/client";

import { buildDemoDataset } from "../src/lib/demo-data";
import { DEMO_ATHLETE_ID, DEMO_USER_ID, removeDemo, seedDemo } from "../src/lib/demo-seed";

const args = new Set(process.argv.slice(2));

function describeTarget(): string {
  try {
    const u = new URL((process.env.DATABASE_URL ?? "").replace(/^sqlserver:\/\//, "http://").split(";")[0]);
    return u.host || "(unknown host)";
  } catch {
    return "(unparsed DATABASE_URL)";
  }
}

function print(data: object) {
  for (const [k, v] of Object.entries(data)) if (Array.isArray(v)) console.log(`  ${k.padEnd(18)} ${v.length}`);
}

async function main() {
  if (args.has("--dry-run")) {
    console.log("Dry run (no database access). Dataset:");
    print(buildDemoDataset({ athleteId: DEMO_ATHLETE_ID, userId: DEMO_USER_ID, branches: [], today: new Date() }));
    return;
  }
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("Refusing to run: demo seeding must be enabled explicitly.\nSet ALLOW_DEMO_SEED=true (prototype/demo environments only).");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  console.log(`Target database host: ${describeTarget()}`);
  const db = new PrismaClient();
  try {
    if (args.has("--remove")) {
      console.log((await removeDemo(db)) ? "Demo account and data removed." : "No demo account found.");
      return;
    }
    const data = await seedDemo(db);
    console.log("Demo account ready (username: demo). Records:");
    print(data);
    if (data.gymVisits.length === 0) console.log("Note: no gym branches in this database, so Gym Journey has no visits.");
    console.log("Turn the demo login on with DEMO_MODE_ENABLED=true on the app.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
