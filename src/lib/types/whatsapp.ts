// WhatsApp type definitions — two categories:
// 1. Meta Cloud API payload shapes (exactly what Meta sends to the webhook)
// 2. App-internal types (DB row mirrors + enriched query shapes)
//
// No runtime values in this file. Types only.
// No default exports.

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
  | { type: 'audio';    id: string; from: string; timestamp: string; audio:    MetaMediaObject };

export type MetaMediaObject = {
  id:        string;
  mime_type: string;
  sha256:    string;
  caption?:  string;
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
  created_at:      string;
  // Enrichment — present when joined in service queries
  sender_name?:       string;
  sender_avatar_url?: string;
};

export type SendMessageInput = {
  conversationId: string;
  content:        string;
};
