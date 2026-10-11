// Create an additional OWNER login with its own private athlete.
//
//   ALLOW_CREATE_USER=true NEW_USER_EMAIL=... NEW_USER_PASSWORD=... npx tsx scripts/create-owner-account.ts
//
// Refuses to run unless ALLOW_CREATE_USER=true, never modifies an existing
// account, and never prints the password. Used by the create-user workflow.

import { PrismaClient } from "@prisma/client";

import { createOwnerAccount } from "../src/lib/account-provisioning";

async function main() {
  if (process.env.ALLOW_CREATE_USER !== "true") {
    console.error("Refusing to run: set ALLOW_CREATE_USER=true.");
    process.exit(1);
  }
  const email = process.env.NEW_USER_EMAIL ?? "";
  const password = process.env.NEW_USER_PASSWORD ?? "";
  if (!process.env.DATABASE_URL || !email || !password) {
    console.error("DATABASE_URL, NEW_USER_EMAIL and NEW_USER_PASSWORD are required.");
    process.exit(1);
  }
  const db = new PrismaClient();
  try {
    const r = await createOwnerAccount(db, { email, password });
    console.log(r.created ? `Account created for ${email.toLowerCase()} (own private athlete).` : `An account for ${email.toLowerCase()} already exists. Nothing was changed.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
