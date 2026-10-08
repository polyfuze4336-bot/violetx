import { Ruler } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { measurementService } from "@/lib/services/measurement";
import { deleteMeasurementEntryAction } from "@/lib/actions/measurement";
import { formatDate, formatMeasurement } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ImportWorkoutButton } from "@/components/dashboard/import-cta";
import { ConfirmDeleteButton } from "@/components/dashboard/delete-button";
import { TrendChartCard } from "@/components/charts/trend-chart-card";
import { MeasurementForm } from "@/components/measurements/measurement-form";
import { showsOwnerUi } from "@/lib/rbac";

function unitLabel(unit: string) {
  return unit === "INCH" ? "in" : "cm";
}

export default async function MeasurementsPage() {
  const viewer = await requireAuth();
  const isOwner = showsOwnerUi(viewer.role);

  const [types, entries, weights] = viewer.athleteId
    ? await Promise.all([
        measurementService.listTypes(),
        measurementService.listEntries(),
        bodyWeightService.list(),
      ])
    : [[], [], []];

  const byType = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byType.get(e.typeId) ?? [];
    list.push(e);
    byType.set(e.typeId, list);
  }

  const history = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const hasData = entries.length > 0 || weights.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Body measurements"
        description="Weight, waist, hip, chest and more — tracked over time."
      />

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a measurement</CardTitle>
          </CardHeader>
          <CardContent>
            <MeasurementForm types={types} />
          </CardContent>
        </Card>
      )}

      {!hasData ? (
        <EmptyState
          icon={Ruler}
          title={isOwner ? "No measurements yet" : "No measurements recorded yet"}
          description={
            isOwner
              ? "Add a reading above, or import your first WhatsApp update to start tracking."
              : "Body measurement trends will appear here once the athlete records data."
          }
          action={isOwner ? <ImportWorkoutButton label="Import Update" /> : undefined}
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {weights.length > 0 && (
              <TrendChartCard
                title="Body weight"
                unit="kg"
                color={1}
                goalLowerIsBetter
                points={weights.map((w) => ({
                  date: w.date,
                  value: w.weightKg,
                }))}
              />
            )}
            {types
              .filter((t) => (byType.get(t.id)?.length ?? 0) > 0)
              .map((t, i) => {
                const list = byType.get(t.id) ?? [];
                const unit = list[list.length - 1]?.unit ?? t.defaultUnit;
                return (
                  <TrendChartCard
                    key={t.id}
                    title={t.name}
                    unit={unitLabel(unit)}
                    color={(i % 4) + 2}
                    goalLowerIsBetter
                    points={list.map((e) => ({
                      date: e.date,
                      value: e.value,
                    }))}
                  />
                );
              })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">All readings</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Measurement</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Source</TableHead>
                    {isOwner && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{formatDate(e.date)}</TableCell>
                      <TableCell>{e.typeName}</TableCell>
                      <TableCell className="font-medium">
                        {formatMeasurement(e.value, e.unit)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            e.source === "WHATSAPP" ? "secondary" : "outline"
                          }
                        >
                          {e.source === "WHATSAPP" ? "WhatsApp" : "Manual"}
                        </Badge>
                      </TableCell>
                      {isOwner && (
                        <TableCell>
                          <ConfirmDeleteButton
                            onConfirm={deleteMeasurementEntryAction.bind(
                              null,
                              e.id
                            )}
                            title="Delete this reading?"
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
