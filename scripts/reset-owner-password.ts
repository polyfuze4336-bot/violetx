// Resets the password of the single OWNER account (and clears any lockout).
// Reads OWNER_PASSWORD from the environment; never prints it.
// Run with: npx tsx scripts/reset-owner-password.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = process.env.OWNER_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("OWNER_PASSWORD must be set (min 12 characters).");
  }
  const owners = await prisma.user.findMany({
    where: { role: "OWNER" },
    select: { id: true, email: true },
  });
  if (owners.length !== 1) {
    throw new Error(`Expected exactly one OWNER, found ${owners.length}.`);
  }
  await prisma.user.update({
    where: { id: owners[0].id },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      active: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  console.log(`OWNER_EMAIL=${owners[0].email}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
