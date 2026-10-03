// WhatsApp type definitions — two categories:
// 1. Meta Cloud API payload shapes (exactly what Meta sends to the webhook)
// 2. App-internal types (DB row mirrors + enriched query shapes)
//
// No runtime values in this file. Types only.
// No default exports.

import type { LinkPreview } from "@/lib/utils/link-preview";

// ─────────────────────────────────────────────
// Meta Cloud API — inbound payload shapes
// ─────────────────────────────────────────────

export type MetaWebhookPayload = {
  object: string;
  entry:  MetaWebhookEntry[];
};

export type MetaWebhookEntry = {
  id:      string;
  changes: MetaWebhookChange[];
};

export type MetaWebhookChange = {
  value: MetaWebhookValue;
  field: string;
};

export type MetaWebhookValue = {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id:      string;
  };
  contacts?: MetaContact[];
  messages?: MetaInboundMessage[];
  statuses?: MetaStatusUpdate[];
};

export type MetaContact = {
  profile: { name: string };
  wa_id:   string;
};

// Discriminated union on `type` — TypeScript narrows correctly when
// checking message.type === 'text'. Do not flatten to a single optional-field object.
export type MetaInboundMessage =
  | { type: 'text';     id: string; from: string; timestamp: string; text: { body: string } }
  | { type: 'image';    id: string; from: string; timestamp: string; image:    MetaMediaObject }
  | { type: 'video';    id: string; from: string; timestamp: string; video:    MetaMediaObject }
  | { type: 'document'; id: string; from: string; timestamp: string; document: MetaMediaObject }
  | { type: 'audio';    id: string; from: string; timestamp: string; audio:    MetaMediaObject }
  // The event types that are NOT words (2026-10-02, cost audit P0 "reactions become paid
  // instructions"): they keep their real type to the routing gate, so a thumbs-up never runs a
  // brain turn, and a button press carries the option the person actually chose. The lead
  // pipeline stores them as a labelled text row (insertInboundMessage), as it always did.
  | { type: 'reaction';    id: string; from: string; timestamp: string; reaction: { emoji: string; message_id: string | null } }
  | { type: 'interactive'; id: string; from: string; timestamp: string; interactive: { kind: 'button_reply' | 'list_reply'; id: string | null; title: string } }
  | { type: 'unsupported'; id: string; from: string; timestamp: string; subtype: string; label: string };

export type MetaMediaObject = {
  id:        string;
  mime_type: string;
  sha256:    string;
  caption?:  string;
  url?:      string;
  filename?: string;
};

export type MetaStatusUpdate = {
  id:           string;
  status:       'sent' | 'delivered' | 'read' | 'failed';
  timestamp:    string;
  recipient_id: string;
};

export type MetaApiResponse = {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
};

export type TemplateComponent = {
  type:       'body' | 'header' | 'button';
  parameters: Array<{ type: 'text'; text: string }>;
};

// ─────────────────────────────────────────────
// App-internal types
// ─────────────────────────────────────────────

// Mirrors the whatsapp_conversations DB row, plus optional enrichment fields
// added by service layer queries (joined lead name/phone, computed unread count).
export type WhatsAppConversation = {
  id:              string;
  lead_id:         string;
  wa_id:           string;
  phone:           string;
  status:          'open' | 'resolved';
  last_message_at: string | null;
  bot_active:      boolean;
  bot_paused_by:   string | null;
  bot_paused_at:   string | null;
  /** The number it arrived on (0252): 'staff' (Serene) or 'public' (Indulge). */
  line:            'staff' | 'public';
  /** The public bot's own state (0252). It speaks only when bot_active AND bot_state = 'active'. */
  bot_state:       'active' | 'handed_over' | 'opted_out';
  handed_over_at:  string | null;
  handover_reason: string | null;
  created_at:      string;
  updated_at:      string;
  // Enrichment — present when joined in service queries
  lead_name?:    string;
  lead_phone?:   string;
  unread_count?: number;
};

// Mirrors the whatsapp_messages DB row, plus optional enrichment fields
// added by service layer queries (joined sender profile).
export type WhatsAppMessage = {
  id:              string;
  conversation_id: string;
  lead_id:         string;
  direction:       'inbound' | 'outbound';
  sender_type:     'lead' | 'agent' | 'bot';
  sender_id:       string | null;
  wa_message_id:   string | null;
  message_type:    'text' | 'image' | 'video' | 'document' | 'audio' | 'template';
  content:         string | null;
  media_url:       string | null;
  media_mime_type: string | null;
  status:          'sent' | 'delivered' | 'read' | 'failed' | null;
  status_at:       string | null;
  is_bot:          boolean;
  /** The library item this message carried, when it was one (0252). */
  training_asset_id?: string | null;
  created_at:      string;
  // Enrichment — present when joined in service queries
  sender_name?:       string;
  sender_avatar_url?: string;
  /** The link preview the message carries (readLinkPreview), when its source keeps one: Hands does, Gupshup does not. */
  link_preview?:      LinkPreview | null;
};

export type SendMessageInput = {
  conversationId: string;
  content:        string;
};

