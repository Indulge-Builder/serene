// All DB queries for profiles — Rule 03: no raw Supabase calls in actions/components.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, UserRole, AppDomain } from "@/lib/types/database";
import type { AssignableUser } from "@/lib/types";

/**
 * Resolve an ACTIVE staff profile by E.164 phone — THE WhatsApp staff-identity
 * lookup (Elaya routing gate). Admin client: called from the webhook context,
 * which has no session. Caller must pass an already-normalized number
 * (normalizeWaPhone); profiles.phone is stored E.164 via normalizeToE164.
 */
export async function getActiveProfileByPhone(normalizedPhone: string): Promise<Profile | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("phone", normalizedPhone)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[profiles-service] getActiveProfileByPhone failed:", error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
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
 * `domain`     — restrict to one domain.
 * `agentsOnly` — restrict to role 'agent' (lead/deal assignment pools).
 * Always sorted by full_name. Never fork another profiles query for
 * assignability — extend this one.
 */
export async function getAssignableUsers(
  options: { domain?: AppDomain; agentsOnly?: boolean } = {},
): Promise<AssignableUser[]> {
  return getAssignableUsersCached(options.domain ?? null, options.agentsOnly ?? false);
}

/**
 * React cache() memo behind getAssignableUsers (perf audit E-3) — the page and
 * its Async children (e.g. dossier wave 1 + LeadInfoCardAsync) share one query
 * per render pass. Primitive args only: cache() keys object args by reference,
 * so a fresh `options` literal per call site would never dedupe.
 * Deliberately NOT Redis-cached: profiles is tiny, and a 60s-stale assignee
 * list could offer a just-deactivated user in pickers.
 */
const getAssignableUsersCached = cache(
  async (domain: AppDomain | null, agentsOnly: boolean): Promise<AssignableUser[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role, domain")
      .eq("is_active", true)
      .neq("role", "guest");

    if (domain) query = query.eq("domain", domain);
    if (agentsOnly) query = query.eq("role", "agent");

    const { data, error } = await query.order("full_name", { ascending: true });

    if (error || !data) return [];
    return data as AssignableUser[];
  },
);
