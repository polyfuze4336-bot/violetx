"use client";

import { SidebarBrand, SidebarNav } from "@/components/dashboard/sidebar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import type { Role } from "@/lib/rbac";

export interface ShellUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: Role;
}

export function DashboardShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  return (
    <div className="app-surface min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r bg-card/60 lg:flex lg:flex-col">
        <div className="flex h-16 items-center px-6">
          <SidebarBrand />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <SidebarNav role={user.role} />
        </div>
        <div className="border-t p-4 text-xs text-muted-foreground">
          Progress · personal fitness
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        {/* Header */}
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 lg:px-8">
          <div className="lg:hidden">
            <SidebarBrand />
          </div>
          <div className="hidden lg:block" />
          <UserMenu
            name={user.name}
            email={user.email}
            image={user.image}
            role={user.role}
          />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation (More is a page, not a drawer) */}
      <BottomNav role={user.role} />
    </div>
  );
}
