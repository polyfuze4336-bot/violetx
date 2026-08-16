import { describe, expect, it } from "vitest";

import { canWrite, isRole, resolveRole, ROLES } from "@/lib/rbac";

describe("resolveRole", () => {
  it("returns OWNER for the configured owner email (case-insensitive)", () => {
    expect(resolveRole("athlete@example.com", "athlete@example.com")).toBe(
      ROLES.OWNER
    );
    expect(resolveRole("Athlete@Example.com", "athlete@example.com")).toBe(
      ROLES.OWNER
    );
    expect(resolveRole("  athlete@example.com  ", "athlete@example.com")).toBe(
      ROLES.OWNER
    );
  });

  it("returns COACH for any other email", () => {
    expect(resolveRole("coach@example.com", "athlete@example.com")).toBe(
      ROLES.COACH
    );
  });

  it("defaults to COACH when email or owner email is missing", () => {
    expect(resolveRole(null, "athlete@example.com")).toBe(ROLES.COACH);
    expect(resolveRole("coach@example.com", null)).toBe(ROLES.COACH);
    expect(resolveRole(undefined, undefined)).toBe(ROLES.COACH);
  });
});

describe("canWrite", () => {
  it("allows only OWNER to write", () => {
    expect(canWrite(ROLES.OWNER)).toBe(true);
    expect(canWrite(ROLES.COACH)).toBe(false);
    expect(canWrite(null)).toBe(false);
    expect(canWrite(undefined)).toBe(false);
  });
});

describe("isRole", () => {
  it("validates known roles", () => {
    expect(isRole("OWNER")).toBe(true);
    expect(isRole("COACH")).toBe(true);
    expect(isRole("ADMIN")).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});
