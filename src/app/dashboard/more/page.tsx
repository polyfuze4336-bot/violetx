import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { QUICK_ACTIONS, moreGroupsFor } from "@/components/dashboard/nav-config";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Secondary destinations, grouped. The primary navigation stays gym-progress first. */
export default async function MorePage() {
  const viewer = await requireAuth();
  const groups = moreGroupsFor(viewer.role);
  const isOwner = viewer.role === "OWNER";

  return (
    <div className="space-y-8">
      <PageHeader title="More" description="Everything else VioletX tracks." />

      {isOwner && (
        <div className="flex flex-wrap gap-2">
          {Object.values(QUICK_ACTIONS).map((a, i) => (
            <Button key={a.href} asChild variant={i === 0 ? "default" : "outline"}>
              <Link href={a.href}>
                <a.icon className="h-4 w-4" />
                {a.label}
              </Link>
            </Button>
          ))}
        </div>
      )}

      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href}>
                <Card className="flex h-full items-center gap-3 p-4 transition-shadow hover:shadow-md">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
