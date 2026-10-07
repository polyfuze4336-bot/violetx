import Link from "next/link";
import { ArrowLeft, ArrowRight, Dumbbell, Flame, HeartPulse, Salad, Scale, Sparkles, Trophy } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { weeklyReviewService } from "@/lib/services/weeklyReview";
import { todayIso } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";

export const dynamic = "force-dynamic";

function shift(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function Block({ icon: Icon, title, children, className }: { icon: typeof Dumbbell; title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("space-y-2 p-5", className)}>
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      {children}
    </Card>
  );
}

const signed = (n: number, unit: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} ${unit}`;

export default async function ReviewPage({ searchParams }: { searchParams: { week?: string } }) {
  const viewer = await requireAuth();
  const week = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week ?? "") ? searchParams.week! : todayIso();
  const r = viewer.athleteId ? await weeklyReviewService.get(week) : null;

  const nav = r && (
    <div className="flex items-center gap-1">
      <Link href={`/dashboard/review?week=${shift(r.weekStart, -7)}`} aria-label="Previous week" className="rounded-lg border p-2 hover:bg-muted">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <span className="px-2 text-sm font-medium tabular-nums">
        {formatDate(r.weekStart).replace(/ \d{4}$/, "")} – {formatDate(r.weekEnd)}
      </span>
      {shift(r.weekStart, 7) <= todayIso() ? (
        <Link href={`/dashboard/review?week=${shift(r.weekStart, 7)}`} aria-label="Next week" className="rounded-lg border p-2 hover:bg-muted">
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className="rounded-lg border p-2 opacity-40">
          <ArrowRight className="h-4 w-4" />
        </span>
      )}
    </div>
  );

  if (!r) return <EmptyState icon={Sparkles} title="No athlete profile yet" />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Violet weekly review" action={nav} />

      {!r.hasData ? (
        <EmptyState icon={Sparkles} title="Nothing recorded this week" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Block icon={Dumbbell} title="Training">
              <p className="text-3xl font-bold tabular-nums">
                {r.training.workouts} <span className="text-base font-medium text-muted-foreground">workouts</span>
              </p>
              <p className="text-sm tabular-nums text-muted-foreground">
                {r.training.volumeKg.toLocaleString()} kg recorded volume
                {r.training.volumeChangePct !== null && (
                  <span className={cn("ml-2 font-semibold", r.training.volumeChangePct >= 0 ? "text-success" : "text-magenta")}>
                    {r.training.volumeChangePct >= 0 ? "+" : ""}
                    {r.training.volumeChangePct}% vs previous week
                  </span>
                )}
              </p>
            </Block>

            <Block icon={Trophy} title="Strength">
              {r.strength.prs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No PRs this week.</p>
              ) : (
                <>
                  <p className="text-3xl font-bold tabular-nums">
                    {r.strength.prs.length} <span className="text-base font-medium text-muted-foreground">PR{r.strength.prs.length === 1 ? "" : "s"}</span>
                  </p>
                  <ul className="space-y-0.5 text-sm text-muted-foreground">
                    {r.strength.prs.slice(0, 4).map((p, i) => (
                      <li key={i}>
                        <span className="font-medium text-foreground">{p.exerciseName}</span> {p.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Block>

            <Block icon={Scale} title="Body">
              {r.body.weightChangeKg === null && r.body.waistChangeCm === null ? (
                <p className="text-sm text-muted-foreground">No new body measurements.</p>
              ) : (
                <div className="space-y-0.5 text-sm">
                  {r.body.weightChangeKg !== null && (
                    <p>
                      Weight <span className="font-semibold tabular-nums">{signed(r.body.weightChangeKg, "kg")}</span>
                      {r.body.latestWeightKg !== null && <span className="text-muted-foreground"> · {formatNumber(r.body.latestWeightKg)} kg</span>}
                    </p>
                  )}
                  {r.body.waistChangeCm !== null && (
                    <p>
                      Waist <span className="font-semibold tabular-nums">{signed(r.body.waistChangeCm, "cm")}</span>
                    </p>
                  )}
                </div>
              )}
            </Block>

            <Block icon={HeartPulse} title="Recovery">
              {r.recovery.avgReadiness === null ? (
                <p className="text-sm text-muted-foreground">No check-ins this week.</p>
              ) : (
                <p className="text-3xl font-bold tabular-nums">
                  {r.recovery.avgReadiness} <span className="text-base font-medium text-muted-foreground">avg readiness</span>
                </p>
              )}
            </Block>

            <Block icon={Flame} title="Consistency">
              <p className="text-3xl font-bold tabular-nums">
                {r.consistency.done}
                {r.consistency.planned > 0 && <span className="text-base font-medium text-muted-foreground"> / {r.consistency.planned} planned sessions</span>}
              </p>
            </Block>

            {r.nutrition && (
              <Block icon={Salad} title="Nutrition">
                <p className="text-sm tabular-nums">
                  {r.nutrition.avgCalories !== null && <>Calories {r.nutrition.avgCalories.toLocaleString()}{r.nutrition.targets?.calories ? ` / ${r.nutrition.targets.calories.toLocaleString()}` : ""} · </>}
                  {r.nutrition.avgProtein !== null && <>Protein {r.nutrition.avgProtein}{r.nutrition.targets?.protein ? ` / ${r.nutrition.targets.protein}` : ""} g</>}
                </p>
                <p className="text-xs text-muted-foreground">{r.nutrition.daysLogged} day(s) logged</p>
              </Block>
            )}
          </div>

          <Card className="space-y-2 border-primary/30 bg-primary/5 p-5">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Violet&apos;s observation
            </p>
            <p className="text-sm">{r.observation}</p>
          </Card>

          <Card className="space-y-2 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Next week · suggestions</p>
            <ul className="space-y-1.5 text-sm">
              {r.nextWeek.map((n) => (
                <li key={n} className="flex items-start gap-2">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {n}
                </li>
              ))}
            </ul>
            <p className="pt-1 text-xs text-muted-foreground">Proposals only — nothing changes unless you choose to act on it. Fitness guidance, not medical advice.</p>
          </Card>
        </>
      )}
    </div>
  );
}
