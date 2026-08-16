"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth";
import { measurementService } from "@/lib/services/measurement";
import { exerciseService } from "@/lib/services/exercise";
import { athleteService } from "@/lib/services/athlete";
import { importService, type ImportSummary } from "@/lib/services/import";
import { interpretMessage, type VioletInterpretation } from "@/ai/interpret";
import { detectInjection } from "@/ai/safety";
import { aiModelLabel, aiProviderLabel } from "@/ai/client";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import { trackEvent } from "@/lib/telemetry";
import type { Resolution, Unit } from "@/lib/schemas";

export interface VioletReply extends VioletInterpretation {
  provider: string;
}

export async function violetInterpretAction(
  text: string
): Promise<ActionResult<VioletReply>> {
  return runAction(async () => {
    await requireOwner();
    // Untrusted content: flag potential injection for telemetry only. The
    // interpreter never executes instructions — it only extracts data.
    if (detectInjection(text)) {
      trackEvent("ai.injection_flagged", { source: "violet" });
    }

    const [types, exercises, profile] = await Promise.all([
      measurementService.listTypes(),
      exerciseService.list(),
      athleteService.getProfile(),
    ]);

    const interpretation = interpretMessage(text, {
      measurementTypes: types.map((t) => ({
        name: t.name,
        defaultUnit: t.defaultUnit,
      })),
      defaultMeasurementUnit: profile.defaultMeasurementUnit,
      knownExercises: exercises.filter((e) => e.active).map((e) => e.name),
    });

    return { ...interpretation, provider: aiProviderLabel() };
  });
}

export interface VioletCommitInput {
  rawText: string;
  date: string;
  weight: { value: number; resolution: Resolution; confidence: number } | null;
  measurements: {
    name: string;
    value: number;
    unit: Unit;
    resolution: Resolution;
    confidence: number;
  }[];
  sets: {
    exercise: string;
    reps: number;
    weightKg: number;
    resolution: Resolution;
    confidence: number;
  }[];
}

export async function violetCommitAction(
  input: VioletCommitInput
): Promise<ActionResult<ImportSummary>> {
  const result = await runAction(async () => {
    const actor = await requireOwner();

    const summary = await importService.commit({
      rawText: input.rawText,
      date: new Date(input.date),
      weightKg: input.weight?.value,
      weightResolution: input.weight?.resolution ?? "IMPORT",
      measurements: input.measurements.map((m) => ({
        name: m.name,
        value: m.value,
        unit: m.unit,
        resolution: m.resolution,
      })),
      sets: input.sets.map((s) => ({
        exercise: s.exercise,
        reps: s.reps,
        weightKg: s.weightKg,
        resolution: s.resolution,
      })),
    });

    const actions: {
      actionType: string;
      payload: unknown;
      confidence: number | null;
    }[] = [];
    if (input.weight && input.weight.resolution !== "SKIP") {
      actions.push({
        actionType: "createBodyWeight",
        payload: { weightKg: input.weight.value, date: input.date },
        confidence: input.weight.confidence,
      });
    }
    for (const m of input.measurements) {
      if (m.resolution === "SKIP") continue;
      actions.push({
        actionType: "createMeasurement",
        payload: { name: m.name, value: m.value, unit: m.unit, date: input.date },
        confidence: m.confidence,
      });
    }
    for (const s of input.sets) {
      if (s.resolution === "SKIP") continue;
      actions.push({
        actionType: "createExercisePerformance",
        payload: {
          exercise: s.exercise,
          reps: s.reps,
          weightKg: s.weightKg,
          date: input.date,
        },
        confidence: s.confidence,
      });
    }

    await importService.attachAiAudit(
      summary.importBatchId,
      actor.userId,
      aiProviderLabel(),
      aiModelLabel(),
      actions
    );

    return summary;
  });

  if (result.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/weight");
    revalidatePath("/dashboard/measurements");
    revalidatePath("/dashboard/strength");
    revalidatePath("/dashboard/records");
    revalidatePath("/dashboard/history");
  }
  return result;
}
