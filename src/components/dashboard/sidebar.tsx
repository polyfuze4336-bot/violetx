"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { primaryNavFor, sectionOf } from "@/components/dashboard/nav-config";
import { LogoWordmark } from "@/components/brand/logo";
import type { Role } from "@/lib/rbac";

/** Desktop sidebar: the primary destinations only. Everything else is under More. */
export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const current = sectionOf(pathname);

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {primaryNavFor(role).map((item) => {
        const active = item.key === current;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-gradient" />
            )}
            <item.icon
              className={cn(
                "h-[18px] w-[18px] transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarBrand() {
  return (
    <Link href="/dashboard" aria-label="Progress home">
      <LogoWordmark />
    </Link>
  );
}
