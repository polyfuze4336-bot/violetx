import { redirect } from "next/navigation";
import { Salad } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { nutritionService } from "@/lib/services/nutrition";
import { formatDate, formatNumber } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ConfirmDeleteButton } from "@/components/dashboard/delete-button";
import { MedicalDisclaimer } from "@/components/ai/medical-disclaimer";
import { NutritionForm } from "@/components/nutrition/nutrition-form";
import { deleteNutritionAction } from "@/lib/actions/nutrition";
import { NutritionTargetsForm } from "@/components/nutrition/nutrition-targets-form";
import { TargetBars } from "@/components/nutrition/target-bars";
import { SimpleBars } from "@/components/charts/simple-bars";
import { dayProgress, nutritionObservations, type WeekPoint } from "@/lib/nutrition-intel";
import { todayIso } from "@/lib/dates";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { analyticsService } from "@/lib/services/analytics";
import { showsOwnerUi } from "@/lib/rbac";

function cell(value: number | null, suffix = "") {
  return value === null ? "—" : `${formatNumber(value)}${suffix}`;
}

export default async function NutritionPage() {
  const viewer = await requireAuth();
  if (!showsOwnerUi(viewer.role)) redirect("/dashboard");

  const [entries, targets, weights, analytics] = viewer.athleteId
    ? await Promise.all([nutritionService.list(), nutritionService.getTargets(), bodyWeightService.list(), analyticsService.get("6M")])
    : [[], { calories: null, protein: null, carbohydrates: null, fat: null, waterL: null }, [], null];

  const today = todayIso();
  const asDay = (e: (typeof entries)[number]) => ({ date: e.entryDate, calories: e.calories, protein: e.protein, carbohydrates: e.carbohydrates, fat: e.fat, water: e.water });
  const progress = dayProgress(entries.filter((e) => e.entryDate.slice(0, 10) === today).map(asDay), targets);

  // Daily calorie totals for the last 14 logged days.
  const perDay = new Map<string, number>();
  for (const e of entries) if (e.calories !== null) perDay.set(e.entryDate.slice(0, 10), (perDay.get(e.entryDate.slice(0, 10)) ?? 0) + e.calories);
  const dailyChart = Array.from(perDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([d, calories]) => ({ label: formatDate(d).replace(/ \d{4}$/, ""), calories, target: targets.calories ?? 0 }));

  // Weekly points for descriptive observations.
  const weekKey = (iso: string) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10); };
  const weekMap = new Map<string, { days: Set<string>; cal: number[]; pro: number[]; wt: number[] }>();
  const slot = (k: string) => { const v = weekMap.get(k) ?? { days: new Set<string>(), cal: [], pro: [], wt: [] }; weekMap.set(k, v); return v; };
  for (const e of entries) { const s = slot(weekKey(e.entryDate)); s.days.add(e.entryDate.slice(0, 10)); if (e.calories !== null) s.cal.push(e.calories); if (e.protein !== null) s.pro.push(e.protein); }
  for (const w of weights) slot(weekKey(w.date)).wt.push(w.weightKg);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const weekPoints: WeekPoint[] = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: k, daysLogged: v.days.size, avgCalories: mean(v.cal), avgProtein: mean(v.pro), avgWeightKg: mean(v.wt), workouts: analytics?.buckets.find((b) => b.key === k)?.workouts ?? 0 }));
  const observations = nutritionObservations(weekPoints);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nutrition"
        description="Optionally log nutrition and get general guidance from Violet."
      />

      <MedicalDisclaimer />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <TargetBars rows={progress} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Targets</CardTitle>
          </CardHeader>
          <CardContent>
            <NutritionTargetsForm targets={targets} />
          </CardContent>
        </Card>
      </div>

      {dailyChart.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calories (last logged days)</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBars data={dailyChart} xKey="label" series={[{ key: "calories", name: "Calories", color: 1 }, ...(targets.calories ? [{ key: "target", name: "Target", color: 5 }] : [])]} legend height={200} />
            {observations.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t pt-3 text-sm text-muted-foreground">
                {observations.map((o) => (
                  <li key={o}>• {o}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log nutrition</CardTitle>
          <CardDescription>
            All fields are optional — track only what you find useful.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NutritionForm />
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          icon={Salad}
          title="No nutrition logged yet"
          description="Add your first entry above. Nutrition is optional and never required for the rest of the app."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent entries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Calories</TableHead>
                  <TableHead>Protein</TableHead>
                  <TableHead>Carbs</TableHead>
                  <TableHead>Fat</TableHead>
                  <TableHead>Water</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.entryDate)}</TableCell>
                    <TableCell className="tabular-nums">{cell(e.calories)}</TableCell>
                    <TableCell className="tabular-nums">{cell(e.protein, "g")}</TableCell>
                    <TableCell className="tabular-nums">{cell(e.carbohydrates, "g")}</TableCell>
                    <TableCell className="tabular-nums">{cell(e.fat, "g")}</TableCell>
                    <TableCell className="tabular-nums">{cell(e.water, "L")}</TableCell>
                    <TableCell>
                      <ConfirmDeleteButton
                        onConfirm={deleteNutritionAction.bind(null, e.id)}
                        title="Delete this entry?"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
