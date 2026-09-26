// types/hands.ts — hand-declared row types for the `hands` schema (migration 0245), the
// TicketingDatabase / FreshdeskDatabase posture: the generated database.ts does not carry the
// schema until the next regen, so handsDb() casts onto this. Types only, no runtime values.

import type { HandsDirection, HandsFrame, HandsMessageKind, HandsOutboxSource, HandsOutboxStatus, HandsThreadKind, HandsThreadStatus } from "@/lib/constants/hands";

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type HandsAllowedContactRow = {
  jid: string;
  label: string;
  vendor_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export type HandsThreadRow = {
  id: string;
  jid: string;
  kind: HandsThreadKind;
  ticket_id: string | null;
  vendor_id: string | null;
  queendom_id: string | null;
  status: HandsThreadStatus;
  opened_by: string | null;
  opened_at: string;
  closed_at: string | null;
  last_message_at: string | null;
  last_direction: HandsDirection | null;
  last_preview: string | null;
};

/** A payment ask read off the agent's QR line, and its settlement by a person. */
export type HandsPayment = {
  amount_inr: number | null;
  payee: string | null;
  expires_at: string | null;
  paid_at?: string | null;
  paid_by?: string | null;
  paid_amount_inr?: number | null;
};

export type HandsMessageRow = {
  id: string;
  thread_id: string | null;
  jid: string;
  wa_message_id: string;
  direction: HandsDirection;
  kind: HandsMessageKind;
  text: string | null;
  media_path: string | null;
  media_mime: string | null;
  wa_timestamp: string;
  frame: HandsFrame | null;
  payment: HandsPayment | null;
  outbox_id: string | null;
  raw: Record<string, unknown>;
  created_at: string;
};

export type HandsOutboxRow = {
  id: string;
  thread_id: string;
  jid: string;
  text: string;
  requested_by: string | null;
  source: HandsOutboxSource;
  disclosure: Record<string, unknown>;
  status: HandsOutboxStatus;
  requested_at: string;
  attempted_at: string | null;
  sent_at: string | null;
  wa_message_id: string | null;
  error: string | null;
};

export type HandsConnectorStatusRow = {
  id: number;
  beat_at: string;
  state: "pairing" | "connecting" | "connected" | "logged_out";
  connected: boolean;
  state_since: string;
  account_jid: string | null;
  qr: string | null;
  qr_at: string | null;
};

export type HandsDatabase = {
  hands: {
    Tables: {
      auth_state:       Table<{ key: string; value: unknown; updated_at: string }, { key: string; value: unknown }>;
      connector_status: Table<HandsConnectorStatusRow, Partial<HandsConnectorStatusRow> & { id: number }>;
      allowed_contacts: Table<HandsAllowedContactRow, Omit<HandsAllowedContactRow, "created_at" | "is_active"> & { is_active?: boolean }>;
      threads:          Table<HandsThreadRow, Pick<HandsThreadRow, "jid" | "kind"> & Partial<HandsThreadRow>>;
      raw_events:       Table<{ id: number; received_at: string; event_type: string; payload: unknown }, { event_type: string; payload: unknown }>;
      messages:         Table<HandsMessageRow, Omit<HandsMessageRow, "id" | "created_at" | "raw" | "frame" | "payment" | "media_path" | "media_mime" | "thread_id" | "outbox_id"> & Partial<Pick<HandsMessageRow, "raw" | "frame" | "payment" | "media_path" | "media_mime" | "thread_id" | "outbox_id">>>;
      outbox:           Table<HandsOutboxRow, Pick<HandsOutboxRow, "thread_id" | "jid" | "text" | "source"> & Partial<HandsOutboxRow>>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
