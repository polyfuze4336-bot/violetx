"use client";

import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Role } from "@/lib/rbac";
import { PATIENT_LABEL } from "@/lib/constants";

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({
  name,
  email,
  image,
  role,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: Role;
}) {
  const { theme, setTheme } = useTheme();
  const themes = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "system", label: "System", icon: Monitor },
  ] as const;

  // The athlete is never shown by real name; their email is hidden in the UI.
  const isOwner = role === "OWNER";
  const displayName = isOwner ? PATIENT_LABEL : name ?? "Coach";
  const displayEmail = isOwner ? null : email;

  return (
    <div className="flex items-center gap-3">
      <span
        className={
          isOwner
            ? "hidden rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold text-white sm:inline-flex"
            : "hidden items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground sm:inline-flex"
        }
      >
        {isOwner ? PATIENT_LABEL : "Coach · read-only"}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Account menu"
          >
            <Avatar className="h-9 w-9">
              {image && !isOwner ? (
                <AvatarImage src={image} alt="" />
              ) : null}
              <AvatarFallback>
                {isOwner ? "PX" : initials(name, email)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="truncate">{displayName}</span>
              {displayEmail && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {displayEmail}
                </span>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Theme
          </DropdownMenuLabel>
          {themes.map((t) => (
            <DropdownMenuItem
              key={t.key}
              onClick={() => setTheme(t.key)}
              className="cursor-pointer"
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {theme === t.key && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/" })}
            className="cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
