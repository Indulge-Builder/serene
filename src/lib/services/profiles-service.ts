// All DB queries for profiles — Rule 03: no raw Supabase calls in actions/components.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalizePhone } from "@/lib/utils/phone";
import type { Profile, UserRole, AppDomain } from "@/lib/types/database";
import type { AssignableUser } from "@/lib/types";

/**
 * Resolve an ACTIVE staff profile by phone — THE WhatsApp staff-identity lookup
 * (Elaya routing gate). Admin client: called from the webhook context, which has
 * no session. THIS IS A LOAD-BEARING MATCH: if it misses, the sender is treated as
 * an unknown number and the lead pipeline creates a LEAD for a staff member (the
 * "every agent who messages Elaya becomes a lead" bug). So it must tolerate phone
 * FORMAT DRIFT, not just an exact string.
 *
 * Gupshup sends a bare digits number (e.g. `919821032575`); profiles.phone is
 * stored E.164 with a `+` (e.g. `+919821032575`) — an exact `.eq` would miss on
 * any format difference. We match on the CANONICAL digits key on BOTH sides: the
 * same digits-only collapse `lead_phone_key()` / `canonicalizePhone()` use, so a
 * `+`, spaces, or a missing country code never silently demote a teammate to a
 * lead. (A staff member with a BLANK profiles.phone still can't match — there is
 * no number to compare; that is a data gap, fill the number on /admin/users.)
 */
export async function getActiveProfileByPhone(normalizedPhone: string): Promise<Profile | null> {
  const supabase = createAdminClient();

  // Fast path — exact match on the already-normalized number (the common case:
  // both sides E.164). Avoids scanning when the stored format already agrees.
  const exact = await supabase
    .from("profiles")
    .select("*")
    .eq("phone", normalizedPhone)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (exact.error) {
    console.error("[profiles-service] getActiveProfileByPhone (exact) failed:", exact.error.message);
    return null;
  }
  if (exact.data) return exact.data as Profile;

  // Canonical fallback — compare digits-only keys so format drift can't miss.
  // Fetch the small set of active staff that have ANY phone, then match in code
  // on canonicalizePhone() (identical key to the DB lead_phone_key()). The staff
  // table is tiny (tens of rows), so this is a cheap, exact-meaning comparison —
  // far safer than a brittle SQL LIKE on a formatted column.
  const wantKey = canonicalizePhone(normalizedPhone);
  if (!wantKey) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_active", true)
    .not("phone", "is", null);
  if (error) {
    console.error("[profiles-service] getActiveProfileByPhone (fallback) failed:", error.message);
    return null;
  }

  const match = ((data as Profile[] | null) ?? []).find(
    (p) => p.phone && canonicalizePhone(p.phone) === wantKey,
  );
  return match ?? null;
}

/**
 * Search ACTIVE staff by name for Elaya's find_teammate tool — THE channel-safe
 * teammate lookup (name → assignable user). ADMIN client + code-side scope: the
 * getActiveProfileByPhone precedent. `getAssignableUsers` uses the SESSION client
 * (profiles RLS = `auth.uid() IS NOT NULL`), so it returns ZERO rows on the
 * sessionless WhatsApp webhook — which made find_teammate say "can't find them" for
 * EVERY name on WhatsApp (the parity-rule trap). This twin works on both channels.
 *
 * Scope is by code, never RLS: `scopeDomain` null = all domains (founder/admin —
 * and managers, who assign across domains per the task rule); a domain = that domain
 * only (reserved for a future agent-narrowing). The per-action assignment gate
 * (manager+ to assign to another) stays in the write tool — this is a READ.
 */
export async function searchTeammatesForElaya(
  search: string,
  scopeDomain?: AppDomain | null,
): Promise<AssignableUser[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, domain")
    .eq("is_active", true)
    .neq("role", "guest");
  if (scopeDomain) query = query.eq("domain", scopeDomain);

  const term = search.trim();
  if (term) query = query.ilike("full_name", `%${term}%`);

  const { data, error } = await query.order("full_name", { ascending: true }).limit(20);
  if (error || !data) {
    if (error) console.error("[profiles-service] searchTeammatesForElaya failed:", error.message);
    return [];
  }
  return data as AssignableUser[];
}

/** Fetch a single profile by id. Returns null if not found. */
export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

/** Fetch all profiles — admin/founder only (enforced by RLS). */
export async function getAllProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true });

  if (error || !data) return [];
  return data as Profile[];
}

