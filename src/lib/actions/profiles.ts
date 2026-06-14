"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createUserSchema,
  updateProfileSchema,
  updateAuthorizationSchema,
  toggleUserActiveSchema,
  inviteUserSchema,
  updateProfileAvatarSchema,
} from "@/lib/validations/profile-schema";
import { formErrors } from "@/lib/validations/form-errors";
import {
  updateProfileFields,
  updateAuthorization,
  setProfileActive,
  isUsernameTaken,
  getAssignableUsers,
} from "@/lib/services/profiles-service";
import { requireProfile } from "@/lib/actions/_auth";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeToE164 } from "@/lib/utils/phone";
import type { ActionResult, Profile, AppDomain, AssignableUser } from "@/lib/types";
import { ROLES_CAN_CREATE_USER } from "@/lib/constants/roles";

// ─────────────────────────────────────────────────────────
// createUser
// Creates a new auth.users row via the Supabase Admin API.
// The on_auth_user_created trigger handles profiles insertion.
// ─────────────────────────────────────────────────────────
export async function createUser(
  _prevState: ActionResult<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  // Rule 02 — Zod validation first, always.
  const parsed = createUserSchema.safeParse({
    full_name: formData.get("full_name"),
    email:     formData.get("email"),
    password:  formData.get("password"),
    role:      formData.get("role"),
    domain:    formData.get("domain"),
    job_title: formData.get("job_title"),
    phone:     formData.get("phone"),
  });

  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { data: null, error: mapProfileError(code) };
  }

  // Rule 09 — authorization reads from public.profiles only.
  const auth = await requireProfile(ROLES_CAN_CREATE_USER);
  if (!auth.ok) return auth.result;

  const { full_name, email, password, role, domain, job_title, phone } = parsed.data;

  // Rule 06 — sanitize text before DB write.
  const sanitizedName     = sanitizeText(full_name);
  const sanitizedJobTitle = job_title ? sanitizeText(job_title) : null;

  let normalizedPhone: string | null = null;
  if (phone) {
    try {
      normalizedPhone = normalizeToE164(phone, "IN");
    } catch {
      return { data: null, error: formErrors.phoneInvalid };
    }
  }

  const adminClient = createAdminClient();
  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name:  sanitizedName,
      role,
      domain,
      job_title:  sanitizedJobTitle,
      phone:      normalizedPhone,
    },
  });

  if (authError) {
    if (authError.message.toLowerCase().includes("already registered")) {
      return { data: null, error: formErrors.emailUnavailable };
    }
    return { data: null, error: formErrors.generic };
  }

  // If phone or job_title were provided, update profile after trigger fires.
  // The trigger only sets full_name, role, domain from metadata.
  if (normalizedPhone || sanitizedJobTitle) {
    await updateProfileFields(authUser.user.id, {
      phone:     normalizedPhone,
      job_title: sanitizedJobTitle,
    });
  }

  revalidatePath("/admin/users");
  return { data: { id: authUser.user.id }, error: null };
}

