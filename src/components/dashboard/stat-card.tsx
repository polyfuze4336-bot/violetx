import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  trend,
  accent = "primary",
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  accent?: "primary" | "magenta" | "success";
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary",
    magenta: "bg-magenta/10 text-magenta",
    success: "bg-success/10 text-success",
  }[accent];

  return (
    <Card className="p-5 transition-shadow hover:shadow-[0_2px_4px_rgba(20,12,40,0.05),0_16px_40px_-20px_rgba(20,12,40,0.20)]">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              accentClasses
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            trend === "up" && "text-success",
            trend === "down" && "text-magenta",
            (!trend || trend === "neutral") && "text-muted-foreground"
          )}
        >
          {hint}
        </p>
      )}
    </Card>
  );
}
