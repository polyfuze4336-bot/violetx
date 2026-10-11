import type { ReactNode } from "react";

import { getServerAuthSession } from "@/lib/auth";
import { ProgressTabs, WorkoutTabs } from "@/components/dashboard/section-tabs";

/** Layout for pages that live inside the Workout destination. */
export async function WorkoutSectionLayout({ children }: { children: ReactNode }) {
  const session = await getServerAuthSession();
  return (
    <>
      <WorkoutTabs role={session?.user?.role} />
      {children}
    </>
  );
}

/** Layout for pages that live inside the Progress destination. */
export async function ProgressSectionLayout({ children }: { children: ReactNode }) {
  const session = await getServerAuthSession();
  return (
    <>
      <ProgressTabs role={session?.user?.role} />
      {children}
    </>
  );
}
