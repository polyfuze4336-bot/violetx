import { PrismaClient } from "@prisma/client";

// Azure SQL serverless pauses when idle; the first connection after a pause
// fails with P1001 while it resumes. Retry those (the statement never ran, so
// retrying is safe) instead of surfacing "something went wrong".
const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000];
// Never reached the server (cannot connect / connection reset during the TLS
// handshake): the statement cannot have run, so any operation may be retried.
const NOT_REACHED_CODES = new Set(["P1001", "P1002", "P1011"]);
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

/**
 * Connection string tuning for Azure SQL serverless: give a resuming database
 * time to answer, and keep the pool large enough (Prisma's default is only
 * 2 x CPUs + 1 = 3 on this plan) that a few slow connections cannot starve
 * every request into "Timed out fetching a new connection from the pool".
 */
export function tuneDatabaseUrl(connectionString: string | undefined): string | undefined {
  let url = connectionString;
  if (!url || !url.startsWith("sqlserver://")) return url;
  const add = (pattern: RegExp, setting: string) => {
    if (!pattern.test(url as string)) url = `${(url as string).replace(/;?$/, ";")}${setting}`;
  };
  add(/(^|;)\s*(connectionTimeout|connectTimeout)\s*=/i, "connectionTimeout=60");
  add(/(^|;)\s*(connectionLimit|connection_limit)\s*=/i, "connectionLimit=10");
  add(/(^|;)\s*(poolTimeout|pool_timeout)\s*=/i, "poolTimeout=30");
  return url;
}

let lastPoolReset = 0;

function createClient() {
  const base = new PrismaClient({
    datasourceUrl: tuneDatabaseUrl(process.env.DATABASE_URL),
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
            // A pool that keeps timing out (e.g. connections dropped by a database that
            // was paused) is rebuilt; Prisma reconnects lazily on the next query.
            if (failureCode(error) === "P2024" && attempt >= 1 && Date.now() - lastPoolReset > 20_000) {
              lastPoolReset = Date.now();
              await base.$disconnect().catch(() => undefined);
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
