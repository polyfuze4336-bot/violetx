import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { getServerSession } from "next-auth";
import type { PrismaClient } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { createOwnerAccount, ProvisionError } from "@/lib/account-provisioning";
import { verifyPassword } from "@/lib/password";
import { AuthorizationError } from "@/lib/rbac";
import { userAdminService } from "@/lib/services/userAdmin";
import { personalRecordService } from "@/lib/services/personalRecord";

const session = vi.mocked(getServerSession);
let fake: FakePrisma;
const db = () => fake.client() as unknown as PrismaClient;
const rows = (t: string) => (fake.tables[t] ?? []) as Record<string, unknown>[];

const asUser = (id: string, email: string, athleteId: string) =>
  session.mockResolvedValue({ user: { id, email, role: "OWNER", athleteId }, expires: "2999-01-01T00:00:00.000Z" });

beforeEach(() => {
  fake = new FakePrisma(
    {
      user: [
        { id: "owner-1", email: "owner@example.com", role: "OWNER", name: "Patient X", active: true, passwordHash: "x" },
        { id: "coach-1", email: "coach@example.com", role: "COACH", name: "Coach", active: true, passwordHash: "x" },
      ],
      athlete: [{ id: "athlete-1", ownerUserId: "owner-1", displayName: "Patient X" }],
      exercise: [{ id: "ex-1", athleteId: "athlete-1", name: "Barbell Bench Press", active: true }],
      exerciseEntry: [
        { id: "e1", athleteId: "athlete-1", exerciseId: "ex-1", date: new Date("2026-08-01"), reps: 8, weightKg: 80, position: 0, setType: "WORK", source: "MANUAL" },
        { id: "e2", athleteId: "athlete-1", exerciseId: "ex-1", date: new Date("2026-08-08"), reps: 8, weightKg: 82.5, position: 0, setType: "WORK", source: "MANUAL" },
      ],
    },
    true
  );
  (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
  session.mockReset();
  process.env.OWNER_EMAIL = "owner@example.com";
});

describe("creating an additional owner account", () => {
  it("creates an OWNER with a hashed password and its own athlete", async () => {
    const r = await createOwnerAccount(db(), { email: "  Juanny_Johari@Yahoo.com ", password: "a-long-test-password" });
    expect(r.created).toBe(true);
    const user = rows("user").find((u) => u.email === "juanny_johari@yahoo.com")!;
    expect(user).toMatchObject({ role: "OWNER", name: "Patient X" });
    expect(user.passwordHash).not.toContain("a-long-test-password");
    expect(await verifyPassword("a-long-test-password", user.passwordHash as string)).toBe(true);
    const athlete = rows("athlete").find((a) => a.ownerUserId === user.id)!;
    expect(athlete).toMatchObject({ displayName: "Patient X" });
    expect(athlete.id).not.toBe("athlete-1");
  });

  it("never modifies an existing account (owner, coach or a repeat run)", async () => {
    const before = JSON.stringify(rows("user"));
    for (const email of ["owner@example.com", "coach@example.com"]) {
      expect(await createOwnerAccount(db(), { email, password: "a-long-test-password" })).toEqual({ created: false, reason: "EXISTS" });
    }
    expect(JSON.stringify(rows("user"))).toBe(before);
    await createOwnerAccount(db(), { email: "new@example.com", password: "a-long-test-password" });
    expect((await createOwnerAccount(db(), { email: "new@example.com", password: "another-long-password" })).created).toBe(false);
    expect(rows("user").filter((u) => u.email === "new@example.com")).toHaveLength(1);
  });

  it("rejects weak passwords and invalid emails", async () => {
    await expect(createOwnerAccount(db(), { email: "a@b.com", password: "short" })).rejects.toBeInstanceOf(ProvisionError);
    await expect(createOwnerAccount(db(), { email: "not-an-email", password: "a-long-test-password" })).rejects.toBeInstanceOf(ProvisionError);
    expect(rows("user")).toHaveLength(2);
  });

  it("the new owner can sign in and sees only their own (empty) athlete, not Patient X's data", async () => {
    await createOwnerAccount(db(), { email: "juanny_johari@yahoo.com", password: "a-long-test-password" });
    const credentials = authOptions.providers.find((p) => (p as { options?: { id?: string } }).options?.id === "credentials" || p.id === "credentials") as unknown as {
      options: { authorize: (c: Record<string, string>) => Promise<{ id: string; role: string; athleteId: string | null } | null> };
    };
    const bad = await credentials.options.authorize({ email: "juanny_johari@yahoo.com", password: "wrong-password-here" });
    expect(bad).toBeNull();
    const user = await credentials.options.authorize({ email: "juanny_johari@yahoo.com", password: "a-long-test-password" });
    expect(user).toMatchObject({ role: "OWNER" });
    expect(user!.athleteId).toBeTruthy();
    expect(user!.athleteId).not.toBe("athlete-1");

    // Reads are athlete-scoped: the new owner sees none of Patient X's records.
    asUser(user!.id, "juanny_johari@yahoo.com", user!.athleteId!);
    expect(await personalRecordService.list()).toEqual([]);
    expect(await personalRecordService.prEvents()).toEqual([]);
    // ...while Patient X still sees theirs.
    asUser("owner-1", "owner@example.com", "athlete-1");
    expect((await personalRecordService.list()).map((r) => r.exerciseName)).toEqual(["Barbell Bench Press"]);
  });
});

describe("coach management stays with the primary owner", () => {
  it("another owner cannot see, change or take over the primary owner's coach", async () => {
    await createOwnerAccount(db(), { email: "juanny_johari@yahoo.com", password: "a-long-test-password" });
    const before = JSON.stringify(rows("user"));

    asUser("owner-2", "juanny_johari@yahoo.com", "athlete-2");
    expect(await userAdminService.canManageCoach()).toBe(false);
    expect(await userAdminService.getCoach()).toBeNull(); // the coach's email is not revealed
    for (const email of ["coach@example.com", "owner@example.com", "someone@example.com"]) {
      await expect(userAdminService.setCoach({ email, password: "a-long-test-password" })).rejects.toBeInstanceOf(AuthorizationError);
    }
    expect(JSON.stringify(rows("user"))).toBe(before);
  });

  it("the primary owner still manages the coach, but can never demote an owner through it", async () => {
    asUser("owner-1", "Owner@Example.com", "athlete-1");
    expect(await userAdminService.canManageCoach()).toBe(true);
    expect(await userAdminService.getCoach()).toMatchObject({ email: "coach@example.com" });
    await userAdminService.setCoach({ email: "coach@example.com", password: "a-long-test-password" });
    await userAdminService.setCoach({ email: "newcoach@example.com", password: "a-long-test-password" });
    expect(rows("user").find((u) => u.email === "newcoach@example.com")).toMatchObject({ role: "COACH" });
    await expect(userAdminService.setCoach({ email: "owner@example.com", password: "a-long-test-password" })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rows("user").find((u) => u.email === "owner@example.com")).toMatchObject({ role: "OWNER" });
  });
});
