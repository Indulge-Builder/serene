// sia-access.ts — THE answer to "what of Sia and Freshdesk may this person see".
//
// /sia and /freshdesk read through the admin client (wag_ RLS is deny by default; the
// freshdesk schema is service_role only), so the scope CANNOT come from RLS: it is decided
// here, once, and every page and action applies it. Plan decision 6 (member-ticket-plan.md
// section 11): a member belongs to one queendom, the whole queendom sees the member; admin and
// founder see all.
//
//   all       admin, founder, the tech workbench: every group, every ticket, the console
//   queendom  a SEATED concierge teammate (a Sia position AND a queendom): only the WhatsApp
//             groups linked to a member of their queendom, only the Freshdesk tickets in
//             their queendom's Freshdesk group. Read only: no console, no mapping. The Joker
//             head (0244) gets the same kind with EVERY active queendom in the lists: member
//             groups of every queendom and the queendoms' Freshdesk groups, never the internal
//             or unlinked groups, never the other Freshdesk groups, never the console
//   null      everyone else, including a concierge account nobody has seated yet
//
// The group -> queendom answer is always read from the database (wag_groups.member_id ->
// members.queendom_id), never taken from the browser.

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { QUEENDOM_DOMAIN, isCompanyWideSeat } from "@/lib/constants/sia-roles";
import { hasElevatedPageAccess } from "@/lib/utils/route-access";
import { mapRows } from "@/lib/utils/rows";
import type { AppDomain, UserRole } from "@/lib/types/database";

/** A seated teammate's lists hold their one queendom; the Joker head's hold every active one. */
export type SiaViewerScope =
  | { kind: "all" }
  | { kind: "queendom"; queendomIds: string[]; freshdeskGroupIds: number[] };

type ScopeProfile = { role: UserRole; domain: AppDomain; sia_role?: string | null; queendom_id?: string | null };

export async function getSiaViewerScope(profile: ScopeProfile): Promise<SiaViewerScope | null> {
  if (hasElevatedPageAccess(profile)) return { kind: "all" };
  if (profile.domain !== QUEENDOM_DOMAIN || !profile.sia_role) return null;
  const head = isCompanyWideSeat(profile);
  if (!head && !profile.queendom_id) return null;
  let q = createAdminClient().schema("sia").from("queendoms").select("id, freshdesk_group_id").eq("is_active", true);
  if (!head) q = q.eq("id", profile.queendom_id as string);
  const { data, error } = await q;
  if (error) return null;
  const rows = mapRows<{ id: string; freshdesk_group_id: number | null }, { id: string; freshdesk_group_id: number | null }>(data, (r) => r);
  if (rows.length === 0) return null;
  return {
    kind: "queendom",
    queendomIds: rows.map((r) => r.id),
    freshdeskGroupIds: rows.flatMap((r) => (r.freshdesk_group_id != null ? [Number(r.freshdesk_group_id)] : [])),
  };
}

/** Every WhatsApp group linked to a member of these queendoms (paged: the Joker head's list spans
 *  every member, and PostgREST stops a response at 1,000 rows). */
export async function getQueendomGroupJids(queendomIds: readonly string[]): Promise<Set<string>> {
  const admin = createAdminClient();
  const ids: string[] = [];
  for (let from = 0; queendomIds.length > 0; from += 1000) {
    const { data: members } = await memberDb(admin).from("members").select("id").in("queendom_id", [...queendomIds]).order("id").range(from, from + 999);
    const page = mapRows<{ id: string }, string>(members, (m) => m.id);
    ids.push(...page);
    if (page.length < 1000) break;
  }
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: groups } = await admin.schema("sia").from("wag_groups").select("group_jid").in("member_id", ids.slice(i, i + 150));
    mapRows<{ group_jid: string }, void>(groups, (g) => { out.add(g.group_jid); });
  }
  return out;
}

/** May this viewer open this one group? Fails closed: an unlinked group belongs to no queendom. */
export async function canViewSiaGroup(scope: SiaViewerScope, groupJid: string): Promise<boolean> {
  if (scope.kind === "all") return true;
  const admin = createAdminClient();
  const { data: g } = await admin.schema("sia").from("wag_groups").select("member_id").eq("group_jid", groupJid).maybeSingle();
  const memberId = (g as { member_id: string | null } | null)?.member_id;
  if (!memberId) return false;
  const { data: m } = await memberDb(admin).from("members").select("queendom_id").eq("id", memberId).maybeSingle();
  const queendomId = (m as { queendom_id: string | null } | null)?.queendom_id;
  return Boolean(queendomId) && scope.queendomIds.includes(queendomId as string);
}

/** May this viewer see this member's name and records? Same rule as the member page (canAccessMember). */
export async function canViewMember(scope: SiaViewerScope, memberId: string): Promise<boolean> {
  if (scope.kind === "all") return true;
  const { data } = await memberDb(createAdminClient()).from("members").select("queendom_id").eq("id", memberId).maybeSingle();
  const queendomId = (data as { queendom_id: string | null } | null)?.queendom_id;
  return Boolean(queendomId) && scope.queendomIds.includes(queendomId as string);
}

/**
 * The Freshdesk groups a viewer is pinned to: not pinned = every group. A seated teammate has
 * their queendom's one group; the Joker head has every queendom's group. An empty list has
 * nothing to see there; the caller sends them home.
 */
export function pinnedFreshdeskGroup(scope: SiaViewerScope): { pinned: false } | { pinned: true; groupIds: number[] } {
  return scope.kind === "all" ? { pinned: false } : { pinned: true, groupIds: scope.freshdeskGroupIds };
}

/** A pinned viewer's group filter: the asked group when it is one of theirs, otherwise every one
 *  of theirs (one group rides `group`, several ride `groupIn`). The page and Elaya both use it. */
export function pinnedGroupFilter(groupIds: readonly number[], asked: number | null | undefined): { group: number | null; groupIn: number[] | null } {
  if (asked != null && groupIds.includes(asked)) return { group: asked, groupIn: null };
  return groupIds.length === 1 ? { group: groupIds[0], groupIn: null } : { group: null, groupIn: [...groupIds] };
}
