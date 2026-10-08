// Prototype demo mode. Pure helpers with no framework or DB imports.
//
// PROTOTYPE ONLY: the demo credentials are intentionally trivial and public.
// Demo login is OFF unless DEMO_MODE_ENABLED=true is set on the deployment,
// so a normal/production deployment can never be entered with them.

export const DEMO_USERNAME = "demo";
export const DEMO_PASSWORD = "violetx";
/** Internal identity of the demo account (never shown as an email in the UI). */
export const DEMO_EMAIL = "demo@violetx.demo";
export const DEMO_BANNER_TITLE = "DEMO MODE";
export const DEMO_BANNER_TEXT =
  "Explore VioletX using pre-populated fitness data. Changes are disabled.";

export function isDemoModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE_ENABLED === "true";
}

/**
 * Map the sign-in identifier to an account email. Only the single demo
 * username is recognised, and only while demo mode is enabled. Everything else
 * that is not an email is rejected.
 */
export function demoLoginEmail(
  identifier: string,
  env: Record<string, string | undefined> = process.env
): string | null {
  if (!isDemoModeEnabled(env)) return null;
  return identifier.trim().toLowerCase() === DEMO_USERNAME ? DEMO_EMAIL : null;
}
