import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

import { prisma } from "@/lib/db";
import {
  AuthenticationError,
  AuthorizationError,
  ROLES,
  resolveRole,
  type Role,
} from "@/lib/rbac";

function extractEmail(
  user: { email?: string | null },
  profile?: unknown
): string | null {
  if (user.email) return user.email;
  const p = profile as
    | { email?: string; preferred_username?: string; upn?: string }
    | undefined;
  return p?.email ?? p?.preferred_username ?? p?.upn ?? null;
}

function parseAllowedCoachEmails(): string[] {
  return (process.env.ALLOWED_COACH_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Look up the id of the single active athlete: the athlete owned by the
 * configured OWNER_EMAIL user. Coaches read this athlete.
 */
async function findActiveAthleteId(): Promise<string | null> {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) return null;
  const owner = await prisma.user.findUnique({
    where: { email: ownerEmail },
    include: { ownedAthlete: { select: { id: true } } },
  });
  return owner?.ownedAthlete?.id ?? null;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      tenantId: process.env.AZURE_AD_TENANT_ID ?? "common",
      authorization: { params: { scope: "openid profile email" } },
    }),
  ],
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    async signIn({ user, profile }) {
      const email = extractEmail(user, profile);
      if (!email) return false;

      const allowed = parseAllowedCoachEmails();
      if (allowed.length === 0) return true; // open to any Entra user

      const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
      const normalized = email.trim().toLowerCase();
      return normalized === ownerEmail || allowed.includes(normalized);
    },

    async jwt({ token, user, profile }) {
      // Only touch the database on initial sign-in (when `user` is present).
      if (user) {
        const email = extractEmail(user, profile);
        if (email) {
          const role = resolveRole(email);
          const dbUser = await prisma.user.upsert({
            where: { email },
            update: {
              name: user.name ?? undefined,
              image: user.image ?? undefined,
              role,
            },
            create: {
              email,
              name: user.name ?? null,
              image: user.image ?? null,
              role,
            },
          });

          token.userId = dbUser.id;
          token.role = role;

          if (role === ROLES.OWNER) {
            const athlete = await prisma.athlete.upsert({
              where: { ownerUserId: dbUser.id },
              update: {},
              create: {
                ownerUserId: dbUser.id,
                displayName: dbUser.name ?? "Athlete",
              },
              select: { id: true },
            });
            token.athleteId = athlete.id;
          } else {
            token.athleteId = await findActiveAthleteId();
          }
        }
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

/**
 * Require an authenticated session. Throws AuthenticationError if not signed in.
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
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
 * Require an authenticated OWNER. Throws AuthorizationError for coaches.
 */
export async function requireOwner(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.role !== ROLES.OWNER) {
    throw new AuthorizationError();
  }
  return ctx;
}
