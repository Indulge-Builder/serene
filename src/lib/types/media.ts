// Hand-declared row types for Elaya's eyes (migration 0246). Fold onto the generated Rows at the
// next database.ts regen. Types only.
import type { MediaClass, MediaKind, MediaReadingStatus, MediaSource } from "@/lib/constants/media";

export type MediaReadingFields = {
  amount_inr?: number | null;
  currency?: string | null;
  date?: string | null;
  merchant?: string | null;
  booking_ref?: string | null;
  from?: string | null;
  to?: string | null;
  people_count?: number | null;
  [k: string]: unknown;
};

export type MediaReadingContext = {
  group_jid?: string; wa_message_id?: string; member_id?: string; at?: string;
  ticket_id?: number; conversation_id?: number;
  [k: string]: unknown;
};

export type MediaReadingRow = {
  id: string;
  source: MediaSource;
  source_ref: string;
  bucket: string | null;
  path: string;
  mime: string | null;
  kind: MediaKind;
  size_bytes: number | null;
  status: MediaReadingStatus;
  attempts: number;
  last_error: string | null;
  class: MediaClass | null;
  sensitive: boolean;
  summary: string | null;
  description: string | null;
  extracted_text: string | null;
  fields: MediaReadingFields;
  language: string | null;
  confidence: number | null;
  model: string | null;
  prompt_version: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  reprofiled_at: string | null;
  context: MediaReadingContext;
  created_at: string;
  read_at: string | null;
};

/** What a page or a model reader needs of a reading: the shape attached to a message. */
export type MediaReadingBrief = Pick<MediaReadingRow, "id" | "status" | "kind" | "class" | "sensitive" | "summary" | "confidence"> & { extracted_text: string | null };
