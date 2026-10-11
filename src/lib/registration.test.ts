import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { getServerSession } from "next-auth";

import { changePasswordAction, registerAction } from "@/lib/actions/auth";
import { authOptions } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { AuthenticationError, AuthorizationError, ValidationError } from "@/lib/rbac";
import { changePasswordSchema, registerSchema } from "@/lib/schemas";
import { isRegistrationEnabled, registrationService } from "@/lib/services/registration";
import { personalRecordService } from "@/lib/services/personalRecord";
import { passwordResetService } from "@/lib/services/passwordReset";

const session = vi.mocked(getServerSession);
let fake: FakePrisma;
const rows = (t: string) => (fake.tables[t] ?? []) as Record<string, unknown>[];
const userRow = (email: string) => rows("user").find((u) => u.email === email)!;

const good = { email: "New.User@Example.com", password: "Sup3r-secret-pw", confirmPassword: "Sup3r-secret-pw" };

type Authorize = (c: Record<string, string>) => Promise<{ id: string; role: string; athleteId: string | null } | null>;
const authorize = (): Authorize =>
  (authOptions.providers.find((p) => p.id === "credentials") as unknown as { options: { authorize: Authorize } }).options.authorize;

beforeEach(() => {
  fake = new FakePrisma(
    {
      user: [{ id: "owner-1", email: "owner@example.com", role: "OWNER", name: "Patient X", active: true, passwordHash: "x", failedLoginAttempts: 0 }],
      athlete: [{ id: "athlete-1", ownerUserId: "owner-1", displayName: "Patient X" }],
      exercise: [{ id: "ex-1", athleteId: "athlete-1", name: "Barbell Bench Press", active: true }],
      exerciseEntry: [{ id: "e1", athleteId: "athlete-1", exerciseId: "ex-1", date: new Date("2026-08-01"), reps: 8, weightKg: 80, position: 0, setType: "WORK", source: "MANUAL" }],
    },
    true
  );
  (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
  session.mockReset();
  process.env.OWNER_EMAIL = "owner@example.com";
  delete process.env.REGISTRATION_ENABLED;
  process.env.DEMO_MODE_ENABLED = "true";
});

describe("registering with an email", () => {
  it("creates an account with its own private athlete and a hashed password", async () => {
    const r = await registrationService.register(good);
    expect(r.email).toBe("new.user@example.com");
    const u = userRow("new.user@example.com");
    expect(u).toMatchObject({ role: "OWNER", name: "Patient X", active: true });
    expect(u.passwordHash).not.toContain("Sup3r");
    expect(await verifyPassword("Sup3r-secret-pw", u.passwordHash as string)).toBe(true);
    const athlete = rows("athlete").find((a) => a.ownerUserId === u.id)!;
    expect(athlete).toBeTruthy();
    expect(athlete.id).not.toBe("athlete-1");
  });

  it("the new account can sign in, and sees none of another athlete's data", async () => {
    await registrationService.register(good);
    expect(await authorize()({ email: "new.user@example.com", password: "wrong-password-1" })).toBeNull();
    const user = await authorize()({ email: "NEW.user@example.com", password: "Sup3r-secret-pw" });
    expect(user).toMatchObject({ role: "OWNER" });
    expect(user!.athleteId).toBeTruthy();
    expect(user!.athleteId).not.toBe("athlete-1");
    session.mockResolvedValue({ user: { id: user!.id, email: "new.user@example.com", role: "OWNER", athleteId: user!.athleteId }, expires: "2999-01-01T00:00:00.000Z" });
    expect(await personalRecordService.list()).toEqual([]);
  });

  it("refuses an email that is already registered (any capitalisation)", async () => {
    await registrationService.register(good);
    await expect(registrationService.register({ ...good, email: "NEW.USER@example.COM" })).rejects.toBeInstanceOf(ValidationError);
    expect(rows("user").filter((u) => String(u.email).startsWith("new.user"))).toHaveLength(1);
  });

  it("cannot be used to take the primary owner's or the demo email", async () => {
    for (const email of ["owner@example.com", "Owner@Example.com", "demo@violetx.demo"]) {
      await expect(registrationService.register({ ...good, email })).rejects.toBeInstanceOf(ValidationError);
    }
    // Even if the primary owner's row did not exist, that address stays reserved.
    fake.tables.user = [];
    await expect(registrationService.register({ ...good, email: "owner@example.com" })).rejects.toBeInstanceOf(ValidationError);
    expect(rows("user")).toHaveLength(0);
  });

  it("validates the email and password", () => {
    expect(() => registerSchema.parse({ ...good, email: "not-an-email" })).toThrow();
    expect(() => registerSchema.parse({ ...good, password: "short1", confirmPassword: "short1" })).toThrow(/at least 10/);
    expect(() => registerSchema.parse({ ...good, password: "onlyletterspassword", confirmPassword: "onlyletterspassword" })).toThrow(/letter and one number/);
    expect(() => registerSchema.parse({ ...good, password: "1234567890", confirmPassword: "1234567890" })).toThrow();
    expect(() => registerSchema.parse({ ...good, confirmPassword: "different-1234" })).toThrow(/do not match/);
    expect(() => registerSchema.parse({ email: "a@b.com", password: "a@b.com1234", confirmPassword: "a@b.com1234" })).not.toThrow();
    expect(() => registerSchema.parse({ email: "a1234567890@b.com", password: "a1234567890@b.com", confirmPassword: "a1234567890@b.com" })).toThrow(/cannot be your email/);
  });

  it("the server action returns field errors and creates nothing for bad input", async () => {
    const res = await registerAction({ ...good, password: "short", confirmPassword: "short" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.password).toBeTruthy();
    expect(rows("user")).toHaveLength(1);
    const dup = await registerAction({ ...good, email: "owner@example.com" });
    expect(dup).toMatchObject({ ok: false, error: "That email cannot be used to register." });
  });

  it("the hidden honeypot field silently stops bots", async () => {
    const r = await registrationService.register({ ...good, website: "http://spam.example" });
    expect(r.email).toBe("new.user@example.com");
    expect(rows("user")).toHaveLength(1);
  });

  it("can be switched off, and has an hourly brake", async () => {
    process.env.REGISTRATION_ENABLED = "false";
    expect(isRegistrationEnabled()).toBe(false);
    await expect(registrationService.register(good)).rejects.toBeInstanceOf(AuthorizationError);
    delete process.env.REGISTRATION_ENABLED;
    expect(isRegistrationEnabled()).toBe(true);
    for (let i = 0; i < 30; i++) rows("user").push({ id: `u${i}`, email: `u${i}@x.com`, role: "OWNER", createdAt: new Date() });
    await expect(registrationService.register(good)).rejects.toThrow(/busy/);
  });
});

describe("changing your password", () => {
  const as = (id: string, email: string, role = "OWNER") =>
    session.mockResolvedValue({ user: { id, email, role, athleteId: "a" }, expires: "2999-01-01T00:00:00.000Z" });

  beforeEach(async () => {
    await registrationService.register(good);
    const u = userRow("new.user@example.com");
    as(u.id as string, "new.user@example.com");
  });

  const change = (over: Partial<{ currentPassword: string; newPassword: string; confirmPassword: string }> = {}) =>
    registrationService.changePassword({ currentPassword: "Sup3r-secret-pw", newPassword: "An0ther-good-pw", confirmPassword: "An0ther-good-pw", ...over });

  it("needs the current password; afterwards only the new one signs in", async () => {
    await change();
    expect(await authorize()({ email: "new.user@example.com", password: "Sup3r-secret-pw" })).toBeNull();
    expect(await authorize()({ email: "new.user@example.com", password: "An0ther-good-pw" })).toMatchObject({ role: "OWNER" });
  });

  it("refuses a wrong current password and changes nothing", async () => {
    const before = userRow("new.user@example.com").passwordHash;
    await expect(change({ currentPassword: "not-the-password1" })).rejects.toBeInstanceOf(ValidationError);
    expect(userRow("new.user@example.com").passwordHash).toBe(before);
    expect(userRow("new.user@example.com").failedLoginAttempts).toBe(1);
  });

  it("locks after repeated wrong guesses, like sign-in", async () => {
    for (let i = 0; i < 5; i++) await expect(change({ currentPassword: "wrong-password-9" })).rejects.toBeInstanceOf(ValidationError);
    await expect(change()).rejects.toThrow(/Too many attempts/);
    expect(await authorize()({ email: "new.user@example.com", password: "Sup3r-secret-pw" })).toBeNull(); // sign-in is locked too
  });

  it("validates the new password", () => {
    expect(() => changePasswordSchema.parse({ currentPassword: "x", newPassword: "short1", confirmPassword: "short1" })).toThrow();
    expect(() => changePasswordSchema.parse({ currentPassword: "x", newPassword: "An0ther-good-pw", confirmPassword: "nope-nope-nope1" })).toThrow(/do not match/);
    expect(() => changePasswordSchema.parse({ currentPassword: "Same-pass-123", newPassword: "Same-pass-123", confirmPassword: "Same-pass-123" })).toThrow();
  });

  it("clears the lock and cancels outstanding reset links", async () => {
    const u = userRow("new.user@example.com");
    await passwordResetService.requestReset("new.user@example.com").catch(() => undefined);
    rows("passwordResetToken").push({ id: "t1", userId: u.id, tokenHash: "h", expiresAt: new Date(Date.now() + 1e6), usedAt: null });
    u.failedLoginAttempts = 3;
    await change();
    expect(userRow("new.user@example.com").failedLoginAttempts).toBe(0);
    expect(rows("passwordResetToken").every((t) => t.usedAt)).toBe(true);
  });

  it("the shared demo account and signed-out visitors cannot change a password", async () => {
    const hash = await hashPassword("violetx-not-used");
    fake.tables.user.push({ id: "demo-user", email: "demo@violetx.demo", role: "DEMO_VIEWER", active: true, passwordHash: hash, failedLoginAttempts: 0 });
    as("demo-user", "demo@violetx.demo", "DEMO_VIEWER");
    await expect(change({ currentPassword: "violetx-not-used" })).rejects.toThrow("Demo mode is read only.");
    expect(userRow("demo@violetx.demo").passwordHash).toBe(hash);
    session.mockResolvedValue(null);
    await expect(change()).rejects.toBeInstanceOf(AuthenticationError);
    expect((await changePasswordAction({ currentPassword: "a", newPassword: "b", confirmPassword: "b" })).ok).toBe(false);
  });

  it("the action reports a wrong current password in plain words", async () => {
    const res = await changePasswordAction({ currentPassword: "nope-nope-1234", newPassword: "An0ther-good-pw", confirmPassword: "An0ther-good-pw" });
    expect(res).toMatchObject({ ok: false, error: "Your current password is not correct." });
  });
});

describe("password reset links", () => {
  it("an invalid link says so (not 'something went wrong')", async () => {
    await expect(passwordResetService.resetPassword("nope", "An0ther-good-pw")).rejects.toBeInstanceOf(ValidationError);
  });
});
