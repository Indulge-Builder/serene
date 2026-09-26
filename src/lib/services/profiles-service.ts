// All DB queries for profiles — Rule 03: no raw Supabase calls in actions/components.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalizePhone } from "@/lib/utils/phone";
import { nameMatchesFuzzy } from "@/lib/utils/fuzzy";
import type { Database, Profile, UserRole, AppDomain } from "@/lib/types/database";
import type { AssignableUser } from "@/lib/types";
import { mapRows } from "@/lib/utils/rows";
import { getQueendoms } from "@/lib/services/members-service";
import type { QueendomSummary } from "@/lib/types/member";
import { isSiaRole, SIA_SINGLE_SEATS, type SiaRole } from "@/lib/constants/sia-roles";

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
/**
 * First-name tokens of every active staff member — the Deepgram keyword-boost
 * list for Elaya voice notes (transcription-service layer 1: hear "Arfam"
 * correctly instead of minting "Arapham"). Admin client (sessionless webhook
 * path); tiny table; fails soft to [] — a roster miss must never block a
 * transcription.
 */
export async function getActiveStaffFirstNames(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("is_active", true)
    .neq("role", "guest")
    .limit(200);
  if (error || !data) {
    if (error) console.warn("[profiles-service] staff-name boost read failed:", error.message);
    return [];
  }
  const names = new Set<string>();
  for (const row of data as { full_name: string | null }[]) {
    const first = (row.full_name ?? "").trim().split(/\s+/)[0];
    if (first && first.length >= 3) names.add(first);
  }
  return [...names];
}

export type TeammateSearchResult = {
  users: AssignableUser[];
  /** true = no exact/substring hit; these are SOUND-ALIKE matches (voice-artifact
   *  names: "Arapham" → "Arfam"). The caller must confirm before assigning. */
  fuzzy: boolean;
};

export async function searchTeammatesForElaya(
  search: string,
  scopeDomain?: AppDomain | null,
): Promise<TeammateSearchResult> {
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
    return { users: [], fuzzy: false };
  }
  if (data.length > 0 || !term) return { users: data as AssignableUser[], fuzzy: false };

  // PHONETIC FALLBACK — the voice-artifact path. STT mangles names ("Arapham"
  // for "Arfam", real transcript 2026-08), and a substring match finds nothing
  // for those. The staff table is tiny, so fetch all active and rank in code
  // via nameMatchesFuzzy (soundex + edit distance, lib/utils/fuzzy.ts). Results
  // are flagged fuzzy: the tool layer tells the model to CONFIRM the person
  // before assigning — a sound-alike guess must never silently pick a target.
  let allQuery = supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, domain")
    .eq("is_active", true)
    .neq("role", "guest");
  if (scopeDomain) allQuery = allQuery.eq("domain", scopeDomain);
  const { data: all, error: allError } = await allQuery
    .order("full_name", { ascending: true })
    .limit(200);
  if (allError || !all) {
    if (allError) {
      console.error("[profiles-service] teammate fuzzy fallback failed:", allError.message);
    }
    return { users: [], fuzzy: false };
  }
  const matches = (all as AssignableUser[]).filter((u) => nameMatchesFuzzy(u.full_name, term));
  return { users: matches.slice(0, 5), fuzzy: matches.length > 0 };
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
 * and every Async child share ONE identity check + ONE profile SELECT.
 * Server actions are separate requests and always re-verify fresh.
 *
 * Identity = `auth.getClaims()` (2026-09-16, perf: the auth floor). The access
 * token's ES256 signature is verified locally against the process-cached JWKS
 * — the same check the proxy already runs — instead of `getUser()`'s
 * ~80–100 ms auth-server round trip on every navigation. Nothing about
 * AUTHORIZATION changed: role / domain / is_active still come from the
 * profiles row below (Rule 09 — the token's claims are never trusted for
 * them), and a deactivated profile is cut off on the very next request. The
 * auth-side revoke lives in setProfileActive (ban on deactivate) so a
 * deactivated user's session cannot refresh either.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) return null;
  return getProfileById(userId);
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
    | 'appearance'
    | 'timezone'
    | 'is_on_leave'
    | 'avatar_url'
  >>,
): Promise<{ data: Profile | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    // `appearance` (migration 0158) is absent from the generated Update type
    // until the next database.ts regen — the cast bridges the seam, same
    // interim posture as the documented post-migration RPC casts.
    .update(fields as Database["public"]["Tables"]["profiles"]["Update"])
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
  position: { sia_role: SiaRole | null; queendom_id: string | null } = { sia_role: null, queendom_id: null },
): Promise<{ data: Profile | null; error: string | null; code?: string }> {
  const supabase = await createClient();
  // The position layer is written WITH role + domain, always: leaving Concierge clears it
  // (the caller passes nulls), and the 0201 CHECKs refuse any other combination.
  const { data, error } = await supabase
    .from("profiles")
    .update({ role, domain, sia_role: position.sia_role, queendom_id: position.queendom_id })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message, code: error.code };
  return { data: data as Profile, error: null };
}