/** Fetch profiles filtered by domain. */
export async function getProfilesByDomain(domain: AppDomain): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("domain", domain)
    .order("full_name", { ascending: true });

  if (error || !data) return [];
  return data as Profile[];
}

/** Fetch profiles filtered by role. */
export async function getProfilesByRole(role: UserRole): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", role)
    .order("full_name", { ascending: true });

  if (error || !data) return [];
  return data as Profile[];
}

/** Fetch active agents in a given domain (used for round-robin). */
export async function getActiveAgentsByDomain(domain: AppDomain): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("domain", domain)
    .eq("role", "agent")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error || !data) return [];
  return data as Profile[];
}

/** Check if a username is already taken. */
export async function isUsernameTaken(
  username: string,
  excludeId?: string,
): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("id")
    .eq("username", username);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data } = await query.maybeSingle();
  return data !== null;
}

/**
 * Fetch the current user's profile.
 * Memoised with React cache() — within one RSC render pass the layout, page,
 * and every Async child share a single auth.getUser() round trip + profile
 * SELECT. Server actions are separate requests and always re-verify fresh.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return getProfileById(user.id);
});

/**
 * Update non-authorization profile fields.
 * Authorization fields (role, domain) are handled by updateAuthorization().
 */
export async function updateProfileFields(
  id: string,
  fields: Partial<Pick<Profile,
    | 'full_name'
    | 'username'
    | 'phone'
    | 'job_title'
    | 'theme'
    | 'app_icon'
    | 'timezone'
    | 'is_on_leave'
    | 'avatar_url'
  >>,
): Promise<{ data: Profile | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Profile, error: null };
}

/**
 * Update role and domain on a profile.
 * Requires admin or founder — enforced by RLS WITH CHECK clause.
 */
export async function updateAuthorization(
  id: string,
  role: UserRole,
  domain: AppDomain,
): Promise<{ data: Profile | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role, domain })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Profile, error: null };
}

/**
 * Toggle is_active on a profile.
 * Deactivating removes the user from all assignment pools immediately.
 */
export async function setProfileActive(
  id: string,
  is_active: boolean,
): Promise<{ data: Profile | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Profile, error: null };
}

/**
 * THE canonical "who can I assign this to?" query (dry-audit M-11).
 * Default (no options): all active non-guest users, any role, any domain
 * (subtask/Gia assignee pickers).
 * `domain` — restrict to one domain.
 * `roles`  — restrict to a specific role set (lead/deal assignment pools pass
 *            LEAD_ASSIGNABLE_ROLES = ['agent', 'manager'] from constants/roles).
 *            Empty array is treated as "no role filter" (same as omitting it).
 * Always sorted by full_name. Never fork another profiles query for
 * assignability — extend this one.
 */
export async function getAssignableUsers(
  options: { domain?: AppDomain; roles?: UserRole[] } = {},
): Promise<AssignableUser[]> {
  // Serialize roles to a stable primitive key — cache() keys object/array args
  // by reference, so a fresh array literal per call site would never dedupe.
  // Sort first so ['agent','manager'] and ['manager','agent'] share a slot.
  const rolesKey =
    options.roles && options.roles.length > 0
      ? [...options.roles].sort().join(",")
      : "";
  return getAssignableUsersCached(options.domain ?? null, rolesKey);
}

/**
 * React cache() memo behind getAssignableUsers (perf audit E-3) — the page and
 * its Async children (e.g. dossier wave 1 + LeadInfoCardAsync) share one query
 * per render pass. Primitive args only: cache() keys object args by reference,
 * so a fresh `options` literal per call site would never dedupe — `rolesKey`
 * is the sorted-comma-joined role set ("" = no role filter).
 * Deliberately NOT Redis-cached: profiles is tiny, and a 60s-stale assignee
 * list could offer a just-deactivated user in pickers.
 */
const getAssignableUsersCached = cache(
  async (domain: AppDomain | null, rolesKey: string): Promise<AssignableUser[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role, domain")
      .eq("is_active", true)
      .neq("role", "guest");

    if (domain) query = query.eq("domain", domain);
    // rolesKey is the sorted-comma-joined UserRole set (built in the public
    // wrapper from a typed UserRole[]) — split back to the column's enum type.
    if (rolesKey) query = query.in("role", rolesKey.split(",") as UserRole[]);

    const { data, error } = await query.order("full_name", { ascending: true });

    if (error || !data) return [];
    return data as AssignableUser[];
  },
);
