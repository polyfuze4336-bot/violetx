import { describe, expect, it, vi } from "vitest";

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    $extends() {
      return {};
    }
  },
}));

import { tuneDatabaseUrl } from "@/lib/db";

describe("tuneDatabaseUrl", () => {
  it("adds timeout and a larger pool to a bare SQL Server URL", () => {
    const url = tuneDatabaseUrl("sqlserver://h:1433;database=d;user=u;password=p;encrypt=true");
    expect(url).toContain("connectionTimeout=60");
    expect(url).toContain("connectionLimit=10");
    expect(url).toContain("poolTimeout=30");
  });

  it("respects explicit settings", () => {
    const url = tuneDatabaseUrl("sqlserver://h:1433;database=d;connectionLimit=4;poolTimeout=5;connectTimeout=9;");
    expect(url).toBe("sqlserver://h:1433;database=d;connectionLimit=4;poolTimeout=5;connectTimeout=9;");
  });

  it("leaves other providers and empty values alone", () => {
    expect(tuneDatabaseUrl("postgres://x")).toBe("postgres://x");
    expect(tuneDatabaseUrl(undefined)).toBeUndefined();
  });
});
