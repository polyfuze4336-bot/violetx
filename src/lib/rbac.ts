// Core role-based access-control primitives. Kept free of framework/DB imports
// so it can be used from both edge (middleware) and node (services) contexts.

export const ROLES = {
  OWNER: "OWNER",
  COACH: "COACH",
  /**
   * Prototype showcase account. Reads its own fictional athlete like an owner
   * would, but can NEVER write: every mutation is owner-only and refused with
   * DEMO_READ_ONLY_MESSAGE.
   */
  DEMO_VIEWER: "DEMO_VIEWER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export function isRole(value: unknown): value is Role {
  return value === ROLES.OWNER || value === ROLES.COACH || value === ROLES.DEMO_VIEWER;
}

export const DEMO_READ_ONLY_MESSAGE = "Demo mode is read only.";

export function isDemoViewer(role: Role | null | undefined): boolean {
  return role === ROLES.DEMO_VIEWER;
}

/**
 * Roles that see the athlete's own (owner) experience, including private areas
 * such as nutrition. Writes are separate: see canWrite.
 */
export function showsOwnerUi(role: Role | null | undefined): boolean {
  return role === ROLES.OWNER || role === ROLES.DEMO_VIEWER;
}

/**
 * Resolve a user's role from their email. The single athlete (OWNER) is
 * configured via OWNER_EMAIL; everyone else who can sign in is a read-only
 * COACH. Comparison is case-insensitive.
 */
export function resolveRole(
  email: string | null | undefined,
  ownerEmail: string | null | undefined = process.env.OWNER_EMAIL
): Role {
  if (!email || !ownerEmail) return ROLES.COACH;
  return email.trim().toLowerCase() === ownerEmail.trim().toLowerCase()
    ? ROLES.OWNER
    : ROLES.COACH;
}

/** Whether a role is allowed to perform write (create/update/delete) actions. */
export function canWrite(role: Role | null | undefined): boolean {
  return role === ROLES.OWNER;
}

/** Error thrown when an action is not permitted for the current role. */
export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Error thrown when no authenticated user is present. */
export class AuthenticationError extends Error {
  readonly status = 401;
  constructor(message = "You must be signed in to perform this action.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** Error thrown when a requested or scoped resource does not exist. */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "The requested resource was not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}
