// Sia ticketing types — hand-declared until `gen types` runs after migration 0195 (the
// freshdesk.ts posture). Shapes mirror the migration EXACTLY. Vocabulary: constants/tickets.ts.

import type { TicketBrief } from "@/lib/validations/ticket-schema";
import type {
  TicketActorKind, TicketCategory, TicketChecklistItem, TicketLinkKind, TicketOrigin, TicketPriority,
  TicketResolution, TicketStatus,
} from "@/lib/constants/tickets";

export type TicketMoney = {
  quote_inr?: number | null;
  cost_inr?: number | null;
  price_inr?: number | null;
  currency?: string | null;
  tax_mode?: string | null;
  payment_status?: "not_started" | "requested" | "paid" | "waived" | null;
  zoho_ref?: string | null;
  invoice_no?: string | null;
};

export type TicketRow = {
  id: string;
  ticket_no: string;
  member_id: string;
  queendom_id: string | null;
  origin: TicketOrigin;
  origin_ref: Record<string, unknown>;
  group_jid: string | null;
  category: TicketCategory;
  sub_category: string | null;
  item: string | null;
  title: string;
  brief: TicketBrief;
  checklist: TicketChecklistItem[];
  priority: TicketPriority;
  priority_approved_at: string | null;
  priority_approved_by: string | null;
  status: TicketStatus;
  requested_for: string | null;
  first_response_due_at: string | null;
  next_update_due_at: string | null;
  resolve_due_at: string | null;
  first_responded_at: string | null;
  last_member_update_at: string | null;
  assignee_id: string | null;
  bishop_id: string | null;
  handoff_department: string | null;
  vendor_id: string | null;
  money: TicketMoney;
  /** 0200 */
  tags: string[];
  summary: string | null;
  created_by: string | null;
  created_by_kind: "human" | "elaya" | "intake" | "import";
  proposed_by_run_id: string | null;
  sentinel_state: Record<string, unknown>;
  next_wake_at: string | null;
  wake_reason: string | null;
  closed_at: string | null;
  resolution: TicketResolution | null;
  satisfaction: number | null;
  freshdesk_id: number | null;
  created_at: string;
  updated_at: string;
};

/** The sentinel's memory (sia.tickets.sentinel_state); see services/ticket-sentinel.ts. */
export type SentinelState = {
  version: 1;
  wakes: number;
  last_wake_at?: string;
  /** The newest non-sentinel event it has read, and the newest linked message. */
  last_event_at?: string;
  last_link_at?: string;
  /** Rule key → when it fired. A rule fires once per key; the key carries what changed. */
  fired: Record<string, string>;
  reads: number;
  tokens_in: number;
  tokens_out: number;
  last_read_at?: string;
  last_tone?: "praise" | "neutral" | "frustrated" | "angry";
  /** Brief changes the reader proposed and nobody has applied yet. */
  proposed_brief?: Record<string, unknown>;
  /**
   * The judgement (plan 7.6): a status move the sentinel SUGGESTS and a human approves or
   * dismisses. One at a time. It is only live while the ticket is still in `from_status`;
   * any status change makes it stale, and the next wake drops it.
   */
  proposal?: { status: TicketStatus; from_status: TicketStatus; reason: string; at: string; run_id: string | null };
};

export type TicketEventRow = {
  id: string;
  ticket_id: string;
  member_id: string;
  queendom_id: string | null;
  actor_kind: TicketActorKind;
  actor_id: string | null;
  event_type: string;
  body: string | null;
  meta: Record<string, unknown>;
  run_id: string | null;
  created_at: string;
};

