import { PrismaClient } from "@prisma/client";

// Azure SQL serverless pauses when idle; the first connection after a pause
// fails with P1001 while it resumes. Retry those (the statement never ran, so
// retrying is safe) instead of surfacing "something went wrong".
const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000];
const NOT_REACHED_CODES = new Set(["P1001", "P1002"]);

function isDatabaseUnreachable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && NOT_REACHED_CODES.has(code);
}

/** Give a resuming serverless database time to answer (seconds). */
function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("sqlserver://")) return url;
  if (/(^|;)\s*(connectionTimeout|connectTimeout)\s*=/i.test(url)) return url;
  return `${url.replace(/;?$/, ";")}connectionTimeout=60`;
}

function createClient() {
  const base = new PrismaClient({
    datasourceUrl: databaseUrl(),
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
  return base.$extends({
    query: {
      $allOperations: async ({ args, query }) => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            if (attempt >= RETRY_DELAYS_MS.length || !isDatabaseUnreachable(error)) {
              throw error;
            }
            await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          }
        }
      },
    },
  });
}

// Reuse a single client across hot reloads in development to avoid
// exhausting database connections.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
