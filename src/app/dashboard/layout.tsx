import { redirect } from "next/navigation";
import { Eye } from "lucide-react";

import { getServerAuthSession } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/shell";
import { DEMO_BANNER_TEXT, DEMO_BANNER_TITLE, isDemoModeEnabled } from "@/lib/demo-mode";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();
  // No session, or a demo session after demo mode was switched off.
  if (!session?.user?.id || (session.user.role === "DEMO_VIEWER" && !isDemoModeEnabled())) {
    redirect("/signin?callbackUrl=/dashboard");
  }

  const { name, email, image, role } = session.user;
  const isCoach = role === "COACH";
  const isDemo = role === "DEMO_VIEWER";

  return (
    <DashboardShell user={{ name, email, image, role }}>
      {isDemo && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
        >
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{DEMO_BANNER_TITLE}</p>
            <p className="text-muted-foreground">{DEMO_BANNER_TEXT}</p>
          </div>
        </div>
      )}
      {isCoach && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          <Eye className="h-4 w-4 shrink-0" />
          <span>
            You have <strong>read-only</strong> coach access. You can view all
            progress but cannot change any data.
          </span>
        </div>
      )}
      {children}
    </DashboardShell>
  );
}