export type TicketMessageLinkRow = {
  id: string;
  ticket_id: string | null;
  freshdesk_id: number | null;
  chat_jid: string;
  wa_message_id: string;
  sender_jid: string;
  link_kind: TicketLinkKind;
  confidence: number;
  run_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type TicketSlaPolicyRow = {
  id: string;
  queendom_id: string | null;
  category: string | null;
  sub_category: string | null;
  priority: TicketPriority | null;
  tier: string | null;
  first_response_min: number;
  update_cadence_min: number;
  vendor_silence_min: number;
  member_silence_min: number;
  resolve_target_min: number;
  business_hours: boolean;
  escalation: { after_min: number; to: string }[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type GenieRosterRow = {
  profile_id: string;
  queendom_id: string | null;
  shifts: Record<string, [string, string][]>;
  capacity: number;
  specialities: Record<string, number>;
  languages: string[];
  is_on_leave: boolean;
  leave_until: string | null;
  updated_at: string;
};

type Table<Row, Insert = Partial<Row>> = { Row: Row; Insert: Insert; Update: Partial<Row>; Relationships: [] };

/** The ticketing tables for the cast member until the generated Database carries them. */
export type TicketingDatabase = {
  public: {
    Tables: { task_ticket_meta: Table<{ task_id: string; ticket_id: string }> };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
  sia: {
    Tables: {
      tickets: Table<TicketRow>;
      ticket_events: Table<TicketEventRow, Omit<TicketEventRow, "id" | "created_at"> & { created_at?: string }>;
      ticket_message_links: Table<TicketMessageLinkRow, Omit<TicketMessageLinkRow, "id" | "created_at" | "confidence" | "run_id" | "created_by"> & { confidence?: number; run_id?: string | null; created_by?: string | null }>;
      ticket_sla_policies: Table<TicketSlaPolicyRow, Omit<TicketSlaPolicyRow, "id" | "created_at" | "updated_at"> & { id?: string }>;
      ticket_settings: Table<TicketSettingsRow, Omit<TicketSettingsRow, "updated_at"> & { updated_at?: string }>;
      genie_roster: Table<GenieRosterRow>;
      queendoms: Table<{ id: string; name: string; slug: string; freshdesk_group_id: number | null; is_active: boolean; created_at: string; updated_at: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      create_ticket: { Args: { p_ticket: Record<string, unknown>; p_event: Record<string, unknown> }; Returns: TicketRow };
      apply_ticket_change: { Args: { p_ticket_id: string; p_patch: Record<string, unknown>; p_event: Record<string, unknown> }; Returns: TicketRow };
      /** 0199 — due tickets, leased to this worker. */
      claim_sentinel_wakes: { Args: { p_limit?: number; p_lease_min?: number; p_ticket_id?: string | null }; Returns: TicketRow[] };
      /** 0199 — write the state and the next alarm, no event. */
      sentinel_sleep: { Args: { p_ticket_id: string; p_state: Record<string, unknown>; p_next_wake_at: string | null; p_wake_reason: string | null }; Returns: null };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ─── Page shapes ─────────────────────────────────────────────────────────────

export type TicketListItem = TicketRow & {
  member_name: string;
  assignee_name: string | null;
  queendom_name: string | null;
};

export type TicketListFilters = {
  status: TicketStatus[];
  queendom: string | null;
  assignee: string | null;
  category: TicketCategory | null;
  tag: string | null;
  search: string | null;
  mine: boolean;
  page: number;
};

/** sia.ticket_settings, resolved: the labels the app shows and the tag vocabulary. */
export type TicketSettings = {
  statusLabels: Record<TicketStatus, string>;
  /** Raw overrides as stored (only the statuses the founder renamed). */
  statusOverrides: Record<string, string>;
  tags: string[];
};

export type TicketSettingsRow = { key: string; value: Record<string, unknown> | unknown[]; updated_by: string | null; updated_at: string };

export type StaffOption = { id: string; full_name: string; sia_role: string | null };

export type LinkedMessage = TicketMessageLinkRow & { text: string | null; sender_name: string | null; wa_timestamp: string | null; from_me: boolean };

export type TicketDetail = {
  ticket: TicketRow;
  member: { id: string; full_name: string; primary_phone: string | null; queendom_id: string | null };
  events: (TicketEventRow & { actor_name: string | null })[];
  links: LinkedMessage[];
  assignee: StaffOption | null;
  bishop: StaffOption | null;
  staff: StaffOption[];
  tasks: { id: string; title: string; status: string; due_at: string | null; assigned_to: string | null }[];
  policy: TicketSlaPolicyRow | null;
};

/** What the help window shows beside a ticket (from the member twin and the mirror). */
export type TicketHelp = {
  facts: { facet: string; key: string; value: string; polarity: string }[];
  addresses: { key: string; value: string }[];
  dislikes: string[];
  health: number | null;
  similarTickets: { id: number; subject: string; status_label: string | null; agent_name: string | null; fd_created_at: string; resolved_at: string | null }[];
  anticipations: { title: string; due_at: string }[];
  openTickets: { id: string; ticket_no: string; title: string; status: TicketStatus }[];
};

/** The ticket creator's draft. */
export type TicketDraft = {
  category: TicketCategory;
  sub_category: string | null;
  title: string;
  brief: TicketBrief;
  priority: TicketPriority;
  priority_reason: string;
  requested_for: string | null;
  acknowledgement: string;
  vendor_terms: string[];
  confidence: number;
  run_id: string | null;
};
