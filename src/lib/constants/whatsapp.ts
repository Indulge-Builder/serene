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
// Outbound media (staff → lead, composer attach flow)
// MIME allowlist → message_type + per-type size caps mirror WhatsApp's limits.
// resolveOutboundMediaType returns null for any disallowed MIME (reject upload).
// ─────────────────────────────────────────────

export const WHATSAPP_OUTBOUND_MEDIA_MIME: Record<string, 'image' | 'video' | 'document' | 'audio'> = {
  'image/jpeg':       'image',
  'image/png':        'image',
  'image/webp':       'image',
  'video/mp4':        'video',
  'video/3gpp':       'video',
  'audio/mpeg':       'audio',
  'audio/ogg':        'audio',
  'audio/mp4':        'audio',
  'audio/amr':        'audio',
  'application/pdf':  'document',
};

export function resolveOutboundMediaType(
  mime: string,
): 'image' | 'video' | 'document' | 'audio' | null {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return WHATSAPP_OUTBOUND_MEDIA_MIME[base] ?? null;
}

// WhatsApp caps: image 5MB, video/audio/document 16MB. Use 16MB as the single cap.
export const WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES = 16 * 1024 * 1024;

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

// Params: {{1}} agent first name, {{2}} lead full name, {{3}} lead phone
export const GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID            = '193e330d-e7ee-48e0-9cd4-f3808b50fc80';
export const GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID  = 'd5828042-fbfc-4e6d-a9d9-e72185d7d0c1';
export const GUPSHUP_SLA_AGENT_TEMPLATE_ID                  = '54d5dd55-a1fa-482b-8823-49e9b9e22745';
export const GUPSHUP_SLA_MANAGER_TEMPLATE_ID                = '682fd320-3b04-45da-8b1a-9a390770fac8';
export const GUPSHUP_LEAD_INITIATION_TEMPLATE_ID            = '7aee2a33-3442-4b3a-a1b6-d20a2e39895a';
// Customer welcome-blast (FEATURE 2) — the FIRST template message to a brand-new prospect
// number (the 24h free-form window only opens after they reply). Params: {{1}} customer
// first name (or "there"). Read from env so the real approved Gupshup template id drops in
// with NO code change; the placeholder default means the orchestrator NO-OPS safely until
// a real id is set (sendCustomerWelcomeTemplate guards on CUSTOMER_WELCOME_TEMPLATE_CONFIGURED).
export const GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID =
  process.env.GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID ?? 'CUSTOMER_WELCOME_TEMPLATE_ID_UNSET';
export const CUSTOMER_WELCOME_TEMPLATE_CONFIGURED =
  GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID !== 'CUSTOMER_WELCOME_TEMPLATE_ID_UNSET';
// Params: {{1}} agent first name, {{2}} lead name, {{3}} lead phone, {{4}} task title
export const GUPSHUP_TASK_DUE_REMINDER_TEMPLATE_ID          = '05411e50-30c6-432b-8b45-cc079fa43c81';
// Params: {{1}} manager first name, {{2}} agent name, {{3}} lead name, {{4}} task title,
//         {{5}} due time in IST human format ("4:00 PM") — never UTC, never ISO
export const GUPSHUP_TASK_OVERDUE_MANAGER_TEMPLATE_ID       = 'c7ddd983-9472-453d-a712-e1daecc03a05';

// Task-shaped reminders to the assigned agent — fire for EVERY task (lead or not),
// so these templates carry NO lead fields (the lead-shaped reminder above stays
// the lead path). Both: {{1}} agent first name, {{2}} task title,
// {{3}} due time in IST human format ("4:00 PM") — never UTC, never ISO.
export const GUPSHUP_TASK_DUE_SOON_TEMPLATE_ID             = '123e5939-cf2e-420f-baef-702aaf84a4df'; // eia_task_due_soon (fires 30 min before due)
export const GUPSHUP_TASK_OVERDUE_AGENT_TEMPLATE_ID        = '7b926598-714d-4396-a78f-5fe583fcceb0'; // eia_task_overdue_agent (fires at due, task still open)

// Task-shaped manager escalation for NON-lead overdue tasks — fired at due +
// TASK-01B threshold to the assignee's manager (reports_to → domain fallback).
// Params: {{1}} manager first name, {{2}} agent name, {{3}} task title,
//         {{4}} due time IST ("4:00 PM"). NO lead fields (the lead path keeps
//         GUPSHUP_TASK_OVERDUE_MANAGER_TEMPLATE_ID, which carries a lead name).
export const GUPSHUP_TASK_OVERDUE_MANAGER_GENERIC_TEMPLATE_ID = '80aa1747-e948-4e3c-9409-c13d0b41194b'; // eia_task_overdue_manager_generic

// Task ASSIGNED — fires the moment a task is assigned TO the assignee (personal
// task assigned to another, OR a group subtask). Tells them a new task landed +
// who assigned it + the due date. Hardcoded with the rest (approved Gupshup id —
// not a secret, never changes). The CONFIGURED flag stays so the send still degrades
// gracefully if the id is ever blanked. Params: {{1}} assignee first name, {{2}}
// assigner name (manager/founder who created it), {{3}} task title, {{4}} due date
// IST ("26 Jun, 4:00 PM" or "no due date"). Gated by the 'task_assigned' control key.
export const GUPSHUP_TASK_ASSIGNED_TEMPLATE_ID = '1cb3c51f-de37-4ee3-9be1-60bb1659034e';
// Hardcoded id is always present — kept as a named flag so the call site reads the same
// as the customer-welcome path (and so blanking the id above flips it without edits there).
export const TASK_ASSIGNED_TEMPLATE_CONFIGURED = GUPSHUP_TASK_ASSIGNED_TEMPLATE_ID.length > 0;
