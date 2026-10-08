import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

// One message for every unavailable link (unknown, malformed, expired or
// revoked) so nothing reveals whether an account exists.
export const metadata: Metadata = {
  title: "Link unavailable",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function CoachLinkUnavailable() {
  return (
    <div className="app-surface flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo className="h-12 w-12" />
      <h1 className="text-xl font-semibold tracking-tight">This coach link is no longer available.</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        It may have expired or been turned off. Please ask for a new link.
      </p>
      <p className="text-xs text-muted-foreground">{APP_NAME}</p>
    </div>
  );
}