// ─────────────────────────────────────────────────────────
// updateProfile
// Updates non-authorization fields on a profile.
// Users can update their own; admin/founder can update anyone.
// ─────────────────────────────────────────────────────────
export async function updateProfile(
  _prevState: ActionResult<Profile>,
  formData: FormData,
): Promise<ActionResult<Profile>> {
  // formData.get() returns null for absent keys; Zod .optional() only accepts
  // undefined (not null). ?? undefined normalises absent fields so Zod treats
  // them as optional, which lets ThemeSelector send only {id, theme} without
  // the other fields failing validation.
  const parsed = updateProfileSchema.safeParse({
    id:        formData.get("id")        ?? undefined,
    full_name: formData.get("full_name") ?? undefined,
    username:  formData.get("username")  ?? undefined,
    job_title: formData.get("job_title") ?? undefined,
    phone:     formData.get("phone")     ?? undefined,
    theme:     formData.get("theme")     ?? undefined,
    app_icon:  formData.get("app_icon")  ?? undefined,
    timezone:  formData.get("timezone")  ?? undefined,
  });

  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { data: null, error: mapProfileError(code) };
  }

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const isOwnProfile = caller.id === parsed.data.id;
  const isPrivileged = ["admin", "founder"].includes(caller.role);

  if (!isOwnProfile && !isPrivileged) {
    return { data: null, error: formErrors.unauthorized };
  }

  const { id, full_name, username, job_title, phone, theme, app_icon, timezone } = parsed.data;

  // Username uniqueness check (DB constraint is backup; app check gives better UX).
  if (username) {
    const taken = await isUsernameTaken(username, id);
    if (taken) return { data: null, error: formErrors.usernameUnavailable };
  }

  let normalizedPhone: string | null = null;
  if (phone) {
    try {
      normalizedPhone = normalizeToE164(phone, "IN");
    } catch {
      return { data: null, error: formErrors.phoneInvalid };
    }
  }

  const fields: Parameters<typeof updateProfileFields>[1] = {};
  if (full_name !== undefined) fields.full_name = sanitizeText(full_name);
  if (username  !== undefined) fields.username  = username;
  if (job_title !== undefined) fields.job_title = job_title ? sanitizeText(job_title) : null;
  if (phone     !== undefined) fields.phone     = normalizedPhone;
  if (theme     !== undefined) fields.theme     = theme;
  if (app_icon  !== undefined) fields.app_icon  = app_icon;
  if (timezone  !== undefined) fields.timezone  = timezone;

  const result = await updateProfileFields(id, fields);

  if (result.error) {
    console.error("[updateProfile] DB error:", result.error);
    return { data: null, error: formErrors.generic };
  }

  revalidatePath("/profile");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return { data: result.data, error: null };
}

