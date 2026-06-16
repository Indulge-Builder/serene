// SERVER ONLY — do not import in client components.
// Reads secret env vars at module load. Throws at startup if required vars are missing.

import { createHmac, timingSafeEqual } from 'crypto';
import {
  WHATSAPP_API_BASE,
  GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID,
  GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID,
  GUPSHUP_SLA_AGENT_TEMPLATE_ID,
  GUPSHUP_SLA_MANAGER_TEMPLATE_ID,
  GUPSHUP_LEAD_INITIATION_TEMPLATE_ID,
  GUPSHUP_TASK_DUE_REMINDER_TEMPLATE_ID,
  GUPSHUP_TASK_OVERDUE_MANAGER_TEMPLATE_ID,
} from '@/lib/constants/whatsapp';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MetaApiResponse, TemplateComponent } from '@/lib/types/whatsapp';
import type { AppDomain } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Env var guard — fail fast at startup
// ─────────────────────────────────────────────

const WEBHOOK_SECRET        = process.env.WHATSAPP_WEBHOOK_SECRET;
const WEBHOOK_VERIFY_TOKEN  = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const BUSINESS_ACCOUNT_ID   = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
// Meta vars — dormant until Meta credentials arrive; optional so server starts without them
const PHONE_NUMBER_ID       = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN          = process.env.WHATSAPP_ACCESS_TOKEN;
const GUPSHUP_API_KEY        = process.env.GUPSHUP_API_KEY;
const GUPSHUP_APP_NAME       = process.env.GUPSHUP_APP_NAME;
const GUPSHUP_PARTNER_NUMBER = process.env.GUPSHUP_PARTNER_NUMBER;
const GUPSHUP_WEBHOOK_SECRET = process.env.GUPSHUP_WEBHOOK_SECRET;

if (!GUPSHUP_API_KEY || !GUPSHUP_APP_NAME || !GUPSHUP_PARTNER_NUMBER || !GUPSHUP_WEBHOOK_SECRET) {
  throw new Error(
    '[whatsapp-api] Missing required env vars: GUPSHUP_API_KEY, GUPSHUP_APP_NAME, GUPSHUP_PARTNER_NUMBER, and GUPSHUP_WEBHOOK_SECRET must be set.',
  );
}

// ─────────────────────────────────────────────
// Meta internal HTTP helper — dormant until Meta credentials arrive
// ─────────────────────────────────────────────

async function metaFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${WHATSAPP_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(`[whatsapp-api] Meta API error: ${res.status} on ${path}`);
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// Send text message — Gupshup v1
// ─────────────────────────────────────────────

export async function sendTextMessage(
  to:   string,
  text: string,
): Promise<MetaApiResponse> {
  const source = GUPSHUP_PARTNER_NUMBER!.replace(/^\+/, '');
  const destination = to.replace(/^\+/, '');

  const params = new URLSearchParams({
    channel:     'whatsapp',
    source,
    destination,
    message:     JSON.stringify({ type: 'text', text }),
    'src.name':  GUPSHUP_APP_NAME!,
  });

  const res = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
    method:  'POST',
    headers: {
      apikey:         GUPSHUP_API_KEY!,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`[whatsapp-api] Gupshup API error: ${res.status}`);
  }

  const data = (await res.json()) as { messageId?: string };

  return {
    messaging_product: 'whatsapp',
    contacts: [],
    messages: [{ id: data.messageId ?? '' }],
  };
}

// ─────────────────────────────────────────────
// Elaya WhatsApp reply — free-form session message (the staff member just
// messaged us, so the 24h session window is open; no template needed).
// Wraps sendTextMessage with the one-log-row-per-attempt finally contract
// (type 'elaya_reply', migration 0117). Never throws — the webhook's Elaya
// branch must never retry-loop on a failed reply.
// ─────────────────────────────────────────────

export async function sendElayaWhatsAppReply(
  to:          string,
  text:        string,
  recipientId: string,
): Promise<boolean> {
  let delivered   = false;
  let gupshupBody = '';
  try {
    const res   = await sendTextMessage(to, text);
    delivered   = true;
    gupshupBody = `messageId: ${res.messages[0]?.id ?? ''}`;
    console.log(`[whatsapp-api] Elaya reply sent to user ${recipientId}`);
  } catch (err) {
    gupshupBody = String(err);
    console.error(`[whatsapp-api] Elaya reply failed for user ${recipientId}:`, err);
  } finally {
    // Awaited so the row is durably written before the after() chain settles
    // (same Vercel-freeze rationale as sendGupshupTemplate).
    await logNotification({
      type:           'elaya_reply',
      recipientId,
      recipientPhone: to.replace(/^\+/, ''),
      gupshupStatus:  delivered ? 200 : 0,
      gupshupBody,
      delivered,
    });
  }
  return delivered;
}

