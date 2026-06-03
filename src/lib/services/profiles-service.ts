// All DB queries for profiles — Rule 03: no raw Supabase calls in actions/components.

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole, AppDomain } from "@/lib/types/database";

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

/** Fetch the current user's profile. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return getProfileById(user.id);
}

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

/** Fetch all active non-guest users for the subtask assignee picker (any role, any domain). */
export async function getAssignableUsers(): Promise<
  { id: string; full_name: string; avatar_url: string | null; role: UserRole; domain: AppDomain }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, domain")
    .eq("is_active", true)
    .neq("role", "guest")
    .order("full_name", { ascending: true });

  if (error || !data) return [];
  return data as { id: string; full_name: string; avatar_url: string | null; role: UserRole; domain: AppDomain }[];
}
