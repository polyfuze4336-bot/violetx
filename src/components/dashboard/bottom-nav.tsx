"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/dashboard/nav-config";
import type { Role } from "@/lib/rbac";

export function BottomNav({
  role,
  onMore,
}: {
  role: Role;
  onMore: () => void;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) =>
    role === "OWNER"
      ? item.bottomNav
      : (item.bottomNav && !item.ownerOnly) || item.coachBottomNav
  );

  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors active:scale-95",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.shortLabel ?? item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors active:scale-95"
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </div>
    </nav>
  );
}
