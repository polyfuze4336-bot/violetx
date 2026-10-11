"use server";

import { revalidatePath } from "next/cache";

import { passwordResetService } from "@/lib/services/passwordReset";
import { userAdminService } from "@/lib/services/userAdmin";
import { registrationService } from "@/lib/services/registration";
import { runAction, type ActionResult } from "@/lib/actions/helpers";
import {
  requestResetSchema,
  resetPasswordSchema,
  type ChangePasswordInput,
  type RegisterInput,
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

export async function registerAction(input: RegisterInput): Promise<ActionResult<{ email: string }>> {
  return runAction(() => registrationService.register(input));
}

export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult> {
  return runAction(() => registrationService.changePassword(input));
}
