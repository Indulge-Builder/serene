// THE Sia watcher-resilience vocabulary (migration 0249, docs/architecture/sia-resilience-plan.md).
// The SQL CHECKs and the connector's constants mirror these; change them together.

/** elaya_settings rows. */
export const SIA_WATCHER_SETTING_KEYS = {
  /** The standby number's WhatsApp jid (`<digits>@s.whatsapp.net`), or null when none is set. */
  standbyJid: "sia_standby_jid",
  /** The daily standby-coverage check. ON unless the row is false. */
  membershipCheckEnabled: "sia_membership_check_enabled",
  /** The most the history re-profile may spend in total, USD. */
  historyReprofileCapUsd: "sia_history_reprofile_cap_usd",
} as const;

/** The cap when the settings row is missing or is not a number. */
export const SIA_HISTORY_REPROFILE_CAP_USD_DEFAULT = 60;

/** Messages read per page while walking an import (one conversation rarely spans a page). */
export const SIA_HISTORY_PAGE = 600;

/** A sender the chat-export import could not match to a person (scripts/sia/import-chat-export.ts). */
export const SIA_UNRESOLVED_SENDER_SUFFIX = "@unresolved";

/** Why a session was put on the shelf (sia.wag_auth_state_shelf.reason). */
export const SIA_SHELF_REASONS = ["change_number", "repair", "swap"] as const;
export type SiaShelfReason = (typeof SIA_SHELF_REASONS)[number];

export const SIA_SHELF_REASON_LABELS: Record<SiaShelfReason, string> = {
  change_number: "Number changed",
  repair: "Re-paired",
  swap: "Swapped out on a restore",
};

/** Closes in a row at which a 403 means banned. Mirrors BAN_REFUSALS in connector/src/index.ts. */
export const SIA_BAN_REFUSALS = 3;

/** How many missing groups the coverage notification names before "and N more". */
export const SIA_COVERAGE_NAMED_GROUPS = 8;

/** A phone in E.164 (`+9198…`) → the WhatsApp jid the connector stores for it. */
export function phoneToWhatsAppJid(e164: string): string {
  return `${e164.replace(/\D/g, "")}@s.whatsapp.net`;
}

/** The reverse, for display: `9198…@s.whatsapp.net` → `+9198…`. Null for a hidden id (`@lid`). */
export function whatsAppJidToPhone(jid: string | null | undefined): string | null {
  if (!jid || !jid.endsWith("@s.whatsapp.net")) return null;
  const digits = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}
