// Freshdesk mirror row types — hand-declared until `supabase gen types typescript` is
// re-run after migration 0193 is applied (the vendor.ts posture). Shapes mirror the
// migration EXACTLY. Types only — no runtime values. Vocabulary: constants/freshdesk.ts.
//
// Also the API shapes (what developer.freshdesk.com/api/v2 returns), kept minimal: the
// sync stores the whole object in `raw`, so only the fields we normalise are typed.

// ─── Mirror rows ─────────────────────────────────────────────────────────────

export type FdTicketRow = {
  id: number;
  subject: string;
  description_text: string | null;
  status: number;
  status_label: string | null;
  priority: number;
  source: number | null;
  ticket_type: string | null;
  category: string | null;
  sub_category: string | null;
  classification: string | null;
  tags: string[];
  group_id: number | null;
  responder_id: number | null;
  internal_group_id: number | null;
  internal_agent_id: number | null;
  requester_id: number;
  company_id: number | null;
  product_id: number | null;
  requester_name: string | null;
  requester_phone_e164: string | null;
  member_id: string | null;
  due_by: string | null;
  fr_due_by: string | null;
  is_escalated: boolean;
  fr_escalated: boolean;
  spam: boolean;
  deleted: boolean;
  first_responded_at: string | null;
  agent_responded_at: string | null;
  requester_responded_at: string | null;
  status_updated_at: string | null;
  reopened_at: string | null;
  pending_since: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  custom_fields: Record<string, unknown>;
  raw: Record<string, unknown>;
  fd_created_at: string;
  fd_updated_at: string;
  first_synced_at: string;
  synced_at: string;
  conversations_synced_at: string | null;
  conversation_count: number;
  /** 0197: ticket-level files + the description's inline images. */
  attachments: FdAttachment[];
};

export type FdConversationRow = {
  id: number;
  ticket_id: number;
  user_id: number | null;
  incoming: boolean;
  private: boolean;
  source: number | null;
  category: number | null;
  body_text: string | null;
  body_html: string | null;
  from_email: string | null;
  to_emails: unknown[];
  attachments: FdAttachment[];
  raw: Record<string, unknown>;
  fd_created_at: string;
  fd_updated_at: string | null;
  synced_at: string;
  /** 0197: when the note's files were copied; NULL = the backlog. */
  media_synced_at: string | null;
  /**
   * 0214: when the vendor extractor last read this note; NULL = queued.
   * Set once and PRESERVED across thread re-syncs — the model read is the only
   * billed step in that pipeline, so clearing it re-bills the whole thread.
   */
  vendor_extracted_at: string | null;
  /** 0214: failed extraction reads; the queue stops offering a note at EXTRACT_MAX_ATTEMPTS. */
  vendor_extract_attempts: number;
};

export type FdContactRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  phone_e164: string | null;
  active: boolean;
  company_id: number | null;
  category: string | null;
  custom_fields: Record<string, unknown>;
  tags: string[];
  description: string | null;
  member_id: string | null;
  raw: Record<string, unknown>;
  fd_created_at: string | null;
  fd_updated_at: string | null;
  synced_at: string;
};

export type FdAgentRow = {
  id: number;
  name: string;
  email: string | null;
  job_title: string | null;
  agent_type: string | null;
  active: boolean;
  deactivated: boolean;
  available: boolean;
  last_active_at: string | null;
  profile_id: string | null;
  raw: Record<string, unknown>;
  fd_created_at: string | null;
  fd_updated_at: string | null;
  synced_at: string;
};

export type FdGroupRow = {
  id: number;
  name: string;
  description: string | null;
  business_hour_id: number | null;
  group_type: string | null;
  raw: Record<string, unknown>;
  fd_created_at: string | null;
  fd_updated_at: string | null;
  synced_at: string;
};

export type FdTicketFieldRow = {
  id: number;
  name: string;
  label: string;
  field_type: string;
  is_default: boolean;
  required_for_agents: boolean;
  choices: unknown | null;
  dependent_fields: unknown | null;
  raw: Record<string, unknown>;
  synced_at: string;
};

export type FdSlaPolicyRow = {
  id: number;
  name: string;
  active: boolean;
  is_default: boolean;
  position: number | null;
  sla_target: Record<string, unknown>;
  applicable_to: Record<string, unknown>;
  escalation: Record<string, unknown>;
  raw: Record<string, unknown>;
  fd_created_at: string | null;
  fd_updated_at: string | null;
  synced_at: string;
};

