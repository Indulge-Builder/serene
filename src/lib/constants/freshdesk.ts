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
  6: "Nudge Member",
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
    case 6: return "neutral";     // Nudge Member
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
// 2026-09-18: Freshdesk corrected the account to its Pro allowance: 400 calls a minute in
// total, BUT every ticket endpoint (list, view, conversations) reports its own sub-limit of
// 100 a minute in x-ratelimit-total, shared with the member app. The mirror only ever calls
// ticket endpoints, so 100 is its real ceiling; the reserve is what the member app keeps.
export const FD_RATE_RESERVE = 15;
export const FD_RUN_MAX_CALLS = 80;
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

// ─── Attachments (0197) ───────────────────────────────────────────────────────
/** The PRIVATE bucket every Freshdesk file and inline image is copied into. */
export const FRESHDESK_ATTACHMENT_BUCKET = "freshdesk-attachments";
/** Larger files are left as a name only (Freshdesk allows 20 MB per file; some legacy notes carry more). */
export const FD_ATTACHMENT_MAX_BYTES = 30 * 1024 * 1024;
/** A signed link lives an hour, like whatsapp-media. */
export const FD_ATTACHMENT_SIGNED_TTL_SECONDS = 3600;
/** Files copied per thread pull; a bigger thread finishes on its next pull (the backlog flag re-queues it). */
export const FD_MEDIA_PER_THREAD_MAX = 40;
/** How many backlog tickets the laptop loop queues per minute when run with --media. */
export const FD_MEDIA_FLAG_BATCH = 400;
/**
 * Parallelism of the copy (2026-09-16). The loop was serial at every level and ran ~8 backlog
 * tickets a minute against a 50-calls-a-minute allowance: the minute went to waiting on
 * downloads, not to Freshdesk. Files within a note download together, threads sync together,
 * and a cycle takes as many threads as the budget allows instead of a fixed 20.
 */
export const FD_MEDIA_COPY_CONCURRENCY = 6;
export const FD_THREAD_CONCURRENCY = 12;
export const FD_THREADS_PER_CYCLE = 300;

const FD_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/heic": "heic", "image/svg+xml": "svg",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav",
  "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc", "application/vnd.ms-excel": "xls", "application/zip": "zip",
};

/** The file extension for a Freshdesk attachment: from its name, else its type, else bin. */
export function fdAttachmentExt(name: string | undefined, contentType: string | undefined): string {
  const fromName = (name ?? "").match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase();
  return fromName ?? FD_EXT_BY_MIME[(contentType ?? "").toLowerCase()] ?? "bin";
}

/** What the page renders an attachment as. */
export function fdAttachmentKind(a: { name?: string; content_type?: string }): "image" | "video" | "audio" | "file" {
  const t = (a.content_type ?? "").toLowerCase();
  const ext = fdAttachmentExt(a.name, t);
  if (t.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "image";
  if (t.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return "video";
  if (t.startsWith("audio/") || ["mp3", "ogg", "m4a", "wav", "opus"].includes(ext)) return "audio";
  return "file";
}
