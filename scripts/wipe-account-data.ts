// Remove everything an OWNER account has recorded (keeps the login and profile).
//
//   ALLOW_WIPE=true TARGET_EMAIL=... DRY_RUN=true  npx tsx scripts/wipe-account-data.ts   (counts only)
//   ALLOW_WIPE=true TARGET_EMAIL=... DRY_RUN=false npx tsx scripts/wipe-account-data.ts   (deletes)
//
// Refuses to run unless ALLOW_WIPE=true, defaults to a dry run, only touches ONE
// OWNER account's athlete, and prints counts only (never the data itself).

import { PrismaClient } from "@prisma/client";

import { countAthleteData, resolveWipeTarget, wipeAthleteData } from "../src/lib/account-wipe";

const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

async function main() {
  if (process.env.ALLOW_WIPE !== "true") {
    console.error("Refusing to run: set ALLOW_WIPE=true.");
    process.exit(1);
  }
  const email = (process.env.TARGET_EMAIL ?? process.env.OWNER_EMAIL ?? "").trim();
  if (!process.env.DATABASE_URL || !email) {
    console.error("DATABASE_URL and TARGET_EMAIL (or OWNER_EMAIL) are required.");
    process.exit(1);
  }
  const dryRun = process.env.DRY_RUN !== "false";
  const reseed = process.env.RESEED_STARTER !== "false";
  const db = new PrismaClient();
  try {
    const target = await resolveWipeTarget(db, email);
    console.log(`${dryRun ? "DRY RUN" : "WIPING"} account ${mask(email.toLowerCase())}`);
    if (dryRun) {
      console.log("Rows that would be deleted:", JSON.stringify(await countAthleteData(db, target.athleteId), null, 2));
      console.log("Nothing was changed. Run again with dry_run=false to delete.");
      return;
    }
    const deleted = await wipeAthleteData(db, target.athleteId, { reseedStarter: reseed });
    console.log("Deleted:", JSON.stringify(deleted, null, 2));
    console.log("Remaining:", JSON.stringify(await countAthleteData(db, target.athleteId), null, 2));
    console.log(reseed ? "The canonical starter exercise library was restored." : "The exercise library was left empty.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
