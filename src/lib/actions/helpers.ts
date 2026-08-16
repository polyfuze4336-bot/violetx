import { ZodError } from "zod";

import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/rbac";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Run a server-side operation and translate known errors (validation, auth,
 * not-found) into a serializable ActionResult. Unexpected errors are logged
 * and returned as a generic message so internals are not leaked to clients.
 */
export async function runAction<T>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return {
        ok: false,
        error: "Please correct the highlighted fields.",
        fieldErrors,
      };
    }
    if (
      error instanceof AuthorizationError ||
      error instanceof AuthenticationError ||
      error instanceof NotFoundError
    ) {
      return { ok: false, error: error.message };
    }
    console.error("Unexpected action error:", error);
    // Send to Application Insights when configured (never includes user input).
    void import("@/lib/telemetry").then(({ trackException }) =>
      trackException(error, { source: "server-action" })
    );
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