// ─────────────────────────────────────────────
// Send template message
// ─────────────────────────────────────────────

export async function sendTemplateMessage(
  to:           string,
  templateName: string,
  languageCode: string,
  components:   TemplateComponent[],
): Promise<MetaApiResponse> {
  return metaFetch<MetaApiResponse>(`/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'template',
      template: {
        name:       templateName,
        language:   { code: languageCode },
        components,
      },
    }),
  });
}

// ─────────────────────────────────────────────
// Send media message (image / video / document / audio)
// ─────────────────────────────────────────────

export async function sendMediaMessage(
  to:      string,
  type:    'image' | 'video' | 'document' | 'audio',
  mediaId: string,
  caption?: string,
): Promise<MetaApiResponse> {
  const mediaObject: Record<string, string> = { id: mediaId };
  if (caption && (type === 'image' || type === 'video' || type === 'document')) {
    mediaObject.caption = caption;
  }

  return metaFetch<MetaApiResponse>(`/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type,
      [type]: mediaObject,
    }),
  });
}

// ─────────────────────────────────────────────
// Upload media — returns Meta media_id
// ─────────────────────────────────────────────

export async function uploadMedia(
  buffer:   Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

  const url = `${WHATSAPP_API_BASE}/${PHONE_NUMBER_ID}/media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`[whatsapp-api] Media upload failed: ${res.status}`);
  }

  const json = (await res.json()) as { id: string };
  return json.id;
}

// ─────────────────────────────────────────────
// Get media download URL
// ─────────────────────────────────────────────

export async function getMediaDownloadUrl(mediaId: string): Promise<string> {
  const result = await metaFetch<{ url: string }>(`/${mediaId}`);
  return result.url;
}

// ─────────────────────────────────────────────
// Verify Meta webhook signature (S-12)
// Uses HMAC-SHA256 + timing-safe comparison.
// signatureHeader format: "sha256=<hex_digest>"
// ─────────────────────────────────────────────

export function verifyMetaSignature(
  rawBody:         string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !WEBHOOK_SECRET) return false;

  const [algo, hex] = signatureHeader.split('=');
  if (algo !== 'sha256' || !hex) return false;

  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest();

  const received = Buffer.from(hex, 'hex');

  // timingSafeEqual requires same-length buffers
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

// ─────────────────────────────────────────────
// Expose verify token for GET challenge handler
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Gupshup returns HTTP 200 even for application-level errors (e.g. inactive
// number, template ID mismatch). Detect them by checking the parsed body for
// { "status": "error" }. A non-parseable body is treated as delivered so we
// don't false-negative on unknown success shapes.
// ─────────────────────────────────────────────

function isGupshupDelivered(httpOk: boolean, body: string): boolean {
  if (!httpOk) return false;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed === 'object' && parsed !== null && parsed['status'] === 'error') {
      return false;
    }
  } catch {
    // non-JSON body — trust httpOk
  }
  return true;
}

// ─────────────────────────────────────────────
// Internal: log every template notification attempt to whatsapp_notification_logs.
// Stores last-4 phone digits only — never full numbers.
// Never throws — a log failure must not surface to the caller.
// ─────────────────────────────────────────────

interface NotificationLogEntry {
  type:           'agent_assignment' | 'founder_alert' | 'sla_breach' | 'lead_initiation' | 'task_due_reminder' | 'task_overdue_manager' | 'elaya_reply';
  leadId?:        string | null;
  recipientId?:   string | null;
  recipientPhone: string;
  agentName?:     string | null;
  leadName?:      string | null;
  leadPhone?:     string | null;
  domain?:        string | null;
  gupshupStatus:  number;
  gupshupBody:    string;
  delivered:      boolean;
}

async function logNotification(entry: NotificationLogEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('whatsapp_notification_logs').insert({
      type:            entry.type,
      lead_id:         entry.leadId ?? null,
      recipient_id:    entry.recipientId ?? null,
      recipient_phone: entry.recipientPhone.slice(-4),
      agent_name:      entry.agentName ?? null,
      lead_name:       entry.leadName ?? null,
      lead_phone:      entry.leadPhone ? entry.leadPhone.slice(-4) : null,
      domain:          (entry.domain ?? null) as AppDomain | null,
      gupshup_status:  entry.gupshupStatus,
      gupshup_body:    entry.gupshupBody.slice(0, 2000),
      delivered:       entry.delivered,
    });
  } catch (err) {
    console.error('[whatsapp-api] Failed to write notification log:', err);
  }
}

// ─────────────────────────────────────────────
// sendGupshupTemplate — THE single Gupshup template-send pipeline.
// Owns: '+'-stripping, URLSearchParams assembly, the fetch, the
// status/body/delivered capture, the console log line, and the
// one-log-row-per-attempt finally contract (await logNotification —
// the lambda must stay alive until the row is durably written).
// `throwOnError: false` (default) never throws to the caller;
// `throwOnError: true` re-throws after the finally log (the
// sendLeadInitiationMessage contract). Never call fetch on
// /template/msg outside this function.
// ─────────────────────────────────────────────

async function sendGupshupTemplate(opts: {
  templateId:     string;
  destination:    string;   // E.164 or bare digits — '+' stripped here
  templateParams: string[];
  label:          string;   // console + thrown-error prefix
  logRecipient:   string;   // console suffix, e.g. `agent ${agentId}`
  log:            Omit<NotificationLogEntry, 'recipientPhone' | 'gupshupStatus' | 'gupshupBody' | 'delivered'>;
  throwOnError?:  boolean;
}): Promise<{ delivered: boolean; gupshupBody: string }> {
  const source      = GUPSHUP_PARTNER_NUMBER!.replace(/^\+/, '');
  const destination = opts.destination.replace(/^\+/, '');

  const params = new URLSearchParams({
    channel:    'whatsapp',
    source,
    destination,
    'src.name': GUPSHUP_APP_NAME!,
    template:   JSON.stringify({
      id:     opts.templateId,
      params: opts.templateParams,
    }),
  });

  let gupshupStatus = 0;
  let gupshupBody   = '';
  let delivered     = false;

  try {
    const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
      method:  'POST',
      headers: {
        apikey:         GUPSHUP_API_KEY!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    gupshupStatus = res.status;
    gupshupBody   = await res.text();
    delivered     = isGupshupDelivered(res.ok, gupshupBody);

    if (!delivered && opts.throwOnError) {
      throw new Error(`[whatsapp-api] ${opts.label} failed: HTTP ${res.status} body=${gupshupBody.slice(0, 200)}`);
    }
  } catch (err) {
    gupshupStatus = gupshupStatus || 0;
    gupshupBody   = gupshupBody   || String(err);
    delivered     = false;
    if (opts.throwOnError) throw err;
  } finally {
    if (delivered) {
      console.log(`[whatsapp-api] ${opts.label} sent to ${opts.logRecipient} (...${destination.slice(-4)})`);
    } else {
      console.error(`[whatsapp-api] ${opts.label} failed: HTTP ${gupshupStatus} body=${gupshupBody.slice(0, 200)} for ${opts.logRecipient}`);
    }
    await logNotification({
      ...opts.log,
      recipientPhone: destination,
      gupshupStatus,
      gupshupBody,
      delivered,
    });
  }

  return { delivered, gupshupBody };
}

// ─────────────────────────────────────────────
// Send lead assignment notification to an agent via Gupshup template
// Fire-and-forget safe — never throws to the caller
// ─────────────────────────────────────────────

export async function sendLeadAssignmentNotification(
  agentId:   string,
  leadName:  string,
  leadPhone: string,
  domain?:   string | null,
  leadId?:   string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: agent } = await admin
      .from('profiles')
      .select('phone, full_name')
      .eq('id', agentId)
      .single();

    if (!agent?.phone) {
      console.warn(`[whatsapp-api] Agent ${agentId} has no phone — skipping lead assignment notification`);
      return;
    }

    const agentFirstName = agent.full_name?.trim().split(/\s+/)[0] || 'there';

    await sendGupshupTemplate({
      templateId:  GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID,
      destination: agent.phone,
      // Gupshup {{1}} = agent first name, {{2}} = lead full name, {{3}} = lead phone
      templateParams: [agentFirstName, leadName, leadPhone || 'not provided'],
      label:          'Lead assignment notification',
      logRecipient:   `agent ${agentId}`,
      log: {
        type:        'agent_assignment',
        leadId:      leadId ?? null,
        recipientId: agentId,
        agentName:   agent.full_name ?? null,
        leadName,
        leadPhone,
        domain,
      },
    });
  } catch (err) {
    console.error('[whatsapp-api] Unexpected error in sendLeadAssignmentNotification:', err);
  }
}

// ─────────────────────────────────────────────
// Send lead notification to all founders via Gupshup template
// Fire-and-forget safe — never throws to the caller
// ─────────────────────────────────────────────

export async function sendFounderLeadNotification(
  domain:    string,
  agentName: string,
  leadName:  string,
  leadPhone: string,
  leadId?:   string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: founders } = await admin
      .from('profiles')
      .select('id, phone, full_name')
      .eq('role', 'founder');

    if (!founders || founders.length === 0) return;

    // Send to all founders in parallel — sequential sends meant the second founder
    // was only attempted after the first fetch completed, risking timeout mid-loop.
    await Promise.all(founders.map(async (founder) => {
      if (!founder.phone) {
        console.warn(`[whatsapp-api] Founder ${founder.id} (${founder.full_name}) has no phone — skipping lead notification`);
        return;
      }

      await sendGupshupTemplate({
        templateId:     GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID,
        destination:    founder.phone,
        templateParams: [domain, agentName, leadName, leadPhone || 'not provided'],
        label:          'Founder lead notification',
        logRecipient:   `founder ${founder.id}`,
        log: {
          type:        'founder_alert',
          leadId,
          recipientId: founder.id,
          agentName,
          leadName,
          leadPhone,
          domain,
        },
      });
    }));
  } catch (err) {
    console.error('[whatsapp-api] Unexpected error in sendFounderLeadNotification:', err);
  }
}

// ─────────────────────────────────────────────
// Send SLA breach notification to an agent via Gupshup template
// Fire-and-forget safe — never throws to the caller
// Params: [leadName, leadPhone, status, lastUpdatedAt]
// ─────────────────────────────────────────────

export async function sendSlaAgentNotification(
  agentId:       string,
  leadName:      string,
  leadPhone:     string,
  status:        string,
  lastUpdatedAt: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: agent } = await admin
      .from('profiles')
      .select('phone')
      .eq('id', agentId)
      .single();

    if (!agent?.phone) {
      console.warn(`[whatsapp-api] Agent ${agentId} has no phone — skipping SLA agent notification`);
      return;
    }

    await sendGupshupTemplate({
      templateId:     GUPSHUP_SLA_AGENT_TEMPLATE_ID,
      destination:    agent.phone,
      templateParams: [leadName, leadPhone || 'not provided', status, lastUpdatedAt],
      label:          'SLA agent notification',
      logRecipient:   `agent ${agentId}`,
      log: {
        type:        'sla_breach',
        recipientId: agentId,
        leadName,
        leadPhone,
      },
    });
  } catch (err) {
    console.error('[whatsapp-api] Unexpected error in sendSlaAgentNotification:', err);
  }
}

// ─────────────────────────────────────────────
// Send SLA breach escalation to multiple managers via Gupshup template
// Fire-and-forget safe — never throws to the caller
// Params: [leadName, leadPhone, agentName, status, lastUpdatedAt]
// Sends stay sequential — manager escalation lists are small and
// this path runs under Trigger.dev, not a response-bound lambda.
// ─────────────────────────────────────────────

export async function sendSlaManagerNotification(
  recipientIds:  string[],
  leadName:      string,
  leadPhone:     string,
  agentName:     string,
  status:        string,
  lastUpdatedAt: string,
): Promise<void> {
  try {
    if (recipientIds.length === 0) return;

    const admin = createAdminClient();
    const { data: recipients } = await admin
      .from('profiles')
      .select('id, phone')
      .in('id', recipientIds);

    if (!recipients || recipients.length === 0) return;

    for (const recipient of recipients) {
      if (!recipient.phone) {
        console.warn(`[whatsapp-api] Manager ${recipient.id} has no phone — skipping SLA manager notification`);
        continue;
      }

      await sendGupshupTemplate({
        templateId:     GUPSHUP_SLA_MANAGER_TEMPLATE_ID,
        destination:    recipient.phone,
        templateParams: [leadName, leadPhone || 'not provided', agentName, status, lastUpdatedAt],
        label:          'SLA manager notification',
        logRecipient:   `recipient ${recipient.id}`,
        log: {
          type:        'sla_breach',
          recipientId: recipient.id,
          agentName,
          leadName,
          leadPhone,
        },
      });
    }
  } catch (err) {
    console.error('[whatsapp-api] Unexpected error in sendSlaManagerNotification:', err);
  }
}

// ─────────────────────────────────────────────
// Send task due reminder to the assigned agent via Gupshup template
// Fire-and-forget safe — never throws to the caller
// gia_followup tasks only (the template is lead-shaped) — caller enforces.
// Params: [agent first name, lead name, lead phone, task title]
// ─────────────────────────────────────────────

export async function sendTaskDueReminderNotification(
  agentId:   string,
  leadName:  string,
  leadPhone: string,
  taskTitle: string,
  leadId?:   string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: agent } = await admin
      .from('profiles')
      .select('phone, full_name')
      .eq('id', agentId)
      .single();

    if (!agent?.phone) {
      console.warn(`[whatsapp-api] Agent ${agentId} has no phone — skipping task due reminder`);
      return;
    }

    const agentFirstName = agent.full_name?.trim().split(/\s+/)[0] || 'there';

    await sendGupshupTemplate({
      templateId:     GUPSHUP_TASK_DUE_REMINDER_TEMPLATE_ID,
      destination:    agent.phone,
      templateParams: [agentFirstName, leadName, leadPhone || 'not provided', taskTitle],
      label:          'Task due reminder',
      logRecipient:   `agent ${agentId}`,
      log: {
        type:        'task_due_reminder',
        leadId:      leadId ?? null,
        recipientId: agentId,
        agentName:   agent.full_name ?? null,
        leadName,
        leadPhone,
      },
    });
  } catch (err) {
    console.error('[whatsapp-api] Unexpected error in sendTaskDueReminderNotification:', err);
  }
}

// ─────────────────────────────────────────────
// Send task overdue escalation to domain managers via Gupshup template
// Fire-and-forget safe — never throws to the caller
// Params: [manager first name, agent name, lead name, task title, due time IST ("4:00 PM")]
// {{1}} is per-recipient, so params are assembled inside the loop.
// Sends stay sequential — Trigger.dev context, small lists (same as SLA manager sends).
// ─────────────────────────────────────────────

export async function sendTaskOverdueManagerNotification(
  recipientIds: string[],
  agentName:    string,
  leadName:     string,
  taskTitle:    string,
  dueTimeIst:   string,
  leadId?:      string | null,
): Promise<void> {
  try {
    if (recipientIds.length === 0) return;

    const admin = createAdminClient();
    const { data: recipients } = await admin
      .from('profiles')
      .select('id, phone, full_name')
      .in('id', recipientIds);

    if (!recipients || recipients.length === 0) return;

    for (const recipient of recipients) {
      if (!recipient.phone) {
        console.warn(`[whatsapp-api] Manager ${recipient.id} has no phone — skipping task overdue notification`);
        continue;
      }

      const managerFirstName = recipient.full_name?.trim().split(/\s+/)[0] || 'there';

      await sendGupshupTemplate({
        templateId:     GUPSHUP_TASK_OVERDUE_MANAGER_TEMPLATE_ID,
        destination:    recipient.phone,
        templateParams: [managerFirstName, agentName, leadName, taskTitle, dueTimeIst],
        label:          'Task overdue manager notification',
        logRecipient:   `recipient ${recipient.id}`,
        log: {
          type:        'task_overdue_manager',
          leadId:      leadId ?? null,
          recipientId: recipient.id,
          agentName,
          leadName,
        },
      });
    }
  } catch (err) {
    console.error('[whatsapp-api] Unexpected error in sendTaskOverdueManagerNotification:', err);
  }
}

// ─────────────────────────────────────────────
// Send lead initiation message via Gupshup template
// Params: {{1}} = leadName, {{2}} = agentName
// CAN THROW — the action layer catches and surfaces to UI.
// sendGupshupTemplate re-throws after logging (throwOnError),
// so the action layer still receives the error.
// ─────────────────────────────────────────────

export async function sendLeadInitiationMessage(
  to:        string,
  leadName:  string,
  agentName: string,
): Promise<MetaApiResponse> {
  const destination = to.replace(/^\+/, '');

  const { gupshupBody } = await sendGupshupTemplate({
    templateId:     GUPSHUP_LEAD_INITIATION_TEMPLATE_ID,
    destination:    to,
    templateParams: [leadName, agentName],
    label:          'sendLeadInitiationMessage',
    logRecipient:   `lead ...${destination.slice(-4)}`,
    log: {
      type:      'lead_initiation',
      leadPhone: destination,
    },
    throwOnError: true,
  });

  let messageId = '';
  try {
    const parsed = JSON.parse(gupshupBody) as Record<string, unknown>;
    messageId = (parsed['messageId'] as string | undefined) ?? '';
  } catch {
    // non-JSON success body — messageId stays empty
  }

  return {
    messaging_product: 'whatsapp',
    contacts: [],
    messages: [{ id: messageId }],
  };
}

export { WEBHOOK_VERIFY_TOKEN, BUSINESS_ACCOUNT_ID };
