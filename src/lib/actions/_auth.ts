// THE session/role guard for server actions (Rule 09 — authorization reads
// only from public.profiles). Every session-based action begins with:
//
//   const auth = await requireProfile(['manager', 'admin', 'founder']);
//   if (!auth.ok) return auth.result;
//   const caller = auth.profile;
//
// `auth.result` is `{ data: null, error }` — assignable to any ActionResult<T>,
// so actions stay on the Rule-10 `{ data, error }` contract. Actions that return
// a non-ActionResult shape (e.g. bare arrays) ignore `result` and return their
// own empty value on `!auth.ok`.
//
// NOT for sla.ts — those actions run under Trigger.dev with no session;
// they correctly use createAdminClient(). Intentionally NOT marked "use server": this is an internal
// helper, never a client-callable endpoint.

import { getCurrentProfile } from "@/lib/services/profiles-service";
import { formErrors } from "@/lib/validations/form-errors";
import type { Profile, UserRole } from "@/lib/types";
import type { MutationActor } from "@/lib/services/lead-mutations";

export type RequireProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; result: { data: null; error: string } };

/**
 * Resolve the caller's profile and optionally gate on role.
 * Both failure modes (no session, role not allowed) return the unified
 * `formErrors.unauthorized` copy — never reveal which check failed.
 */
export async function requireProfile(
  roles?: readonly UserRole[],
): Promise<RequireProfileResult> {
  const profile = await getCurrentProfile();
  if (!profile || (roles && !roles.includes(profile.role))) {
    return { ok: false, result: { data: null, error: formErrors.unauthorized } };
  }
  return { ok: true, profile };
}

/**
 * THE session-profile → MutationActor mapper (R-01 — one definition; tasks.ts,
 * vendors.ts and every future action import it). The session caller IS the
 * principal here — an Elaya write tool builds the same shape from its principal.
 * Lives beside requireProfile because it is the actions-layer seam into the
 * *-mutations cores: `core(actorFromProfile(auth.profile), input)`.
 */
export function actorFromProfile(p: Profile): MutationActor {
  return {
    userId: p.id,
    role: p.role,
    domain: p.domain,
    fullName: p.full_name ?? "A teammate",
  };
}
