import { Info } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { checkInService } from "@/lib/services/checkin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProgressLineChart } from "@/components/charts/line-chart";
import { CheckInForm } from "@/components/recovery/check-in-form";
import { ReadinessGauge } from "@/components/recovery/readiness-gauge";
import { formatShortDate } from "@/lib/format";
import { todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  const viewer = await requireAuth();
  const isOwner = viewer.role === "OWNER";
  const overview = viewer.athleteId ? await checkInService.overview(todayIso(), 30) : null;
  const history = overview?.history ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Recovery" description="Daily check-in and readiness." />

      {overview?.today && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReadinessGauge readiness={overview.today.readiness} />
            <p className="text-sm text-muted-foreground">{overview.today.explanation}</p>
          </CardContent>
        </Card>
      )}

      {isOwner && <CheckInForm existing={overview?.today ?? null} />}

      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Readiness trend
              {overview?.average7d !== null && overview?.average7d !== undefined && (
                <span className="text-sm font-medium text-muted-foreground">7-day avg {overview.average7d}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProgressLineChart
              data={history.map((h) => ({ label: formatShortDate(h.date), score: h.readiness.score }))}
              xKey="label"
              series={[{ key: "score", name: "Readiness", color: 1 }]}
              height={220}
            />
          </CardContent>
        </Card>
      )}

      <p className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Fitness and recovery guidance only — not a substitute for professional medical advice.
      </p>
    </div>
  );
}
