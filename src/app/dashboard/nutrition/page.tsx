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

function cell(value: number | null, suffix = "") {
  return value === null ? "—" : `${formatNumber(value)}${suffix}`;
}

export default async function NutritionPage() {
  const viewer = await requireAuth();
  if (viewer.role !== "OWNER") redirect("/dashboard");

  const entries = viewer.athleteId ? await nutritionService.list() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nutrition"
        description="Optionally log nutrition and get general guidance from Violet."
      />

      <MedicalDisclaimer />

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
