// SERVER ONLY — do not import in client components.
// Inbound WhatsApp processing pipeline. Uses admin client throughout (RLS bypassed).
// All functions are idempotent: calling twice with the same message.id is safe.
//
// NOTE: whatsapp_conversations, whatsapp_messages, and whatsapp_conversation_reads
// are not yet in the generated Database type (database.ts is regenerated via
// `supabase gen types typescript --local`). Until then, Supabase client calls on
// these tables use `(supabase as any)` — the same pattern used for new RPCs.
// eslint-disable-next-line comments are co-located with each cast.

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeToE164 } from '@/lib/utils/phone';
import { sanitizeText } from '@/lib/utils/sanitize';
import { getMediaDownloadUrl, sendLeadAssignmentNotification, sendFounderLeadNotification } from '@/lib/services/whatsapp-api';
import { createLeadFromWhatsApp } from '@/lib/services/lead-ingestion';
import type { MetaWebhookPayload, MetaInboundMessage, MetaStatusUpdate, WhatsAppConversation, MetaMediaObject } from '@/lib/types/whatsapp';
import type { Lead } from '@/lib/types/database';

// ─────────────────────────────────────────────
// parseWebhookPayload
// Flattens nested Meta envelope into a flat array of typed events.
// Handles partial payloads gracefully — Meta omits fields it doesn't send.
// ─────────────────────────────────────────────

export function parseWebhookPayload(
  body: MetaWebhookPayload,
): Array<
  | { type: 'message'; data: MetaInboundMessage; waId: string; phone: string }
  | { type: 'status';  data: MetaStatusUpdate;   waId: string; phone: string }
> {
  const events: Array<
    | { type: 'message'; data: MetaInboundMessage; waId: string; phone: string }
    | { type: 'status';  data: MetaStatusUpdate;   waId: string; phone: string }
  > = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      for (const message of value.messages ?? []) {
        const waId  = (message as MetaInboundMessage).from;
        const phone = waId.startsWith('+') ? waId : `+${waId}`;
        events.push({ type: 'message', data: message as MetaInboundMessage, waId, phone });
      }

      for (const status of value.statuses ?? []) {
        const waId  = status.recipient_id;
        const phone = waId.startsWith('+') ? waId : `+${waId}`;
        events.push({ type: 'status', data: status, waId, phone });
      }
    }
  }

  return events;
}

// ─────────────────────────────────────────────
// resolveMediaObject — type-safe extraction from discriminated union
// ─────────────────────────────────────────────

function resolveMediaObject(message: MetaInboundMessage): MetaMediaObject | null {
  if (message.type === 'image')    return message.image;
  if (message.type === 'video')    return message.video;
  if (message.type === 'document') return message.document;
  if (message.type === 'audio')    return message.audio;
  return null;
}

// ─────────────────────────────────────────────
// processInboundMessage
// Full inbound message pipeline. Idempotent — wa_message_id dedup at step 2.
// ─────────────────────────────────────────────