export type FdTicketChangeRow = {
  id: number;
  ticket_id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  fd_updated_at: string | null;
  observed_at: string;
  source: string;
};

export type FdWebhookEventRow = {
  id: number;
  event: string;
  ticket_id: number | null;
  payload: Record<string, unknown>;
  received_at: string;
  processed_at: string | null;
  error: string | null;
};

export type FdSyncStateRow = {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
};

export type FdSyncRunRow = {
  id: number;
  kind: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  api_calls: number;
  rate_remaining: number | null;
  tickets_seen: number;
  tickets_written: number;
  conversations_written: number;
  changes_written: number;
  error: string | null;
  detail: Record<string, unknown>;
};

type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};

/**
 * The hand-written schema shape for `createAdminClient().schema("freshdesk")`, so the
 * service is typed today. Delete this block and use the generated Database type once
 * `gen types` includes the freshdesk schema.
 */
export type FreshdeskDatabase = {
  freshdesk: {
    Tables: {
      tickets: Table<FdTicketRow, Omit<FdTicketRow, "first_synced_at" | "synced_at" | "attachments"> & { synced_at?: string; attachments?: FdAttachment[] }>;
      conversations: Table<FdConversationRow, Omit<FdConversationRow, "media_synced_at" | "vendor_extracted_at" | "vendor_extract_attempts"> & { media_synced_at?: string | null; vendor_extracted_at?: string | null; vendor_extract_attempts?: number }>;
      contacts: Table<FdContactRow>;
      agents: Table<FdAgentRow>;
      groups: Table<FdGroupRow>;
      ticket_fields: Table<FdTicketFieldRow>;
      sla_policies: Table<FdSlaPolicyRow>;
      ticket_changes: Table<FdTicketChangeRow, Omit<FdTicketChangeRow, "id" | "observed_at"> & { observed_at?: string }>;
      webhook_events: Table<FdWebhookEventRow, Omit<FdWebhookEventRow, "id" | "received_at" | "processed_at" | "error"> & { processed_at?: string | null; error?: string | null }>;
      sync_state: Table<FdSyncStateRow>;
      sync_runs: Table<FdSyncRunRow, Omit<FdSyncRunRow, "id" | "started_at"> & { started_at?: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      /** 0196 — the overview strip in one scan; args mirror FdTicketListFilters. */
      ticket_overview: {
        Args: {
          p_status?: number[] | null;
          p_group?: number | null;
          p_agent?: number | null;
          p_category?: string | null;
          p_priority?: number | null;
          p_from?: string | null;
          p_to?: string | null;
          p_search?: string | null;
          p_member?: string | null;
          p_today_start?: string | null;
        };
        Returns: FdOverviewRpcResult;
      };
      /** 0197 — the attachment backlog (distinct tickets, notes). */
      media_backlog: { Args: Record<string, never>; Returns: { tickets: number; conversations: number } };
      /** 0197 — queue up to p_limit backlog tickets for the thread catch-up; returns how many. */
      flag_threads_for_media: { Args: { p_limit?: number }; Returns: number };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ─── API shapes (developer.freshdesk.com/api/v2) ─────────────────────────────

export type FdAttachment = {
  id?: number;
  name?: string;
  content_type?: string;
  size?: number;
  /** Freshdesk's own link — expires in hours; never shown, only copied from. */
  attachment_url?: string;
  thumb_url?: string | null;
  created_at?: string;
  /** 0197: the path in the freshdesk-attachments bucket once copied. */
  storage_path?: string | null;
  /** True for an image pasted into the note body (not a file attachment). */
  inline?: boolean;
  stored_at?: string;
  /** Why the copy failed (kept so the note can still show the name). */
  store_error?: string;
  /** Filled by the read path: a one-hour signed link, never persisted. */
  signed_url?: string | null;
};

export type FdApiTicket = {
  id: number;
  subject: string | null;
  description?: string | null;
  description_text?: string | null;
  status: number;
  priority: number;
  source?: number | null;
  type?: string | null;
  tags?: string[] | null;
  group_id?: number | null;
  responder_id?: number | null;
  internal_group_id?: number | null;
  internal_agent_id?: number | null;
  requester_id: number;
  company_id?: number | null;
  product_id?: number | null;
  due_by?: string | null;
  fr_due_by?: string | null;
  is_escalated?: boolean | null;
  fr_escalated?: boolean | null;
  spam?: boolean | null;
  deleted?: boolean | null;
  created_at: string;
  updated_at: string;
  custom_fields?: Record<string, unknown> | null;
  stats?: {
    agent_responded_at?: string | null;
    requester_responded_at?: string | null;
    first_responded_at?: string | null;
    status_updated_at?: string | null;
    reopened_at?: string | null;
    resolved_at?: string | null;
    closed_at?: string | null;
    pending_since?: string | null;
  } | null;
  requester?: {
    id: number;
    name?: string | null;
    email?: string | null;
    mobile?: string | null;
    phone?: string | null;
  } | null;
  [key: string]: unknown;
};

export type FdApiConversation = {
  id: number;
  ticket_id: number;
  user_id?: number | null;
  incoming?: boolean | null;
  private?: boolean | null;
  source?: number | null;
  category?: number | null;
  body?: string | null;
  body_text?: string | null;
  from_email?: string | null;
  to_emails?: unknown[] | null;
  attachments?: FdAttachment[] | null;
  created_at: string;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type FdApiContact = {
  id: number;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  active?: boolean | null;
  company_id?: number | null;
  description?: string | null;
  tags?: string[] | null;
  custom_fields?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type FdApiAgent = {
  id: number;
  type?: string | null;
  available?: boolean | null;
  deactivated?: boolean | null;
  last_active_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  contact?: {
    name?: string | null;
    email?: string | null;
    job_title?: string | null;
    active?: boolean | null;
  } | null;
  [key: string]: unknown;
};

export type FdApiGroup = {
  id: number;
  name: string;
  description?: string | null;
  business_hour_id?: number | null;
  group_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type FdApiTicketField = {
  id: number;
  name: string;
  label: string;
  type: string;
  default?: boolean | null;
  required_for_agents?: boolean | null;
  choices?: unknown;
  dependent_fields?: unknown;
  [key: string]: unknown;
};

export type FdApiSlaPolicy = {
  id: number | string;
  name: string;
  active?: boolean | null;
  is_default?: boolean | null;
  position?: number | null;
  sla_target?: Record<string, unknown> | null;
  applicable_to?: Record<string, unknown> | null;
  escalation?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

// ─── Page shapes (what the /freshdesk reads return) ───────────────────────────

export type FdTicketListItem = Pick<
  FdTicketRow,
  | "id" | "subject" | "status" | "status_label" | "priority" | "source" | "ticket_type"
  | "category" | "sub_category" | "group_id" | "responder_id" | "requester_name" | "member_id"
  | "due_by" | "is_escalated" | "fd_created_at" | "fd_updated_at" | "resolved_at" | "conversation_count"
> & {
  group_name: string | null;
  agent_name: string | null;
};

export type FdTicketListFilters = {
  search: string | null;
  status: number[];
  group: number | null;
  agent: number | null;
  category: string | null;
  priority: number | null;
  dateFrom: string | null;   // ISO date (created)
  dateTo: string | null;
  /** Scope to one Serene member (the member page's "See tickets"); exact `member_id`. */
  member: string | null;
  page: number;
};

export type FdTicketDetail = {
  ticket: FdTicketRow;
  conversations: FdConversationRow[];
  changes: FdTicketChangeRow[];
  contact: FdContactRow | null;
  agent: FdAgentRow | null;
  group: FdGroupRow | null;
  /** id → name for every agent that appears in the thread. */
  agentNames: Record<number, string>;
  member: { id: string; full_name: string } | null;
};

/** What `freshdesk.ticket_overview` (0196) returns: one jsonb object. */
export type FdOverviewRpcResult = {
  by_status: { status: number; count: number }[];
  total: number;
  open: number;
  created_today: number;
  resolved_today: number;
  escalated_open: number;
};

/**
 * The overview strip. Every number describes the SAME set the table shows (the list
 * filters applied), except `byStatus`, which ignores the status filter so the pills show
 * the mix a status pick would narrow to. `filtered` = any filter is active (the last tile
 * reads "Matching" instead of "Mirrored").
 */
export type FdOverview = {
  byStatus: { status: number; label: string; count: number }[];
  openTotal: number;
  createdToday: number;
  resolvedToday: number;
  escalatedOpen: number;
  totalTickets: number;
  filtered: boolean;
  sync: FdSyncHealth;
};

export type FdSyncHealth = {
  lastPollAt: string | null;
  lastPollOk: boolean | null;
  lastError: string | null;
  watermark: string | null;
  backfillDone: boolean;
  backfillTicketsDone: number;
  threadsPending: number;
  rateRemaining: number | null;
  lastWebhookAt: string | null;
};
