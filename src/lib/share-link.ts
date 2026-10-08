import { createHash, randomBytes } from "crypto";

// Pure helpers for coach share links. No IO so they stay unit-testable.

export const SHARE_TOKEN_BYTES = 32;
export const SHARE_EXPIRY_DAYS = [7, 30] as const;
export const DEFAULT_SHARE_EXPIRY_DAYS = 30;
export const MAX_CUSTOM_EXPIRY_DAYS = 365;

/** "Never expires" is stored as a far-future date, so no schema change is needed. */
export const NEVER_EXPIRES = new Date("9999-12-31T00:00:00.000Z");
export type ShareExpiry = number | "never";

export const isNeverExpiring = (expiresAt: Date) => expiresAt.getUTCFullYear() >= 9000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 256-bit URL-safe random token. Shown to the owner once; never stored. */
export function generateShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
}

/** Cheap shape check so malformed tokens never reach the database. */
export function isWellFormedShareToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** Only this hash is persisted. */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function computeShareExpiry(days: ShareExpiry, now = new Date()): Date {
  if (days === "never") return new Date(NEVER_EXPIRES);
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export type ShareLinkStatus = "active" | "expired" | "revoked";

export function shareLinkStatus(
  link: { expiresAt: Date; revokedAt: Date | null },
  now = new Date()
): ShareLinkStatus {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}
