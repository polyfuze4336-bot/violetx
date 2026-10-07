// Reports whether an OWNER account already exists. Used by the bootstrap-owner
// workflow so the owner is only created when none exists (never overwrites).
// Prints OWNER_EXISTS or NO_OWNER. Run with: npx tsx scripts/has-owner.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const owners = await prisma.user.count({ where: { role: "OWNER" } });
  console.log(owners > 0 ? "OWNER_EXISTS" : "NO_OWNER");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
