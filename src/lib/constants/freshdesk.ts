// constants/freshdesk.ts — THE Freshdesk vocabulary as Serene mirrors it (migration 0193).
//
// Everything here was read from the live account on 2026-09-15 (GET /admin/ticket_fields/{id}).
// The mirror stores Freshdesk's integers as integers with NO CHECK; these maps are the
// display fallback when `freshdesk.ticket_fields` has not been synced yet. The synced
// choices always win (a new status appears in Freshdesk before it appears here).

export const FRESHDESK_PATH = "/freshdesk";

/** The /freshdesk list page size (server-filtered, keyset-free offset paging is fine at 55k rows). */
export const FRESHDESK_LIST_PAGE_SIZE = 50;

/** Freshdesk status id → agent-facing label. 9000 is the AI-agent parking status. */
export const FD_STATUS_LABELS: Record<number, string> = {
  2: "Open",
  3: "Pending",
  4: "Resolved",
  5: "Closed",
  6: "Nudge Client",
  7: "Nudge Vendor",
  8: "Ongoing Delivery",
  9: "Invoice Due",
  9000: "Assigned to AI Agent",
};

/** Statuses Freshdesk treats as done (stop_sla_timer + terminal). */
export const FD_TERMINAL_STATUSES: readonly number[] = [4, 5];

/** Statuses where the ball is with someone else (the SLA timer stops in Freshdesk). */
export const FD_WAITING_STATUSES: readonly number[] = [6, 8, 9, 9000];

/** A display tone per status — the pill colour family on the list and the dossier. */
export type FdStatusTone = "info" | "warning" | "success" | "neutral" | "danger";
export function fdStatusTone(status: number): FdStatusTone {
  switch (status) {
    case 2: return "info";        // Open
    case 3: return "warning";     // Pending (being worked)
    case 4: return "success";     // Resolved
    case 5: return "neutral";     // Closed
    case 6: return "neutral";     // Nudge Client
    case 7: return "warning";     // Nudge Vendor
    case 8: return "info";        // Ongoing Delivery
    case 9: return "danger";      // Invoice Due
    default: return "neutral";
  }
}

export const FD_PRIORITY_LABELS: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

export const FD_SOURCE_LABELS: Record<number, string> = {
  1: "Email",
  2: "Portal",
  3: "Phone",
  4: "Forum",
  6: "Facebook",
  7: "Chat",
  9: "Feedback Widget",
  10: "Outbound Email",
  11: "Ecommerce",
  12: "Bot",
  13: "WhatsApp",
  14: "Chat - Internal Task",
  19: "Facebook Message",
  20: "Facebook Comment",
};

/**
 * The top-level ticket fields whose flips are recorded in freshdesk.ticket_changes.
 * Custom fields are diffed generically as `cf.<name>` (every key of custom_fields).
 */
export const FD_TRACKED_FIELDS = [
  "status",
  "priority",
  "responder_id",
  "group_id",
  "ticket_type",
  "category",
  "sub_category",
  "classification",
  "subject",
  "due_by",
  "fr_due_by",
  "is_escalated",
  "fr_escalated",
  "spam",
  "deleted",
  "tags",
] as const;
export type FdTrackedField = (typeof FD_TRACKED_FIELDS)[number];

// ─── The sync budget ─────────────────────────────────────────────────────────
// The account allows 50 calls a minute (X-RateLimit-Total, measured 2026-09-15). The sync
// stops a run when the window has fewer than FD_RATE_RESERVE calls left (room for a human
// using the API or a stray integration) and never spends more than FD_RUN_MAX_CALLS in one
// run. Founder's call 2026-09-15: the mirror is the priority consumer of this allowance.
export const FD_RATE_RESERVE = 6;
export const FD_RUN_MAX_CALLS = 42;
/** How far behind the watermark an incremental poll re-reads (idempotent upserts absorb the overlap). */
export const FD_POLL_OVERLAP_MS = 3 * 60_000;
/** Freshdesk's list page cap (per_page max 100, at most 300 pages per query). */
export const FD_PAGE_SIZE = 100;
export const FD_MAX_PAGES = 300;
/** Reference data (groups, agents, fields, SLA policies) refresh cadence. */
export const FD_REFERENCE_TTL_MS = 6 * 60 * 60_000;
/** The backfill's starting watermark — earlier than the account (tickets start 2024-01-30). */
export const FD_BACKFILL_EPOCH = "2023-01-01T00:00:00Z";

/** Sync-state keys (freshdesk.sync_state.key). */
export const FD_SYNC_KEYS = {
  poll: "poll",
  backfill: "backfill",
  contacts: "contacts",
  reference: "reference",
} as const;

export function fdStatusLabel(status: number, synced?: Record<number, string> | null): string {
  return synced?.[status] ?? FD_STATUS_LABELS[status] ?? `Status ${status}`;
}
export function fdPriorityLabel(priority: number): string {
  return FD_PRIORITY_LABELS[priority] ?? `P${priority}`;
}
export function fdSourceLabel(source: number | null): string {
  if (source == null) return "—";
  return FD_SOURCE_LABELS[source] ?? `Source ${source}`;
}