// ─── The queendom roster (0194 / 0201) ────────────────────────────────────────

export type QueendomRosterMember = Pick<Profile, "id" | "full_name" | "avatar_url" | "is_active" | "is_on_leave"> & { sia_role: SiaRole };
export type QueendomRoster = {
  queendom: QueendomSummary;
  /** The single seats (queen, joker). */
  seats: Record<(typeof SIA_SINGLE_SEATS)[number], QueendomRosterMember | null>;
  /** Bishops are many since 0242, like genies. */
  bishops: QueendomRosterMember[];
  genies: QueendomRosterMember[];
};

/**
 * Every queendom with who holds each seat — derived from profiles (the ONE record of a seat
 * since 0201 dropped the seat columns). Session client: profiles are readable by every
 * signed-in user, queendoms too; the admin page gate decides who sees the card.
 */
export const getQueendomRoster = cache(async (): Promise<QueendomRoster[]> => {
  const supabase = await createClient();
  const [queendoms, { data, error }] = await Promise.all([
    getQueendoms(),
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, is_active, is_on_leave, sia_role, queendom_id")
      .not("queendom_id", "is", null)
      .not("sia_role", "is", null)
      .order("full_name"),
  ]);
  if (error) {
    console.error("[profiles-service] roster read failed", error.message);
    return [];
  }
  type Row = Pick<Profile, "id" | "full_name" | "avatar_url" | "is_active" | "is_on_leave" | "sia_role" | "queendom_id">;
  const rows = mapRows<Row, Row>(data, (r) => r).filter((r) => isSiaRole(r.sia_role));
  return queendoms.map((queendom) => {
    const mine = rows.filter((r) => r.queendom_id === queendom.id) as (Row & { sia_role: SiaRole })[];
    const seat = (role: SiaRole) => mine.find((r) => r.sia_role === role && r.is_active) ?? mine.find((r) => r.sia_role === role) ?? null;
    return {
      queendom,
      seats: { queen: seat("queen"), joker: seat("joker") },
      bishops: mine.filter((r) => r.sia_role === "bishop"),
      genies: mine.filter((r) => r.sia_role === "genie"),
    };
  });
});

/** Auth-side ban length on deactivation — effectively permanent (100 years);
 *  `'none'` lifts it on reactivation. The Supabase-documented revoke idiom. */
const DEACTIVATED_BAN_DURATION = "876600h";

/**
 * Toggle is_active on a profile.
 * Deactivating removes the user from all assignment pools immediately.
 *
 * Two layers (2026-09-16): the profiles row is THE kill switch — every
 * request re-reads it in getCurrentProfile, so a deactivated user is redirected
 * on their next navigation whatever their token says. The auth-side ban
 * (admin client, `ban_duration`) is the second layer: it stops the session
 * from REFRESHING, so a deactivated user's token dies at its expiry instead
 * of renewing forever, and blocks a fresh login. Reactivation lifts the ban.
 * The ban call is best-effort — the row flip already cut access; a failure
 * is logged, never surfaced as a failed toggle.
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

  const { error: banError } = await createAdminClient().auth.admin.updateUserById(id, {
    ban_duration: is_active ? "none" : DEACTIVATED_BAN_DURATION,
  });
  if (banError) {
    console.warn(
      `[profiles-service] auth ${is_active ? "unban" : "ban"} failed for ${id} (profile row already updated):`,
      banError.message,
    );
  }

  return { data: data as Profile, error: null };
}

/** THE domain decision-maker fan-out read (dry-audit S3): active profiles of the
 *  given roles in a domain, admin client (cross-user read — RLS would scope to
 *  the caller). Callers pick the column subset via `select`. */
export async function getDomainDecisionMakers<T = { id: string }>(
  domain: string,
  roles: string[] = ["manager", "admin", "founder"],
  select = "id",
): Promise<T[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(select)
    .eq("domain", domain as AppDomain)
    .in("role", roles as UserRole[])
    .eq("is_active", true);

  if (error) {
    console.warn("[profiles-service] getDomainDecisionMakers failed:", error.message);
    return [];
  }
  return (data ?? []) as T[];
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
