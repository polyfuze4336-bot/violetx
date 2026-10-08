import { PrismaClient } from "@prisma/client";

// Azure SQL serverless pauses when idle; the first connection after a pause
// fails with P1001 while it resumes. Retry those (the statement never ran, so
// retrying is safe) instead of surfacing "something went wrong".
const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000];
// Never reached the server: the statement cannot have run, so any operation may be retried.
const NOT_REACHED_CODES = new Set(["P1001", "P1002"]);
// The connection dropped or timed out mid-flight (also common while the database
// wakes up). The statement MAY have run, so only read operations are retried.
const CONNECTION_LOST_CODES = new Set(["P1008", "P1017", "P2024"]);
const READ_OPERATIONS = new Set(["findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow", "count", "aggregate", "groupBy"]);

/**
 * Prisma reports connection-level failures as a known-request error (`code`) or
 * as an initialization error (`errorCode`, e.g. the very first query after the
 * database was paused), so both are checked.
 */
function failureCode(error: unknown): string | null {
  const e = error as { code?: unknown; errorCode?: unknown } | null;
  for (const c of [e?.code, e?.errorCode]) if (typeof c === "string") return c;
  return null;
}

function isDatabaseUnreachable(error: unknown, operation: string): boolean {
  const code = failureCode(error);
  if (code && NOT_REACHED_CODES.has(code)) return true;
  return Boolean(code && CONNECTION_LOST_CODES.has(code) && READ_OPERATIONS.has(operation));
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
      $allOperations: async ({ args, query, operation }) => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            if (attempt >= RETRY_DELAYS_MS.length || !isDatabaseUnreachable(error, operation)) {
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
