"use server";

import { revalidatePath } from "next/cache";

import {
  importService,
  type DuplicateReport,
  type ImportSummary,
} from "@/lib/services/import";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import type { CommitImportInput, FindDuplicatesInput } from "@/lib/schemas";

export async function checkImportDuplicatesAction(
  input: FindDuplicatesInput
): Promise<ActionResult<DuplicateReport>> {
  return runAction(() => importService.findDuplicates(input));
}

export async function commitImportAction(
  input: CommitImportInput
): Promise<ActionResult<ImportSummary>> {
  const result = await runAction(() => importService.commit(input));
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
