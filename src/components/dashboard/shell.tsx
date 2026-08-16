"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  const [moreOpen, setMoreOpen] = useState(false);

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

      {/* Mobile bottom navigation */}
      <BottomNav role={user.role} onMore={() => setMoreOpen(true)} />

      {/* Mobile "More" drawer with full navigation */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t bg-card p-5 pb-8 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <SidebarBrand />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarNav role={user.role} onNavigate={() => setMoreOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
