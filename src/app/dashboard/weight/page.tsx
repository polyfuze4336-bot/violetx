import { Weight } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { deleteBodyWeightAction } from "@/lib/actions/bodyWeight";
import { formatDate } from "@/lib/format";
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
import { WeightForm } from "@/components/weight/weight-form";
import { showsOwnerUi } from "@/lib/rbac";

export default async function WeightPage() {
  const viewer = await requireAuth();
  const isOwner = showsOwnerUi(viewer.role);
  const entries = viewer.athleteId ? await bodyWeightService.list() : [];

  const history = [...entries].reverse();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Body weight"
        description="Track body weight over time."
      />

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a weigh-in</CardTitle>
          </CardHeader>
          <CardContent>
            <WeightForm />
          </CardContent>
        </Card>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={Weight}
          title={isOwner ? "No weigh-ins yet" : "No weight recorded yet"}
          description={
            isOwner
              ? "Add your first weight above, or import a WhatsApp update."
              : "Body weight trends will appear here once the athlete records data."
          }
          action={isOwner ? <ImportWorkoutButton label="Import Update" /> : undefined}
        />
      ) : (
        <>
          <TrendChartCard
            title="Body weight"
            unit="kg"
            color={1}
            goalLowerIsBetter
            points={entries.map((e) => ({ date: e.date, value: e.weightKg }))}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Note</TableHead>
                    {isOwner && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{formatDate(e.date)}</TableCell>
                      <TableCell className="font-medium">
                        {e.weightKg} kg
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
                      <TableCell className="text-muted-foreground">
                        {e.note ?? "—"}
                      </TableCell>
                      {isOwner && (
                        <TableCell>
                          <ConfirmDeleteButton
                            onConfirm={deleteBodyWeightAction.bind(null, e.id)}
                            title="Delete this weigh-in?"
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
