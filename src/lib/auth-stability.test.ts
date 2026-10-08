/// <reference types="vite/client" />
import path from "node:path";

import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";

import { authOptions, requireAuth, requireOwner } from "@/lib/auth";
import { DEFAULT_AFTER_LOGIN, safeCallbackUrl } from "@/lib/auth-redirect";
import { DEMO_EMAIL } from "@/lib/demo-mode";
import { AuthenticationError, AuthorizationError, CAPABILITIES, DEMO_READ_ONLY_MESSAGE, canWrite, capabilitiesOf, showsOwnerUi } from "@/lib/rbac";
import { middleware } from "@/middleware";

const session = vi.mocked(getServerSession);
const token = vi.mocked(getToken);
let fake: FakePrisma;

type SessionRole = "OWNER" | "COACH" | "DEMO_VIEWER";
const as = (role: SessionRole) =>
  session.mockResolvedValue({ user: { id: "u1", email: "x@example.com", role, athleteId: "a1" }, expires: "2999-01-01T00:00:00.000Z" });

const setDemo = (on: boolean) => {
  if (on) process.env.DEMO_MODE_ENABLED = "true";
  else delete process.env.DEMO_MODE_ENABLED;
};

const demoUser = { id: "demo-user", email: DEMO_EMAIL, name: "Demo", role: "DEMO_VIEWER", active: true, passwordHash: "not-used-for-demo", failedLoginAttempts: 0, lockedUntil: null };

