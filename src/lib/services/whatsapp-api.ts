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
} from '@/lib/constants/whatsapp';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MetaApiResponse, TemplateComponent } from '@/lib/types/whatsapp';

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

async function logNotification(entry: {
  type:           'agent_assignment' | 'founder_alert';
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
}): Promise<void> {
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
      domain:          entry.domain ?? null,
      gupshup_status:  entry.gupshupStatus,
      gupshup_body:    entry.gupshupBody.slice(0, 2000),
      delivered:       entry.delivered,
    });
  } catch (err) {
    console.error('[whatsapp-api] Failed to write notification log:', err);
  }
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
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: agent } = await admin
      .from('profiles')
      .select('phone')
      .eq('id', agentId)
      .single();

    if (!agent?.phone) {
      console.warn(`[whatsapp-api] Agent ${agentId} has no phone — skipping lead assignment notification`);
      return;
    }

    const source      = GUPSHUP_PARTNER_NUMBER!.replace(/^\+/, '');
    const destination = agent.phone.replace(/^\+/, '');

    const params = new URLSearchParams({
      channel:    'whatsapp',
      source,
      destination,
      'src.name': GUPSHUP_APP_NAME!,
      template:   JSON.stringify({
        id:     GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID,
        // Gupshup {{1}} = lead name, {{2}} = lead phone
        params: [leadName, leadPhone || 'not provided'],
      }),
    });

    let res: Response;
    let responseBody: string;
    try {
      res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
        method:  'POST',
        headers: {
          apikey:         GUPSHUP_API_KEY!,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      responseBody = await res.text();
    } catch (fetchErr) {
      console.error(`[whatsapp-api] Lead assignment notification fetch failed for agent ${agentId}:`, fetchErr);
      void logNotification({
        type:           'agent_assignment',
        recipientId:    agentId,
        recipientPhone: destination,
        leadName,
        leadPhone,
        domain,
        gupshupStatus:  0,
        gupshupBody:    String(fetchErr).slice(0, 2000),
        delivered:      false,
      });
      return;
    }

    const delivered = isGupshupDelivered(res.ok, responseBody);
    if (delivered) {
      console.log(`[whatsapp-api] Lead assignment notification sent to agent ${agentId} (...${destination.slice(-4)})`);
    } else {
      console.error(`[whatsapp-api] Lead assignment notification failed: HTTP ${res.status} body=${responseBody.slice(0, 200)} for agent ${agentId}`);
    }

    void logNotification({
      type:           'agent_assignment',
      recipientId:    agentId,
      recipientPhone: destination,
      leadName,
      leadPhone,
      domain,
      gupshupStatus:  res.status,
      gupshupBody:    responseBody,
      delivered,
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
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: founders } = await admin
      .from('profiles')
      .select('id, phone, full_name')
      .eq('role', 'founder');

    if (!founders || founders.length === 0) return;

    const source = GUPSHUP_PARTNER_NUMBER!.replace(/^\+/, '');

    for (const founder of founders) {
      if (!founder.phone) {
        console.warn(`[whatsapp-api] Founder ${founder.id} (${founder.full_name}) has no phone — skipping lead notification`);
        continue;
      }

      const destination = founder.phone.replace(/^\+/, '');

      const params = new URLSearchParams({
        channel:    'whatsapp',
        source,
        destination,
        'src.name': GUPSHUP_APP_NAME!,
        template:   JSON.stringify({
          id:     GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID,
          params: [domain, agentName, leadName, leadPhone || 'not provided'],
        }),
      });

      let res: Response;
      let responseBody: string;
      try {
        res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
          method:  'POST',
          headers: {
            apikey:         GUPSHUP_API_KEY!,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        responseBody = await res.text();
      } catch (fetchErr) {
        console.error(`[whatsapp-api] Founder lead notification fetch failed for founder ${founder.id}:`, fetchErr);
        void logNotification({
          type:           'founder_alert',
          recipientId:    founder.id,
          recipientPhone: destination,
          agentName,
          leadName,
          leadPhone,
          domain,
          gupshupStatus:  0,
          gupshupBody:    String(fetchErr).slice(0, 2000),
          delivered:      false,
        });
        continue;
      }

      const delivered = isGupshupDelivered(res.ok, responseBody);
      if (delivered) {
        console.log(`[whatsapp-api] Founder lead notification sent to ${founder.id} (...${destination.slice(-4)})`);
      } else {
        console.error(`[whatsapp-api] Founder lead notification failed: HTTP ${res.status} body=${responseBody.slice(0, 200)} for founder ${founder.id}`);
      }

      void logNotification({
        type:           'founder_alert',
        recipientId:    founder.id,
        recipientPhone: destination,
        agentName,
        leadName,
        leadPhone,
        domain,
        gupshupStatus:  res.status,
        gupshupBody:    responseBody,
        delivered,
      });
    }
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

    const source      = GUPSHUP_PARTNER_NUMBER!.replace(/^\+/, '');
    const destination = agent.phone.replace(/^\+/, '');

    const params = new URLSearchParams({
      channel:    'whatsapp',
      source,
      destination,
      'src.name': GUPSHUP_APP_NAME!,
      template:   JSON.stringify({
        id:     GUPSHUP_SLA_AGENT_TEMPLATE_ID,
        params: [leadName, leadPhone || 'not provided', status, lastUpdatedAt],
      }),
    });

    let res: Response;
    let responseBody: string;
    try {
      res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
        method:  'POST',
        headers: {
          apikey:         GUPSHUP_API_KEY!,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      responseBody = await res.text();
    } catch (fetchErr) {
      console.error(`[whatsapp-api] SLA agent notification fetch failed for agent ${agentId}:`, fetchErr);
      void logNotification({
        type:           'agent_assignment',
        recipientId:    agentId,
        recipientPhone: destination,
        leadName,
        leadPhone,
        gupshupStatus:  0,
        gupshupBody:    String(fetchErr).slice(0, 2000),
        delivered:      false,
      });
      return;
    }

    const delivered = isGupshupDelivered(res.ok, responseBody);
    if (delivered) {
      console.log(`[whatsapp-api] SLA agent notification sent to agent ${agentId} (...${destination.slice(-4)})`);
    } else {
      console.error(`[whatsapp-api] SLA agent notification failed: HTTP ${res.status} body=${responseBody.slice(0, 200)} for agent ${agentId}`);
    }

    void logNotification({
      type:           'agent_assignment',
      recipientId:    agentId,
      recipientPhone: destination,
      leadName,
      leadPhone,
      gupshupStatus:  res.status,
      gupshupBody:    responseBody,
      delivered,
    });
  } catch (err) {
    console.error('[whatsapp-api] Unexpected error in sendSlaAgentNotification:', err);
  }
}

// ─────────────────────────────────────────────
// Send SLA breach escalation to multiple managers via Gupshup template
// Fire-and-forget safe — never throws to the caller
// Params: [leadName, leadPhone, agentName, status, lastUpdatedAt]
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

    const source = GUPSHUP_PARTNER_NUMBER!.replace(/^\+/, '');

    for (const recipient of recipients) {
      if (!recipient.phone) {
        console.warn(`[whatsapp-api] Manager ${recipient.id} has no phone — skipping SLA manager notification`);
        continue;
      }

      const destination = recipient.phone.replace(/^\+/, '');

      const params = new URLSearchParams({
        channel:    'whatsapp',
        source,
        destination,
        'src.name': GUPSHUP_APP_NAME!,
        template:   JSON.stringify({
          id:     GUPSHUP_SLA_MANAGER_TEMPLATE_ID,
          params: [leadName, leadPhone || 'not provided', agentName, status, lastUpdatedAt],
        }),
      });

      let res: Response;
      let responseBody: string;
      try {
        res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
          method:  'POST',
          headers: {
            apikey:         GUPSHUP_API_KEY!,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        responseBody = await res.text();
      } catch (fetchErr) {
        console.error(`[whatsapp-api] SLA manager notification fetch failed for recipient ${recipient.id}:`, fetchErr);
        void logNotification({
          type:           'founder_alert',
          recipientId:    recipient.id,
          recipientPhone: destination,
          agentName,
          leadName,
          leadPhone,
          gupshupStatus:  0,
          gupshupBody:    String(fetchErr).slice(0, 2000),
          delivered:      false,
        });
        continue;
      }

      const delivered = isGupshupDelivered(res.ok, responseBody);
      if (delivered) {
        console.log(`[whatsapp-api] SLA manager notification sent to ${recipient.id} (...${destination.slice(-4)})`);
      } else {
        console.error(`[whatsapp-api] SLA manager notification failed: HTTP ${res.status} body=${responseBody.slice(0, 200)} for recipient ${recipient.id}`);
      }

      void logNotification({
        type:           'founder_alert',
        recipientId:    recipient.id,
        recipientPhone: destination,
        agentName,
        leadName,
        leadPhone,
        gupshupStatus:  res.status,
        gupshupBody:    responseBody,
        delivered,
      });
    }
  } catch (err) {
    console.error('[whatsapp-api] Unexpected error in sendSlaManagerNotification:', err);
  }
}

// ─────────────────────────────────────────────
// Send lead initiation message via Gupshup template
// Params: {{1}} = leadName, {{2}} = agentName
// CAN THROW — the action layer catches and surfaces to UI.
// Does NOT call logNotification — whatsapp_notification_logs CHECK does not cover 'lead_initiation'.
// ─────────────────────────────────────────────

export async function sendLeadInitiationMessage(
  to:        string,
  leadName:  string,
  agentName: string,
): Promise<MetaApiResponse> {
  const source      = GUPSHUP_PARTNER_NUMBER!.replace(/^\+/, '');
  const destination = to.replace(/^\+/, '');

  const params = new URLSearchParams({
    channel:    'whatsapp',
    source,
    destination,
    'src.name': GUPSHUP_APP_NAME!,
    template:   JSON.stringify({
      id:     GUPSHUP_LEAD_INITIATION_TEMPLATE_ID,
      params: [leadName, agentName],
    }),
  });

  const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
    method:  'POST',
    headers: {
      apikey:         GUPSHUP_API_KEY!,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const responseBody = await res.text();

  if (!isGupshupDelivered(res.ok, responseBody)) {
    throw new Error(`[whatsapp-api] sendLeadInitiationMessage failed: HTTP ${res.status} body=${responseBody.slice(0, 200)}`);
  }

  let messageId = '';
  try {
    const parsed = JSON.parse(responseBody) as Record<string, unknown>;
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
