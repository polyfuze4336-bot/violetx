import { redirect } from "next/navigation";
import { Eye } from "lucide-react";

import { getServerAuthSession } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=/dashboard");
  }

  const { name, email, image, role } = session.user;
  const isCoach = role === "COACH";

  return (
    <DashboardShell user={{ name, email, image, role }}>
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
