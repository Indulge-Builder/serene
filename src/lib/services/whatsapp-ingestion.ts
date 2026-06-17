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
import { normalizeWaPhone } from '@/lib/utils/phone';
import { sanitizeText } from '@/lib/utils/sanitize';
import { getMediaDownloadUrl } from '@/lib/services/whatsapp-api';
import { createLeadFromWhatsApp } from '@/lib/services/lead-ingestion';
import { invalidateLeadCaches } from '@/lib/services/lead-cache';
import { notifyLeadAssigned } from '@/lib/services/lead-assignment-notify';
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
  // 1. Normalize phone to E.164 — shared with the Elaya staff routing gate
  const normalizedPhone = normalizeWaPhone(phone);

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
    const { leadId, assignedTo, assignedAt, domain: newLeadDomain, alreadyExisted } =
      await createLeadFromWhatsApp(waId, normalizedPhone, senderName ?? null);

    // Re-fetch so we have the full Lead row for downstream steps.
    const adminClient = createAdminClient();
    const { data: created } = await adminClient
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    lead = created as Lead | null;

    // The lead row provably exists (createLeadFromWhatsApp just inserted it, or
    // resolved an existing one). If the re-fetch returns null (transient DB
    // glitch / read replica lag), DO NOT abandon the message — fall back to a
    // minimal row so the conversation + message are still recorded. Losing the
    // inbound message was the prior bug (audit #12).
    if (!lead) {
      console.error('[whatsapp-ingestion] Re-fetch of created lead returned null, using minimal fallback:', leadId);
      const nameParts = senderName?.split(' ') ?? [];
      lead = {
        id:          leadId,
        first_name:  nameParts[0]?.trim() || normalizedPhone,
        last_name:   nameParts.slice(1).join(' ').trim() || null,
        phone:       normalizedPhone,
        domain:      newLeadDomain,
        assigned_to: assignedTo,
        // Minimal shape — only the fields the steps below read. Cast is safe
        // because we never persist this object; the row exists in the DB.
      } as unknown as Lead;
    }

    // On a duplicate-lead race (alreadyExisted), another inbound message already
    // created the lead AND fired its assignment notifications — skip the second
    // founder/agent alert + SLA arm; just attach this message to the conversation.
    if (!alreadyExisted) {
      // Fire all assignment side-effects via the shared orchestrator
      const newLeadId = lead.id;
      const leadName = lead.last_name
        ? `${lead.first_name} ${lead.last_name}`
        : lead.first_name;

      // Fetch agent name for founder alert — one query, non-fatal if absent
      let assignedAgentName: string | null = null;
      if (assignedTo) {
        const adminForAgent = createAdminClient();
        const { data: assignedAgent } = await adminForAgent
          .from('profiles')
          .select('full_name')
          .eq('id', assignedTo)
          .single();
        assignedAgentName = assignedAgent?.full_name ?? null;
      }

      // Bust the leads list + dashboard caches so the assigned agent sees the
      // new lead immediately rather than after the 30s list TTL (audit #8).
      await invalidateLeadCaches(
        'processInboundMessage',
        { leadId: newLeadId, domain: newLeadDomain },
        { lists: true, dashboard: true },
      );

      // Awaited (not void): processInboundMessage runs inside the whatsapp route's
      // after(), which keeps the lambda alive only for promises it can track. A bare
      // void here would detach the send from that tracked chain and Vercel would
      // freeze the lambda before Gupshup is reached. await keeps it in the chain.
      await notifyLeadAssigned({
        leadId:      newLeadId,
        assignedTo,
        agentName:   assignedAgentName,
        leadName,
        leadPhone:   normalizedPhone,
        domain:      newLeadDomain,
        isNew:       true,
        isDuplicate: false,
        actorId:     null,
        scheduleSla: true,
        assignedAt:  assignedAt ?? undefined,
      }).catch((err) => {
        console.error('[whatsapp-ingestion] notifyLeadAssigned failed (non-fatal):', err);
      });
    }
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

  // 7. Insert inbound message row — error-checked: a failed insert means the
  //    user's message is lost, so surface it loudly rather than returning a
  //    silent success (audit #13). Bail before the conversation timestamp bump
  //    so we don't advertise activity for a message that was never stored.
  const { error: messageError } = await insertInboundMessage(conversationId, leadId, message, mediaUrl);
  if (messageError) {
    console.error('[whatsapp-ingestion] insertInboundMessage failed — message not stored:', messageError.message);
    return;
  }

  // 8. Update conversation last_message_at — non-fatal: the message row already
  //    persisted; a stale timestamp only affects sort/unread ordering.
  const { error: convUpdateError } = await supabase
    .from('whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (convUpdateError) {
    console.warn('[whatsapp-ingestion] conversation last_message_at update failed (non-fatal):', convUpdateError.message);
  }

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
): Promise<{ error: { message: string } | null }> {
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

  const { error } = await supabase.from('whatsapp_messages').insert({
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

  return { error: error ? { message: error.message } : null };
}
