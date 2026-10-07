"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";

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
            {ai?.source === "ai"
              ? "AI-generated from your recent training numbers."
              : "Smart tips from your last 4 weeks of training. Ask Violet for a deeper AI review."}
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
        <ul className="space-y-3">
          {tips.map((t, i) => (
            <li key={`${t.title}-${i}`} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t.title}</p>
                <Badge variant="secondary">{CATEGORY_LABEL[t.category]}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t.detail}</p>
            </li>
          ))}
        </ul>
        <MedicalDisclaimer />
      </CardContent>
    </Card>
  );
}