// ─────────────────────────────────────────────────────────
// updateUserAuthorization
// Admin/founder only — updates role and domain.
// ─────────────────────────────────────────────────────────
export async function updateUserAuthorization(
  _prevState: ActionResult<Profile>,
  formData: FormData,
): Promise<ActionResult<Profile>> {
  const parsed = updateAuthorizationSchema.safeParse({
    id:     formData.get("id"),
    role:   formData.get("role"),
    domain: formData.get("domain"),
  });

  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { data: null, error: mapProfileError(code) };
  }

  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;

  const result = await updateAuthorization(
    parsed.data.id,
    parsed.data.role as Parameters<typeof updateAuthorization>[1],
    parsed.data.domain as Parameters<typeof updateAuthorization>[2],
  );

  if (result.error) return { data: null, error: formErrors.generic };

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.id}`);
  return { data: result.data, error: null };
}

// ─────────────────────────────────────────────────────────
// toggleUserActive
// Deactivates or reactivates a user.
// Admin/founder only.
// ─────────────────────────────────────────────────────────
export async function toggleUserActive(
  formData: FormData,
): Promise<ActionResult<Profile>> {
  const parsed = toggleUserActiveSchema.safeParse({
    id:        formData.get("id"),
    is_active: formData.get("is_active") === "true",
  });

  if (!parsed.success) {
    return { data: null, error: formErrors.generic };
  }

  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;

  const result = await setProfileActive(parsed.data.id, parsed.data.is_active);
  if (result.error) return { data: null, error: formErrors.generic };

  revalidatePath("/admin/users");
  return { data: result.data, error: null };
}

// ─────────────────────────────────────────────────────────
// inviteUser
// Sends a magic-link invite via Supabase Auth.
// Profile is created by the on_auth_user_created trigger
// when the invited user completes sign-up.
// ─────────────────────────────────────────────────────────
export async function inviteUser(
  _prevState: ActionResult<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = inviteUserSchema.safeParse({
    full_name: formData.get("full_name"),
    email:     formData.get("email"),
    role:      formData.get("role"),
    domain:    formData.get("domain"),
    job_title: formData.get("job_title"),
  });

  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { data: null, error: mapProfileError(code) };
  }

  const auth = await requireProfile(ROLES_CAN_CREATE_USER);
  if (!auth.ok) return auth.result;

  const { full_name, email, role, domain, job_title } = parsed.data;

  const sanitizedName     = sanitizeText(full_name);
  const sanitizedJobTitle = job_title ? sanitizeText(job_title) : null;

  const adminClient = createAdminClient();
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      data: {
        full_name:  sanitizedName,
        role,
        domain,
        job_title:  sanitizedJobTitle,
      },
    },
  );

  if (inviteError) {
    if (inviteError.message.toLowerCase().includes("already registered")) {
      return { data: null, error: formErrors.emailUnavailable };
    }
    return { data: null, error: formErrors.generic };
  }

  revalidatePath("/admin/users");
  return { data: { id: inviteData.user.id }, error: null };
}

// ─────────────────────────────────────────────────────────
// updateProfileAvatar
// Updates the avatar_url on the caller's own profile.
// The actual file upload happens client-side via Supabase Storage;
// this action only persists the resulting public URL to the DB.
// ─────────────────────────────────────────────────────────
export async function updateProfileAvatar(
  _prevState: ActionResult<Profile>,
  formData: FormData,
): Promise<ActionResult<Profile>> {
  const parsed = updateProfileAvatarSchema.safeParse({
    id:         formData.get("id"),
    avatar_url: formData.get("avatar_url"),
  });

  if (!parsed.success) {
    return { data: null, error: formErrors.generic };
  }

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const isOwnProfile = caller.id === parsed.data.id;
  const isPrivileged = ["admin", "founder"].includes(caller.role);
  if (!isOwnProfile && !isPrivileged) {
    return { data: null, error: formErrors.unauthorized };
  }

  const result = await updateProfileFields(parsed.data.id, {
    avatar_url: parsed.data.avatar_url,
  });

  if (result.error) return { data: null, error: formErrors.generic };

  revalidatePath("/profile");
  return { data: result.data, error: null };
}

// ─────────────────────────────────────────────────────────
// getAssignableUsersAction
// THE client-callable assignable-users read (dry-audit M-11).
// No domain → all active non-guest users, any role, any domain
// (subtask assignee pickers — available to all roles).
// With domain → admin/founder get every active user in that domain;
// everyone else gets that domain's agents only (assignment pools).
// ─────────────────────────────────────────────────────────
export async function getAssignableUsersAction(
  domain?: AppDomain,
): Promise<ActionResult<AssignableUser[]>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  const agentsOnly =
    domain !== undefined && !["admin", "founder"].includes(auth.profile.role);

  const users = await getAssignableUsers(domain ? { domain, agentsOnly } : {});
  return { data: users, error: null };
}

// ─────────────────────────────────────────────────────────
// signOutUser
// Signs the current user out and redirects to /login.
// ─────────────────────────────────────────────────────────
export async function signOutUser(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ─────────────────────────────────────────────────────────
// mapProfileError — internal
// Maps Zod issue codes to user-facing messages.
// ─────────────────────────────────────────────────────────
function mapProfileError(code: string | undefined): string {
  switch (code) {
    case "full_name_required":     return formErrors.fullNameRequired;
    case "full_name_too_long":     return formErrors.fullNameTooLong;
    case "email_required":         return formErrors.required;
    case "email_invalid":          return formErrors.email;
    case "password_too_short":     return formErrors.passwordTooShort;
    case "password_too_long":      return formErrors.passwordTooLong;
    case "role_invalid":           return formErrors.roleInvalid;
    case "domain_invalid":         return formErrors.domainInvalid;
    case "job_title_too_long":     return formErrors.jobTitleTooLong;
    case "username_too_short":     return formErrors.usernameTooShort;
    case "username_too_long":      return formErrors.usernameTooLong;
    case "username_invalid_chars": return formErrors.usernameInvalidChars;
    default:                       return formErrors.generic;
  }
}
