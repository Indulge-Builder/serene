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
//             their queendom's Freshdesk group. Read only: no console, no mapping
//   null      everyone else, including a concierge account nobody has seated yet
//
// The group -> queendom answer is always read from the database (wag_groups.member_id ->
// members.queendom_id), never taken from the browser.

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { QUEENDOM_DOMAIN } from "@/lib/constants/sia-roles";
import { hasElevatedPageAccess } from "@/lib/utils/route-access";
import { mapRows } from "@/lib/utils/rows";
import type { AppDomain, UserRole } from "@/lib/types/database";

export type SiaViewerScope =
  | { kind: "all" }
  | { kind: "queendom"; queendomId: string; freshdeskGroupId: number | null };

type ScopeProfile = { role: UserRole; domain: AppDomain; sia_role?: string | null; queendom_id?: string | null };

export async function getSiaViewerScope(profile: ScopeProfile): Promise<SiaViewerScope | null> {
  if (hasElevatedPageAccess(profile)) return { kind: "all" };
  if (profile.domain !== QUEENDOM_DOMAIN || !profile.sia_role || !profile.queendom_id) return null;
  const { data, error } = await createAdminClient().schema("sia").from("queendoms")
    .select("id, freshdesk_group_id, is_active").eq("id", profile.queendom_id).maybeSingle();
  if (error || !data) return null;
  const q = data as { id: string; freshdesk_group_id: number | null; is_active: boolean };
  if (!q.is_active) return null;
  return { kind: "queendom", queendomId: q.id, freshdeskGroupId: q.freshdesk_group_id != null ? Number(q.freshdesk_group_id) : null };
}

/** Every WhatsApp group linked to a member of this queendom. */
export async function getQueendomGroupJids(queendomId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data: members } = await memberDb(admin).from("members").select("id").eq("queendom_id", queendomId).limit(5000);
  const ids = mapRows<{ id: string }, string>(members, (m) => m.id);
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
  return (m as { queendom_id: string | null } | null)?.queendom_id === scope.queendomId;
}

/** May this viewer see this member's name and records? Same rule as the member page (canAccessMember). */
export async function canViewMember(scope: SiaViewerScope, memberId: string): Promise<boolean> {
  if (scope.kind === "all") return true;
  const { data } = await memberDb(createAdminClient()).from("members").select("queendom_id").eq("id", memberId).maybeSingle();
  return (data as { queendom_id: string | null } | null)?.queendom_id === scope.queendomId;
}

/**
 * The Freshdesk group a viewer is pinned to: null = not pinned (sees every group). A queendom
 * viewer whose queendom has no Freshdesk group has nothing to see there; the caller sends them home.
 */
export function pinnedFreshdeskGroup(scope: SiaViewerScope): { pinned: false } | { pinned: true; groupId: number | null } {
  return scope.kind === "all" ? { pinned: false } : { pinned: true, groupId: scope.freshdeskGroupId };
}
