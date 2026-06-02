// WhatsApp constants — Meta Cloud API config and app-internal vocabulary.
// No secret env vars here (S-11). WHATSAPP_ACCESS_TOKEN and WHATSAPP_WEBHOOK_SECRET
// live in process.env only and are accessed directly in server-side code.

// ─────────────────────────────────────────────
// Meta Cloud API
// ─────────────────────────────────────────────

export const WHATSAPP_API_VERSION = 'v21.0' as const;
export const WHATSAPP_API_BASE    = 'https://graph.facebook.com/v21.0' as const;

// ─────────────────────────────────────────────
// Message types — mirrors DB CHECK constraint values
// ─────────────────────────────────────────────

export const WHATSAPP_MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'document',
  'audio',
  'template',
] as const;

// ─────────────────────────────────────────────
// Conversation status
// ─────────────────────────────────────────────

export const WHATSAPP_CONVERSATION_STATUS = {
  OPEN:     'open',
  RESOLVED: 'resolved',
} as const;

// ─────────────────────────────────────────────
// Sender type
// ─────────────────────────────────────────────

export const WHATSAPP_SENDER_TYPE = {
  LEAD:  'lead',
  AGENT: 'agent',
  BOT:   'bot',
} as const;

// ─────────────────────────────────────────────
// Message direction
// ─────────────────────────────────────────────

export const WHATSAPP_DIRECTION = {
  INBOUND:  'inbound',
  OUTBOUND: 'outbound',
} as const;

// ─────────────────────────────────────────────
// Message delivery status
// ─────────────────────────────────────────────

export const WHATSAPP_MESSAGE_STATUS = {
  SENT:      'sent',
  DELIVERED: 'delivered',
  READ:      'read',
  FAILED:    'failed',
} as const;

// ─────────────────────────────────────────────
// Notification template names (Meta template IDs)
// ─────────────────────────────────────────────

export const WHATSAPP_NOTIFICATION_TEMPLATES = {
  LEAD_ASSIGNED_AGENT:   'eia_lead_assigned',
  LEAD_ASSIGNED_MANAGER: 'eia_lead_assigned_manager',
} as const;

// ─────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────

export const WHATSAPP_MESSAGES_PAGE_SIZE      = 30;
export const WHATSAPP_CONVERSATIONS_PAGE_SIZE = 20;

// ─────────────────────────────────────────────
// Gupshup template IDs
// ─────────────────────────────────────────────

export const GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID            = '193e330d-e7ee-48e0-9cd4-f3808b50fc80';
export const GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID  = 'd5828042-fbfc-4e6d-a9d9-e72185d7d0c1';
export const GUPSHUP_SLA_AGENT_TEMPLATE_ID                  = '54d5dd55-a1fa-482b-8823-49e9b9e22745';
export const GUPSHUP_SLA_MANAGER_TEMPLATE_ID                = '682fd320-3b04-45da-8b1a-9a390770fac8';
