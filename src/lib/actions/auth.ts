"use server";

import { revalidatePath } from "next/cache";

import { passwordResetService } from "@/lib/services/passwordReset";
import { userAdminService } from "@/lib/services/userAdmin";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import {
  requestResetSchema,
  resetPasswordSchema,
  type SetCoachInput,
} from "@/lib/schemas";

export async function requestPasswordResetAction(
  email: string
): Promise<ActionResult<{ devToken?: string }>> {
  return runAction(async () => {
    const { email: parsed } = requestResetSchema.parse({ email });
    return passwordResetService.requestReset(parsed);
  });
}

export async function resetPasswordAction(
  token: string,
  password: string
): Promise<ActionResult> {
  return runAction(async () => {
    const data = resetPasswordSchema.parse({ token, password });
    await passwordResetService.resetPassword(data.token, data.password);
  });
}

export async function setCoachAction(
  input: SetCoachInput
): Promise<ActionResult> {
  const result = await runAction(() => userAdminService.setCoach(input));
  if (result.ok) revalidatePath("/dashboard/settings");
  return result;
}
