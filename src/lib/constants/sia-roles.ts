// constants/sia-roles.ts — THE Sia (concierge) role vocabulary (migration 0194).
//
// A queendom is the unit: queen > bishop > genies, plus one joker (the creative arm). These
// are `profiles.sia_role` values; they sit BESIDE `profiles.role` (the platform role that
// authorises routes) — a bishop is a `manager`, a genie an `agent`, in `domain = concierge`.
// Decided with the founder 2026-09-15 (client-ticket-plan.md 7.0).

import { defineEnum } from "@/lib/constants/define-enum";

export const SIA_ROLES = defineEnum([
  { id: "queen",  label: "Queen" },
  { id: "bishop", label: "Bishop" },
  { id: "genie",  label: "Genie" },
  { id: "joker",  label: "Joker" },
] as const);
export type SiaRole = (typeof SIA_ROLES.values)[number];

/** The platform role each Sia role maps onto when an account is created from the roster. */
export const SIA_ROLE_PLATFORM_ROLE: Record<SiaRole, "manager" | "agent"> = {
  queen:  "manager",
  bishop: "manager",
  genie:  "agent",
  joker:  "agent",
};

/** The three queendoms seeded by 0194; slugs are the join key the import scripts use. */
export const QUEENDOM_SLUGS = ["anishqa", "ananyshree", "sanika"] as const;
export type QueendomSlug = (typeof QUEENDOM_SLUGS)[number];

export const CLIENTS_PATH = "/clients";
/** The client's finance page (membership money today; Zoho wallet, invoices and payments with M2). */
export function clientFinancePath(clientId: string): string {
  return `${CLIENTS_PATH}/${clientId}/finance`;
}
/** The /clients list page size (server-filtered; ~450 members today). */
export const CLIENTS_LIST_PAGE_SIZE = 50;
