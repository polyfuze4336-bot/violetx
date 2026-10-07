"use client";

import { useState, useTransition } from "react";
import {
  Apple,
  BedDouble,
  CalendarCheck,
  ChevronDown,
  Dumbbell,
  Flame,
  Loader2,
  Repeat,
  Scale,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MedicalDisclaimer } from "@/components/ai/medical-disclaimer";
import { generateAiCoachTipsAction } from "@/lib/actions/training";
import type { AiTipsDTO } from "@/lib/services/trainingProgress";
import type { CoachTip } from "@/lib/training-analytics";

const CATEGORY_LABEL: Record<CoachTip["category"], string> = {
  volume: "Volume",
  frequency: "Frequency",
  progression: "Progression",
  recovery: "Recovery",
  consistency: "Consistency",
  balance: "Balance",
  nutrition: "Nutrition",
  motivation: "Momentum",
};

const CATEGORY_ICON: Record<CoachTip["category"], LucideIcon> = {
  volume: Dumbbell,
  frequency: Repeat,
  progression: TrendingUp,
  recovery: BedDouble,
  consistency: CalendarCheck,
  balance: Scale,
  nutrition: Apple,
  motivation: Flame,
};

export function CoachTips({
  period,
  initialTips,
}: {
  period: "week" | "month";
  initialTips: CoachTip[];
}) {
  const [ai, setAi] = useState<AiTipsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateAiCoachTipsAction(period);
      if (result.ok) setAi(result.data);
      else setError(result.error);
    });
  }

  const tips = ai?.tips ?? initialTips;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Coach Violet — hypertrophy tips
          </CardTitle>
          <CardDescription>
            {ai?.source === "ai" ? "AI review" : "From your last 4 weeks"}
          </CardDescription>
        </div>
        <Button onClick={generate} disabled={isPending} size="sm">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {ai ? "Refresh AI tips" : "Get AI coaching"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {ai?.source === "rules" && (
          <p className="text-xs text-muted-foreground">
            AI coaching is unavailable right now, so these are rule-based tips.
          </p>
        )}
        {ai?.summary && (
          <p className="rounded-lg bg-primary/5 p-3 text-sm">{ai.summary}</p>
        )}
        <ul className="space-y-2">
          {tips.map((t, i) => {
            const Icon = CATEGORY_ICON[t.category];
            return (
              <li key={`${t.title}-${i}`}>
                <details className="group rounded-xl border bg-card open:bg-muted/30" open={i === 0}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold">{t.title}</span>
                    <Badge variant="secondary" className="hidden sm:inline-flex">
                      {CATEGORY_LABEL[t.category]}
                    </Badge>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="px-3 pb-3 pl-[3.75rem] text-sm text-muted-foreground">{t.detail}</p>
                </details>
              </li>
            );
          })}
        </ul>
        <MedicalDisclaimer />
      </CardContent>
    </Card>
  );
}
