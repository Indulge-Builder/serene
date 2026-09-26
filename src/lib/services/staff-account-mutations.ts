// staff-account-mutations.ts — THE context-free core behind "create a Serene account for a
// teammate" (2026-09-26). Both the admin Create form (actions/profiles.ts createUser) and the
// roster onboarding script (scripts/admin/onboard-roster.ts) call this ONE function, so a fix
// here reaches both. No `server-only` chain: it runs from a laptop script too.
//
// What it owns:
//   - the seat pre-check: a queen / joker seat with a live holder (SIA_SINGLE_SEATS; bishops are
//     many since 0242) is refused BEFORE the
//     auth call, with a named error (the partial unique index would otherwise surface as the
//     opaque "Database error creating new user");
//   - the auth.admin.createUser call (the 0201 signup trigger copies name / role / domain /
//     job_title / sia_role / queendom_id into public.profiles in the same transaction);
//   - the follow-up that lands phone (the trigger does not copy it) through the admin client;
//   - classifyAuthAdminError(): the ONE reading of Supabase Auth's admin errors. Auth says
//     "has already been registered" (code email_exists) for a duplicate — the old matcher looked
//     for "already registered" and every duplicate read as "Something went wrong".
//
// The caller gates (requireProfile(ROLES_CAN_CREATE_USER) in the action; a laptop with the
// service key for the script) and validates (Zod in the action; the script's own row checks).
// Text arrives here already sanitized and the phone already E.164.

import { createAdminClient } from "@/lib/supabase/admin";
import { getQueendomSeats } from "@/lib/services/queendom-seats";
import { SIA_SINGLE_SEATS, type SiaRole } from "@/lib/constants/sia-roles";
import type { AppDomain, Database, UserRole } from "@/lib/types/database";

export type StaffAccountInput = {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  domain: AppDomain;
  job_title: string | null;
  /** E.164, already normalised by the caller; null when unknown. */
  phone: string | null;
  sia_role: SiaRole | null;
  queendom_id: string | null;
};

export type StaffAccountError = "email_exists" | "seat_taken" | "db" | "unknown";

export type StaffAccountResult =
  | { ok: true; id: string }
  | { ok: false; error: StaffAccountError; detail: string };

type AuthAdminError = { message: string; code?: string; status?: number } | null | undefined;

/** THE reading of a Supabase Auth admin error (createUser / inviteUserByEmail). */
export function classifyAuthAdminError(error: AuthAdminError): StaffAccountError {
  if (!error) return "unknown";
  const m = error.message.toLowerCase();
  if (error.code === "email_exists" || (m.includes("already") && m.includes("registered"))) return "email_exists";
  // A constraint inside the signup trigger (today only the one-seat partial indexes can fire,
  // since the callers validate everything else) reaches us as an opaque database error.
  if (m.includes("idx_profiles_one_")) return "seat_taken";
  if (error.code === "unexpected_failure" || m.includes("database error")) return "db";
  return "unknown";
}

/** A seat that exactly one active account may hold: refuse before the auth call when it is held. */
async function seatIsHeld(siaRole: SiaRole | null, queendomId: string | null): Promise<boolean> {
  if (!siaRole || !queendomId) return false;
  if (!(SIA_SINGLE_SEATS as readonly string[]).includes(siaRole)) return false;
  const seats = await getQueendomSeats(queendomId);
  return Boolean(seats[siaRole as (typeof SIA_SINGLE_SEATS)[number]]);
}

/** Phone and job title land after the trigger, which copies neither. Admin client: the caller already gated. */
export async function fillStaffContactCore(
  id: string,
  fields: { phone?: string | null; job_title?: string | null },
): Promise<{ ok: boolean; detail: string | null }> {
  const patch: Database["public"]["Tables"]["profiles"]["Update"] = {};
  if (fields.phone !== undefined) patch.phone = fields.phone;
  if (fields.job_title !== undefined) patch.job_title = fields.job_title;
  if (Object.keys(patch).length === 0) return { ok: true, detail: null };
  const { error } = await createAdminClient().from("profiles").update(patch).eq("id", id);
  if (error) {
    console.error("[staff-account] contact update failed", id, error.message);
    return { ok: false, detail: error.message };
  }
  return { ok: true, detail: null };
}

export async function createStaffAccountCore(input: StaffAccountInput): Promise<StaffAccountResult> {
  if (await seatIsHeld(input.sia_role, input.queendom_id)) {
    return { ok: false, error: "seat_taken", detail: `${input.sia_role} of ${input.queendom_id} already held` };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.full_name,
      role: input.role,
      domain: input.domain,
      job_title: input.job_title,
      phone: input.phone,
      sia_role: input.sia_role,
      queendom_id: input.queendom_id,
    },
  });

  if (error || !data?.user) {
    const kind = classifyAuthAdminError(error);
    if (kind !== "email_exists") console.error("[staff-account] createUser failed", input.email, error?.code, error?.message);
    return { ok: false, error: kind, detail: error?.message ?? "no user returned" };
  }

  if (input.phone || input.job_title) {
    await fillStaffContactCore(data.user.id, { phone: input.phone, job_title: input.job_title });
  }
  return { ok: true, id: data.user.id };
}
