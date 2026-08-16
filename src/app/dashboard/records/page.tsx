import { Trophy } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { personalRecordService } from "@/lib/services/personalRecord";
import { formatDate, formatNumber } from "@/lib/format";
import {
  Card,
  CardContent,
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

export default async function RecordsPage() {
  const viewer = await requireAuth();
  const [records, prEvents] = viewer.athleteId
    ? await Promise.all([
        personalRecordService.list(),
        personalRecordService.prEvents(),
      ])
    : [[], []];

  const recent = prEvents.slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personal records"
        description="Best lifts per exercise, derived automatically from your history."
      />

      {records.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No records yet"
          description="Personal records appear once training sets are recorded."
        />
      ) : (
        <>
        {recent.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent achievements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {recent.map((e, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          e.type === "WEIGHT"
                            ? "rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
                            : "rounded-full bg-magenta/10 px-2.5 py-0.5 text-xs font-semibold text-magenta"
                        }
                      >
                        {e.type === "WEIGHT" ? "Max weight" : "Rep PR"}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{e.exerciseName}</p>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {formatNumber(e.weightKg)} kg × {e.reps} reps
                          {e.prevWeightKg !== null &&
                            e.type === "WEIGHT" &&
                            ` · prev ${formatNumber(e.prevWeightKg)} kg`}
                          {e.prevReps !== null &&
                            e.type === "REPS" &&
                            ` · prev ${e.prevReps} reps`}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(e.date)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By exercise</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exercise</TableHead>
                  <TableHead>Max weight</TableHead>
                  <TableHead>Max reps</TableHead>
                  <TableHead>Est. 1RM</TableHead>
                  <TableHead>Sets</TableHead>
                  <TableHead>Last done</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.exerciseId}>
                    <TableCell className="font-medium">
                      {r.exerciseName}
                    </TableCell>
                    <TableCell>
                      {r.maxWeightKg} kg
                      <span className="text-muted-foreground">
                        {" "}
                        × {r.maxWeightReps}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.maxReps}
                      <span className="text-muted-foreground">
                        {" "}
                        @ {r.maxRepsWeightKg} kg
                      </span>
                    </TableCell>
                    <TableCell>{r.estimatedOneRepMaxKg} kg</TableCell>
                    <TableCell>{r.totalSets}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.lastPerformed)}
                    </TableCell>
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
