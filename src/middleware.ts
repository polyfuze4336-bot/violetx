import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Routes that require authentication. Everything under these prefixes is
// gated; unauthenticated users are redirected to the sign-in page.
const PROTECTED_PREFIXES = ["/dashboard"];

// Public, token-authorised coach views. They are strictly read-only: every
// method other than GET/HEAD is refused here, independently of the page, so a
// forged POST (including a server-action call) never reaches application code.
const SHARE_PREFIXES = ["/share", "/coach"];
const READ_METHODS = new Set(["GET", "HEAD"]);

export function guardSharePath(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl;
  const isShare = SHARE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!isShare) return null;

  const headers = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
  };
  if (!READ_METHODS.has(req.method)) {
    return NextResponse.json(
      { error: "This view is read only." },
      { status: 405, headers: { ...headers, Allow: "GET, HEAD" } }
    );
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const shared = guardSharePath(req);
  if (shared) return shared;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const signInUrl = new URL("/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/share/:path*", "/coach/:path*"],
};