export async function processInboundMessage(
  waId:        string,
  phone:       string,
  message:     MetaInboundMessage,
  senderName?: string | null,
): Promise<void> {
  // 1. Normalize phone to E.164
  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeToE164(phone);
  } catch {
    // wa_id from Meta is already E.164 without +; if normalizeToE164 fails, use raw with +
    normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  // 2. Dedup guard — if this wa_message_id already exists, exit silently
  const { data: existing } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('wa_message_id', message.id)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  // 3. Resolve lead by phone
  let lead = await resolveLeadByPhone(normalizedPhone);

  // 4. If no lead → create from WhatsApp
  if (!lead) {
    const { leadId, assignedTo } = await createLeadFromWhatsApp(waId, normalizedPhone, senderName ?? null);
    // Re-fetch so we have the full Lead row (createAdminClient returns typed client for leads)
    const adminClient = createAdminClient();
    const { data: created } = await adminClient
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    lead = created as Lead | null;
    if (!lead) {
      console.error('[whatsapp-ingestion] Failed to re-fetch created lead:', leadId);
      return;
    }

    // Fire assignment notifications now that we have the full lead row for name/domain
    const newLeadId = lead.id;
    const leadName = lead.last_name
      ? `${lead.first_name} ${lead.last_name}`
      : lead.first_name;

    let assignedAgentName = 'Unassigned';
    if (assignedTo) {
      void sendLeadAssignmentNotification(
        assignedTo,
        leadName,
        normalizedPhone,
        lead.domain as string,
        newLeadId,
      ).catch((err) => {
        console.error('[whatsapp-ingestion] assignment notification failed (non-fatal):', err);
      });

      const adminForFounder = createAdminClient();
      const { data: assignedAgent } = await adminForFounder
        .from('profiles')
        .select('full_name')
        .eq('id', assignedTo)
        .single();
      assignedAgentName = assignedAgent?.full_name ?? 'Unknown Agent';
    }

    void sendFounderLeadNotification(
      lead.domain as string,
      assignedAgentName,
      leadName,
      normalizedPhone,
      newLeadId,
    ).catch((err) => {
      console.error('[whatsapp-ingestion] founder notification failed (non-fatal):', err);
    });
  }

  const leadId = lead.id;

  // 5. Get or create conversation
  const conversation = await getOrCreateConversation(leadId, waId, normalizedPhone);
  const conversationId = conversation.id;

  // 6. Resolve media URL for media messages
  let mediaUrl: string | undefined;
  const mediaObj = resolveMediaObject(message);
  if (mediaObj) {
    try {
      mediaUrl = await getMediaDownloadUrl(mediaObj.id);
    } catch (err) {
      console.error('[whatsapp-ingestion] Failed to fetch media URL:', err);
      // Non-fatal — store message without media URL
    }
  }

  // 7. Insert inbound message row
  await insertInboundMessage(conversationId, leadId, message, mediaUrl);

  // 8. Update conversation last_message_at
  await supabase
    .from('whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  // 9. Realtime broadcast is automatic via supabase_realtime publication — no explicit call needed
}

// ─────────────────────────────────────────────
// processStatusUpdate
// Delivery receipt — the ONLY UPDATE allowed on whatsapp_messages (A-11 narrow exception).
// Must use adminClient: no RLS UPDATE policy exists for regular roles.
// ─────────────────────────────────────────────

export async function processStatusUpdate(
  waMessageId: string,
  status:      string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { error, count } = await supabase
    .from('whatsapp_messages')
    .update({
      status:    status,
      status_at: new Date().toISOString(),
    })
    .eq('wa_message_id', waMessageId);

  if (error) {
    console.error('[whatsapp-ingestion] processStatusUpdate error:', error.message);
    return;
  }

  if (!count || count === 0) {
    console.warn('[whatsapp-ingestion] processStatusUpdate: no row found for wa_message_id:', waMessageId);
  }
}

// ─────────────────────────────────────────────
// resolveLeadByPhone
// ─────────────────────────────────────────────

export async function resolveLeadByPhone(
  normalizedPhone: string,
): Promise<Lead | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('leads')
    .select('*')
    .eq('phone', normalizedPhone)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as Lead | null) ?? null;
}

// ─────────────────────────────────────────────
// getOrCreateConversation
// SELECT first. INSERT (ignore if duplicate), then SELECT again.
// ON CONFLICT DO NOTHING via ignoreDuplicates() — safe under concurrent webhook delivery.
// ─────────────────────────────────────────────

export async function getOrCreateConversation(
  leadId: string,
  waId:   string,
  phone:  string,
): Promise<WhatsAppConversation> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  // Attempt SELECT first (hot path — most messages are from existing conversations)
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (existing) return existing as WhatsAppConversation;

  // INSERT, ignoring duplicate on lead_id UNIQUE constraint
  await supabase
    .from('whatsapp_conversations')
    .insert({
      lead_id:         leadId,
      wa_id:           waId,
      phone,
      status:          'open',
      bot_active:      true,
      bot_paused_by:   null,
      bot_paused_at:   null,
      last_message_at: null,
    });
  // Note: ignoreDuplicates() / ON CONFLICT DO NOTHING is not available via PostgREST
  // insert directly — the unique constraint on lead_id will reject a duplicate insert
  // with a 409, which we intentionally ignore via the re-SELECT below.

  // Re-SELECT — guaranteed to exist now (either our insert or the concurrent one)
  const { data: created, error } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('lead_id', leadId)
    .single();

  if (error || !created) {
    throw new Error(`[whatsapp-ingestion] getOrCreateConversation failed for lead ${leadId}: ${error?.message}`);
  }

  return created as WhatsAppConversation;
}

// ─────────────────────────────────────────────
// insertInboundMessage
// Sanitizes text content before insert (S-02).
// Phone normalization is done upstream — not repeated here.
// ─────────────────────────────────────────────

export async function insertInboundMessage(
  conversationId: string,
  leadId:         string,
  message:        MetaInboundMessage,
  mediaUrl?:      string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  let content:       string | null = null;
  let mediaMimeType: string | null = null;

  if (message.type === 'text') {
    content = sanitizeText(message.text.body);
  } else {
    const mediaObj = resolveMediaObject(message);
    if (mediaObj) {
      mediaMimeType = mediaObj.mime_type;
      if (mediaObj.caption) {
        content = sanitizeText(mediaObj.caption);
      }
    }
  }

  await supabase.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    lead_id:         leadId,
    direction:       'inbound',
    sender_type:     'lead',
    sender_id:       null,
    wa_message_id:   message.id,
    message_type:    message.type,
    content,
    media_url:       mediaUrl ?? null,
    media_mime_type: mediaMimeType,
    status:          null,
    status_at:       null,
    is_bot:          false,
  });
}
