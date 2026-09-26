// constants/sia-roles.ts — THE Sia (concierge) role vocabulary (migration 0194).
//
// A queendom is the unit: one queen > bishops > genies, plus one joker (the creative arm). These
// are `profiles.sia_role` values; they sit BESIDE `profiles.role` (the platform role that
// authorises routes) — a bishop is a `manager`, a genie an `agent`, in `domain = concierge`.
// Decided with the founder 2026-09-15 (member-ticket-plan.md 7.0). Above the queendoms sits one
// company-wide seat, the Joker head (0244, 2026-09-26): no queendom of their own, the reach of a
// queen in every queendom, but not the vault's secrets and not members' money.

import { defineEnum } from "@/lib/constants/define-enum";
import type { AppDomain } from "@/lib/types/database";

export const SIA_ROLES = defineEnum([
  { id: "queen",  label: "Queen" },
  { id: "bishop", label: "Bishop" },
  { id: "genie",  label: "Genie" },
  { id: "joker",  label: "Joker" },
  { id: "joker_head", label: "Joker head" },
] as const);
export type SiaRole = (typeof SIA_ROLES.values)[number];

/** The platform role each Sia role maps onto when an account is created from the roster. */
export const SIA_ROLE_PLATFORM_ROLE: Record<SiaRole, "manager" | "agent"> = {
  queen:  "manager",
  bishop: "manager",
  genie:  "agent",
  joker:  "agent",
  // A manager so the head can hand tasks to the jokers (assigning to someone else is manager+).
  joker_head: "manager",
};

/** The single seats of a queendom: exactly one active holder each (0201 partial unique indexes).
 *  Bishops and genies are many (a queendom runs two bishops; 0242 dropped the one-bishop index). */
export const SIA_SINGLE_SEATS = ["queen", "joker"] as const satisfies readonly SiaRole[];

/**
 * DOMAIN_POSITIONS — which domains carry a "position" layer on top of the platform role
 * (the DOMAIN_DEAL_CONFIG / DOMAIN_INTERESTS pattern). Today only Concierge does. The user
 * forms read this: pick a domain → if it has positions, the Role select lists THEM and the
 * platform role is derived through SIA_ROLE_PLATFORM_ROLE (never picked by hand); no entry →
 * the plain platform-role select. Adding Shop positions later = one entry here + a CHECK
 * migration on profiles.sia_role. Never re-hardcode "concierge" in a form.
 */
export const DOMAIN_POSITIONS: Partial<Record<AppDomain, readonly SiaRole[]>> = {
  concierge: SIA_ROLES.values,
};
export function positionsForDomain(domain: string | null | undefined): readonly SiaRole[] {
  return (domain && DOMAIN_POSITIONS[domain as AppDomain]) || [];
}
export function isSiaRole(v: unknown): v is SiaRole {
  return typeof v === "string" && (SIA_ROLES.values as readonly string[]).includes(v);
}
/** The one domain whose positions live in a queendom today (the 0201 CHECK mirrors this). */
export const QUEENDOM_DOMAIN: AppDomain = "concierge";

/** Seats held ONCE across the whole company and tied to no queendom (0244: one active holder,
 *  queendom_id NULL). Today only the Joker head. */
export const COMPANY_WIDE_SEATS = ["joker_head"] as const satisfies readonly SiaRole[];

/** Does this position sit inside one queendom? True for queen / bishop / genie / joker; false
 *  for a company-wide seat. The forms ask for a queendom only when true; the 0244 CHECK
 *  (profiles_sia_role_needs_queendom) is the database mirror. */
export function seatNeedsQueendom(siaRole: string | null | undefined): boolean {
  return isSiaRole(siaRole) && !(COMPANY_WIDE_SEATS as readonly string[]).includes(siaRole);
}

/**
 * THE company-wide reach test (0244): an active concierge account in the Joker head seat reaches
 * every queendom the way a queen reaches hers, without being admin. The SQL twin is the extra
 * branch in can_access_member_queendom(). Keyed on the SEAT, never on a null queendom_id: every
 * account outside concierge has a null queendom, and an unseated concierge account must keep
 * seeing nothing. `is_active` absent = the caller only handles live sessions.
 */
export function isCompanyWideSeat(p: { domain?: string | null; sia_role?: string | null; is_active?: boolean | null }): boolean {
  return p.domain === QUEENDOM_DOMAIN && p.sia_role === "joker_head" && p.is_active !== false;
}

/** The three queendoms seeded by 0194; slugs are the join key the import scripts use. */
export const QUEENDOM_SLUGS = ["anishqa", "ananyshree", "sanika"] as const;
export type QueendomSlug = (typeof QUEENDOM_SLUGS)[number];

export const CLIENTS_PATH = "/members";

/** THE Sia page path + its deep link: /sia?group=<jid> opens that group's chat (the page
 *  validates the jid against the loaded groups; an unknown one just lands on the list). */
export const SIA_PATH = "/sia";
export const SIA_GROUP_PARAM = "group";
export function siaGroupHref(groupJid: string): string {
  return `${SIA_PATH}?${SIA_GROUP_PARAM}=${encodeURIComponent(groupJid)}`;
}
/** ?message=<wa_message_id> on top of the group: the chat opens and scrolls to that message (2026-09-26). */
export const SIA_MESSAGE_PARAM = "message";
export function siaMessageHref(groupJid: string, waMessageId: string): string {
  return `${siaGroupHref(groupJid)}&${SIA_MESSAGE_PARAM}=${encodeURIComponent(waMessageId)}`;
}
/** The member's finance page (membership money today; Zoho wallet, invoices and payments with M2). */
export function memberFinancePath(clientId: string): string {
  return `${CLIENTS_PATH}/${clientId}/finance`;
}
/** The /members list page size (server-filtered; ~450 members today). */
export const CLIENTS_LIST_PAGE_SIZE = 50;
