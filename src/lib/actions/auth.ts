"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { formErrors } from "@/lib/validations/form-errors";
import { forgotPasswordSchema, updatePasswordSchema } from "@/lib/validations/auth";

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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Always return success — never reveal whether the email exists (Rule S-09).
  // redirectTo receives token_hash + type=recovery params from Supabase — no
  // PKCE code_verifier cookie required, so the link works from any browser/device.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/api/auth/callback?next=/update-password`,
  });

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
