// Safe post-login redirects. Only same-site paths are allowed, so a crafted
// ?callbackUrl= can never send someone to another site, and sign-in pages can
// never redirect to themselves (no redirect loops).

export const DEFAULT_AFTER_LOGIN = "/dashboard";

export function safeCallbackUrl(raw: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  if (!raw || typeof raw !== "string") return fallback;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  // Must be a plain absolute path: "/x", never "//host", "/\\host" or "http://".
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\r\n\\]/.test(value) || value.includes("://")) {
    return fallback;
  }
  const path = value.split(/[?#]/)[0];
  const authPages = ["/signin", "/forgot-password", "/reset-password", "/api/auth"];
  if (authPages.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return value;
}
