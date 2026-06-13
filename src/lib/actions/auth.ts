"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { formErrors } from "@/lib/validations/form-errors";
import {
  forgotPasswordSchema,
  updatePasswordSchema,
  verifyResetOtpSchema,
} from "@/lib/validations/auth";

const loginSchema = z.object({
  email:    z.string().email("email_invalid"),
  password: z.string().min(1, "required"),
});

export async function loginAction(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const parsed = loginSchema.safeParse({
    email:    formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: formErrors.invalidCredentials };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email:    parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: formErrors.invalidCredentials };
  }

  // Reject deactivated accounts immediately — sign them out before any session cookie persists.
  const profile = await getCurrentProfile();
  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { error: formErrors.accountDeactivated };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prevState: { success: boolean; error: string | null } | null,
  formData: FormData,
): Promise<{ success: boolean; error: string | null }> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { success: false, error: formErrors.email };
  }

  const supabase = await createClient();

  // Always return success — never reveal whether the email exists (Rule S-09).
  //
  // OTP-code recovery (not a magic link): the email renders {{ .Token }}, a
  // 6-digit code the user types on /update-password. No verifying URL ships in
  // the email, so corporate inbox link-scanners (Google Workspace / Safe Links)
  // can't pre-fetch and burn the one-time token. `redirectTo` is intentionally
  // omitted — there is no link to follow. Verification happens in
  // verifyResetOtpAction via verifyOtp({ type: 'recovery' }).
  await supabase.auth.resetPasswordForEmail(parsed.data.email);

  // Carry the email forward so the code-entry step (step 1 of /update-password)
  // can run verifyOtp without asking for it again. Whether or not the address
  // exists, we always advance — never reveal account existence (Rule S-09).
  redirect(
    `/update-password?email=${encodeURIComponent(parsed.data.email)}`,
  );
}

export async function verifyResetOtpAction(
  _prevState: { success: boolean; error: string | null } | null,
  formData: FormData,
): Promise<{ success: boolean; error: string | null }> {
  const parsed = verifyResetOtpSchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return { success: false, error: formErrors.otpInvalid };
  }

  const supabase = await createClient();

  // Redeeming the recovery OTP establishes the auth session (sets the cookies),
  // which is what updatePasswordAction's updateUser() then relies on. A wrong or
  // expired code returns an error; never reveal which (Rule S-09).
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "recovery",
  });

  if (error) {
    return { success: false, error: formErrors.otpInvalid };
  }

  return { success: true, error: null };
}

export async function updatePasswordAction(
  _prevState: { success: boolean; error: string | null } | null,
  formData: FormData,
): Promise<{ success: boolean; error: string | null }> {
  const parsed = updatePasswordSchema.safeParse({
    password:        formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    if (firstError?.message === "passwordMismatch") {
      return { success: false, error: formErrors.passwordMismatch };
    }
    return { success: false, error: formErrors.passwordTooShort };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { success: false, error: formErrors.generic };
  }

  return { success: true, error: null };
}
