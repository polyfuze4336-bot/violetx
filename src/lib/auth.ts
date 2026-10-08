import type { NextAuthOptions, User as NextAuthUser } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  AuthenticationError,
  AuthorizationError,
  DEMO_READ_ONLY_MESSAGE,
  ROLES,
  isRole,
  showsOwnerUi,
  type Role,
} from "@/lib/rbac";
import { DEMO_EMAIL, DEMO_PASSWORD, demoLoginEmail, isDemoModeEnabled } from "@/lib/demo-mode";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

const credentialsSchema = z.object({
  // An email, or (prototype demo only) a plain username such as "demo".
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

/**
 * Resolve the single active athlete id for a user. OWNER → their own athlete;
 * COACH → the athlete owned by the configured OWNER_EMAIL user.
 */
async function resolveAthleteId(
  userId: string,
  role: Role
): Promise<string | null> {
  // The demo viewer reads its OWN fictional athlete, never the real one.
  if (role === ROLES.OWNER || role === ROLES.DEMO_VIEWER) {
    const athlete = await prisma.athlete.findUnique({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    return athlete?.id ?? null;
  }
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) return null;
  const owner = await prisma.user.findUnique({
    where: { email: ownerEmail.toLowerCase() },
    include: { ownedAthlete: { select: { id: true } } },
  });
  return owner?.ownedAthlete?.id ?? null;
}

type SessionUser = NextAuthUser & { role: Role; athleteId: string | null };

/** Shape the verified user for the session (shared by the password and demo logins). */
async function toSessionUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: string;
}): Promise<SessionUser> {
  const role = isRole(user.role) ? user.role : ROLES.COACH;
  const athleteId = await resolveAthleteId(user.id, role);
  return { id: user.id, email: user.email, name: user.name, role, athleteId };
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/signin", error: "/signin" },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email or username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const identifier = parsed.data.email.trim().toLowerCase();
        const email = identifier.includes("@")
          ? identifier
          : demoLoginEmail(identifier);
        if (!email) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // Do not reveal which check failed (avoid user enumeration).
        if (!user || !user.active || !user.passwordHash) return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const isDemo = user.role === ROLES.DEMO_VIEWER;
        // A demo account only works while demo mode is explicitly enabled.
        if (isDemo && !isDemoModeEnabled()) return null;
        // The demo password is public, so it is compared directly instead of
        // through bcrypt (which makes the one-click demo slow for no benefit).
        const ok = isDemo
          ? safeEqual(parsed.data.password, DEMO_PASSWORD)
          : await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) {
          // The demo password is public: never lock the shared account out.
          if (isDemo) return null;
          const attempts = user.failedLoginAttempts + 1;
          const lockedUntil =
            attempts >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_DURATION_MS)
              : null;
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: attempts, lockedUntil },
          });
          return null;
        }

        // Bookkeeping must never block or break a successful sign-in.
        if (!isDemo) {
          await prisma.user
            .update({
              where: { id: user.id },
              data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
            })
            .catch(() => undefined);
        }

        return toSessionUser(user);
      },
    }),
    // One-click "View Demo": no credentials in the browser. Only ever grants
    // the read-only DEMO_VIEWER persona, and only while demo mode is enabled.
    CredentialsProvider({
      id: "demo",
      name: "Demo",
      credentials: {},
      async authorize() {
        if (!isDemoModeEnabled()) return null;
        const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
        if (!user || !user.active || user.role !== ROLES.DEMO_VIEWER) return null;
        return toSessionUser(user);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as NextAuthUser & {
          role: Role;
          athleteId: string | null;
        };
        token.userId = u.id;
        token.role = u.role;
        token.athleteId = u.athleteId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId ?? "";
        session.user.role = (token.role as Role) ?? ROLES.COACH;
        session.user.athleteId = token.athleteId ?? null;
      }
      return session;
    },
  },
};

/** Server-side helper to read the current session. */
export function getServerAuthSession() {
  return getServerSession(authOptions);
}

export interface AuthContext {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  athleteId: string | null;
}

/** Require an authenticated session. Throws AuthenticationError if not signed in. */
export async function requireAuth(): Promise<AuthContext> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    throw new AuthenticationError();
  }
  // Switching demo mode off ends any demo session still within its lifetime.
  if (session.user.role === ROLES.DEMO_VIEWER && !isDemoModeEnabled()) {
    throw new AuthenticationError();
  }
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    role: session.user.role,
    athleteId: session.user.athleteId,
  };
}

/**
 * Require an authenticated OWNER. Throws AuthorizationError for coaches and a
 * "Demo mode is read only." error for the demo viewer. Every write path goes
 * through this (directly or via requireOwnerAthlete), so the demo account can
 * never mutate data even if a server action is called directly.
 */
export async function requireOwner(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.role === ROLES.DEMO_VIEWER) {
    throw new AuthorizationError(DEMO_READ_ONLY_MESSAGE);
  }
  if (ctx.role !== ROLES.OWNER) {
    throw new AuthorizationError();
  }
  return ctx;
}

/**
 * For READ-ONLY owner experiences (e.g. asking Violet a question): the owner
 * or the demo viewer. Must never be used by a method that writes.
 */
export async function requireOwnerOrDemo(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!showsOwnerUi(ctx.role)) {
    throw new AuthorizationError();
  }
  return ctx;
}