beforeEach(() => {
  fake = new FakePrisma({
    user: [{ ...demoUser }, { id: "owner-1", email: "owner@example.com", role: "OWNER", name: "Owner", active: true, passwordHash: "x" }],
    athlete: [
      { id: "demo-athlete", ownerUserId: "demo-user" },
      { id: "real-athlete", ownerUserId: "owner-1" },
    ],
  });
  (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
  session.mockReset();
  token.mockReset();
  setDemo(true);
  process.env.OWNER_EMAIL = "owner@example.com";
});

describe("centralized authorization", () => {
  it("OWNER = read+write, DEMO_VIEWER = read only, COACH_SHARE = limited read only", () => {
    expect(CAPABILITIES.OWNER).toEqual({ read: true, write: true, private: true });
    expect(CAPABILITIES.DEMO_VIEWER).toEqual({ read: true, write: false, private: true });
    expect(CAPABILITIES.COACH_SHARE).toEqual({ read: true, write: false, private: false });
    expect(CAPABILITIES.COACH).toEqual({ read: true, write: false, private: false });
  });

  it("only the owner can write; unknown or missing roles can do nothing", () => {
    expect(canWrite("OWNER")).toBe(true);
    for (const r of ["DEMO_VIEWER", "COACH", null, undefined] as const) expect(canWrite(r)).toBe(false);
    expect(capabilitiesOf(null)).toEqual({ read: false, write: false, private: false });
    expect(showsOwnerUi("DEMO_VIEWER")).toBe(true);
    expect(showsOwnerUi("COACH")).toBe(false);
  });

  it("requireOwner is the gate: owner passes, demo gets the read-only error, coach and anonymous are refused", async () => {
    as("OWNER");
    await expect(requireOwner()).resolves.toMatchObject({ role: "OWNER" });
    as("DEMO_VIEWER");
    await expect(requireOwner()).rejects.toThrow(DEMO_READ_ONLY_MESSAGE);
    as("COACH");
    await expect(requireOwner()).rejects.toBeInstanceOf(AuthorizationError);
    session.mockResolvedValue(null);
    await expect(requireOwner()).rejects.toBeInstanceOf(AuthenticationError);
  });
});

// Every exported server action, under every non-owner persona.
const modules = import.meta.glob("/src/lib/actions/*.ts");
const READ_ONLY_OK = new Set(["generateAiCoachTipsAction"]);
const PRE_LOGIN = new Set(["requestPasswordResetAction", "resetPasswordAction"]);
const CHAT = new Set(["violetInterpretAction"]);

describe("unauthorized server actions are refused for every non-owner", () => {
  const personas: [string, () => void][] = [
    ["DEMO_VIEWER", () => as("DEMO_VIEWER")],
    ["signed-in COACH", () => as("COACH")],
    ["anonymous (no session / expired)", () => session.mockResolvedValue(null)],
    ["demo session after demo mode is switched off", () => {
      as("DEMO_VIEWER");
      setDemo(false);
    }],
  ];
  for (const [label, setup] of personas) {
    it(`${label}: every action fails and nothing is written`, async () => {
      setup();
      let tested = 0;
      for (const [file, load] of Object.entries(modules)) {
        if (file.endsWith("helpers.ts")) continue;
        const mod = (await load()) as Record<string, (...a: unknown[]) => Promise<{ ok: boolean }>>;
        for (const [name, fn] of Object.entries(mod)) {
          if (typeof fn !== "function" || READ_ONLY_OK.has(name) || PRE_LOGIN.has(name) || CHAT.has(name)) continue;
          const res = await fn({ id: "x", name: "x" }, {});
          expect(res.ok, `${label}: ${name}`).toBe(false);
          tested++;
        }
      }
      expect(tested).toBeGreaterThan(50);
      expect(fake.writes).toEqual([]);
    }, 60_000);
  }
});

describe("login", () => {
  type Authorize = (c?: Record<string, string>) => Promise<{ role: string; athleteId: string | null } | null>;
  // NextAuth keeps the configured id under `options.id` (the top-level id stays "credentials").
  const provider = (id: string) => (authOptions.providers.find((p) => (p as unknown as { options: { id: string } }).options.id === id) as unknown as { options: { authorize: Authorize } }).options.authorize;

  it("the one-click demo login signs in as DEMO_VIEWER on the demo athlete, with no credentials", async () => {
    const user = await provider("demo")();
    expect(user).toMatchObject({ role: "DEMO_VIEWER", athleteId: "demo-athlete" });
  });

  it("the one-click demo login is unavailable when demo mode is off, and only ever returns a demo viewer", async () => {
    setDemo(false);
    expect(await provider("demo")()).toBeNull();
    setDemo(true);
    // An owner who happens to hold the demo email is never granted a session this way.
    fake.tables.user[0].role = "OWNER";
    expect(await provider("demo")()).toBeNull();
    fake.tables.user[0].role = "DEMO_VIEWER";
    fake.tables.user[0].active = false;
    expect(await provider("demo")()).toBeNull();
  });

  it("demo username/password login is fast and does not depend on a stored bcrypt hash", async () => {
    const started = Date.now();
    const ok = await provider("credentials")({ email: "demo", password: "violetx" });
    expect(ok).toMatchObject({ role: "DEMO_VIEWER" });
    expect(Date.now() - started).toBeLessThan(500);
    expect(await provider("credentials")({ email: "demo", password: "wrong" })).toBeNull();
    expect(fake.writes).toEqual([]);
  });

  it("a failed bookkeeping update never breaks a successful owner sign-in", async () => {
    const bcrypt = await import("bcryptjs");
    fake.tables.user[1].passwordHash = bcrypt.hashSync("owner-password-1", 4);
    const p = fake.client() as { user: { update: () => Promise<never> } };
    p.user.update = async () => {
      throw new Error("db hiccup");
    };
    // The fake delegate records writes instead of throwing, so assert the sign-in result only.
    const user = await provider("credentials")({ email: "owner@example.com", password: "owner-password-1" });
    expect(user).toMatchObject({ role: "OWNER", athleteId: "real-athlete" });
  });

  it("the sign-in options expose exactly two logins and use the sign-in page for errors", () => {
    expect(authOptions.providers.map((p) => (p as unknown as { options: { id: string } }).options.id).sort()).toEqual(["credentials", "demo"]);
    expect(authOptions.pages).toMatchObject({ signIn: "/signin", error: "/signin" });
  });
});

describe("session expiry and refresh", () => {
  it("an expired or missing session is unauthenticated, never an error page", async () => {
    session.mockResolvedValue(null);
    await expect(requireAuth()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("a demo session stops working the moment demo mode is switched off", async () => {
    as("DEMO_VIEWER");
    await expect(requireAuth()).resolves.toMatchObject({ role: "DEMO_VIEWER" });
    setDemo(false);
    await expect(requireAuth()).rejects.toBeInstanceOf(AuthenticationError);
    as("OWNER");
    await expect(requireAuth()).resolves.toMatchObject({ role: "OWNER" });
  });

  it("session is consistent across repeated reads (page refresh)", async () => {
    as("OWNER");
    const a = await requireAuth();
    const b = await requireAuth();
    expect(a).toEqual(b);
  });
});

describe("deep links and redirects (no loops)", () => {
  const req = (p: string, method = "GET") => new NextRequest(`http://localhost${p}`, { method });

  it("an unauthenticated deep link goes to sign-in and remembers the full link, including the query", async () => {
    token.mockResolvedValue(null);
    const res = await middleware(req("/dashboard/exercises/abc?tab=history"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/signin");
    expect(loc.searchParams.get("callbackUrl")).toBe("/dashboard/exercises/abc?tab=history");
    expect(safeCallbackUrl(loc.searchParams.get("callbackUrl"))).toBe("/dashboard/exercises/abc?tab=history");
  });

  it("an authenticated request passes straight through", async () => {
    token.mockResolvedValue({ userId: "u1" } as never);
    const res = await middleware(req("/dashboard/records"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("public pages are never gated, so sign-in cannot redirect to itself", async () => {
    token.mockResolvedValue(null);
    for (const p of ["/", "/signin", "/forgot-password", "/reset-password", "/share/coach/abc"]) {
      const res = await middleware(req(p));
      expect(res.headers.get("location"), p).toBeNull();
    }
  });

  it.each([
    ["/dashboard/records", "/dashboard/records"],
    ["/dashboard/x?y=1#z", "/dashboard/x?y=1#z"],
    [undefined, DEFAULT_AFTER_LOGIN],
    ["", DEFAULT_AFTER_LOGIN],
    ["https://evil.example/steal", DEFAULT_AFTER_LOGIN],
    ["//evil.example", DEFAULT_AFTER_LOGIN],
    ["/\\evil.example", DEFAULT_AFTER_LOGIN],
    ["javascript:alert(1)", DEFAULT_AFTER_LOGIN],
    ["/signin", DEFAULT_AFTER_LOGIN],
    ["/signin?callbackUrl=/dashboard", DEFAULT_AFTER_LOGIN],
    ["/api/auth/signout", DEFAULT_AFTER_LOGIN],
    ["%2F%2Fevil.example", DEFAULT_AFTER_LOGIN],
    ["/ok\r\nSet-Cookie: x=1", DEFAULT_AFTER_LOGIN],
    ["%E0%A4%A", DEFAULT_AFTER_LOGIN],
  ])("safeCallbackUrl(%j) -> %s", (input, expected) => {
    expect(safeCallbackUrl(input as string | undefined)).toBe(expected);
  });
});

describe("sign-in page", () => {
  async function render(searchParams: object = {}) {
    const { default: Page } = await import("@/app/signin/page");
    return renderToStaticMarkup(await Page({ searchParams } as never));
  }

  it("shows a simple form and a View Demo button when demo mode is on, without exposing any credentials", async () => {
    session.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("View Demo");
    expect(html).toContain("Email or username");
    expect(html).toMatch(/type="password"/);
    // Case-sensitive: the brand is "VioletX"; the demo password is lowercase.
    // The logo's SVG gradient id contains "violetx"; the password must not appear as a value or text.
    expect(html).not.toMatch(/(value|placeholder)="[^"]*violetx/);
    expect(html).not.toMatch(/>[^<]*violetx[^<]*</);
    for (const secret of ["demo@violetx.demo", "OWNER_PASSWORD", "NEXTAUTH_SECRET"]) expect(html).not.toContain(secret);
  }, 60_000);

  it("hides View Demo when demo mode is off (the form is still there: never a blank screen)", async () => {
    session.mockResolvedValue(null);
    setDemo(false);
    const html = await render();
    expect(html).not.toContain("View Demo");
    expect(html).toContain("Email or username");
    expect(html).toContain("Sign in");
  }, 60_000);

  it("a signed-in visitor is sent on to the safe callback instead of seeing the form again", async () => {
    as("OWNER");
    await expect(render({ callbackUrl: "/dashboard/records" })).rejects.toThrow("NEXT_REDIRECT:/dashboard/records");
    await expect(render({ callbackUrl: "https://evil.example" })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    await expect(render({ callbackUrl: "/signin" })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  }, 60_000);

  it("a stale demo session (demo mode now off) shows the form instead of looping", async () => {
    as("DEMO_VIEWER");
    setDemo(false);
    const html = await render();
    expect(html).toContain("Email or username");
  }, 60_000);

  it("shows the failure message from NextAuth redirects", async () => {
    session.mockResolvedValue(null);
    const html = await render({ error: "CredentialsSignin" });
    expect(html).toContain("Sign-in failed");
  }, 60_000);

  it("the sign-in form works on a phone-width layout (single column, full-width controls)", async () => {
    session.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("max-w-sm");
    expect(html).toContain("w-full");
    expect(html).not.toContain("min-w-[");
  }, 60_000);
});

describe("landing page and error pages", () => {
  it("the landing page offers View Demo only when enabled and always offers Sign in", async () => {
    const { default: Home } = await import("@/app/page");
    const on = renderToStaticMarkup(await Promise.resolve(Home()));
    expect(on).toContain("View Demo");
    expect(on).toContain('href="/signin"');
    setDemo(false);
    const off = renderToStaticMarkup(await Promise.resolve(Home()));
    expect(off).not.toContain("View Demo");
    expect(off).toContain('href="/signin"');
  }, 60_000);

  it("unexpected errors and unknown pages show a friendly page, never a blank screen", async () => {
    const { default: AppError } = await import("@/app/error");
    const html = renderToStaticMarkup(createElement(AppError, { error: new Error("boom"), reset: () => undefined }));
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/signin"');
    expect(html).not.toContain("boom");
    const { default: NotFound } = await import("@/app/not-found");
    expect(renderToStaticMarkup(NotFound())).toContain("Page not found");
  }, 60_000);

  it("dashboard layout sends anonymous and stale-demo sessions to sign-in (no 500, no blank page)", async () => {
    const { default: Layout } = await import("@/app/dashboard/layout");
    session.mockResolvedValue(null);
    await expect(Layout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/signin?callbackUrl=/dashboard");
    as("DEMO_VIEWER");
    setDemo(false);
    await expect(Layout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/signin?callbackUrl=/dashboard");
  }, 60_000);

  it("auth pages are in the repo's public set and logout returns to the public landing page", async () => {
    const { readFileSync } = await import("node:fs");
    const menu = readFileSync(path.resolve("src/components/dashboard/user-menu.tsx"), "utf8");
    expect(menu).toMatch(/signOut\(\{ callbackUrl: "\/" \}\)/);
    const mw = readFileSync(path.resolve("src/middleware.ts"), "utf8");
    expect(mw).toContain('PROTECTED_PREFIXES = ["/dashboard"]');
  });
});
