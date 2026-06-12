// SERVER ONLY — Elaya's WhatsApp channel (staff persona, 2026-06-12).
//
// THE routing gate for inbound WhatsApp: a sender whose normalized number
// matches an ACTIVE profiles row is staff — their message runs through the
// same brain/principal/PII pipeline as /elaya and gets one reply on the same
// Gupshup number. No match → the caller proceeds with the untouched lead
// pipeline (whatsapp-ingestion). WhatsApp is a second channel, not a second
// system: same tools, same daily cap, same 24h session — shared across
// channels (one count, one active conversation per user).
//
// Runs inside the webhook route's after() — the ack is never blocked on LLM
// latency, and every outbound send below is await-ed so it stays in the
// tracked chain (A-16). This branch NEVER writes to lead-pipeline tables
// (whatsapp_conversations / whatsapp_messages / leads): the transcript lives
// in elaya_messages (channel 'whatsapp'), the outbound audit row in
// whatsapp_notification_logs (type 'elaya_reply').

import { sanitizeText } from '@/lib/utils/sanitize';
import { normalizeWaPhone } from '@/lib/utils/phone';
import { markdownToWhatsApp } from '@/lib/utils/whatsapp-format';
import { getActiveProfileByPhone } from '@/lib/services/profiles-service';
import { resolveLeadByPhone } from '@/lib/services/whatsapp-ingestion';
import { sendElayaWhatsAppReply } from '@/lib/services/whatsapp-api';
import { resolveStaffPrincipal } from '@/lib/elaya/principal';
import { runElayaTurn } from '@/lib/elaya/brain';
import {
  countUserMessagesToday,
  getOrCreateActiveConversation,
  hasProcessedWaMessage,
  insertAssistantMessage,
  insertUserMessage,
  touchConversation,
} from '@/lib/services/elaya-service';
import { getDailyMessageCap, getSessionExpiryHours } from '@/lib/services/llm-providers-service';
import type { Profile } from '@/lib/types';
import type { MetaInboundMessage } from '@/lib/types/whatsapp';

/** Mirrors the in-app ElayaChatRequestSchema 4000-char bound. */
const MAX_INBOUND_CHARS = 4000;
/** WhatsApp text messages cap at 4096 chars — stay under it. */
const MAX_REPLY_CHARS = 4000;

// Channel copy — short, plain text, no markdown (WhatsApp surface).
const REPLY_TEXT_ONLY =
  'I can only read text here for now — send me your question as a message and I’ll take it from there.';
const REPLY_CAP_REACHED =
  'You’ve reached your Elaya message limit for today. The count resets at midnight — see you then.';
const REPLY_UNAVAILABLE =
  'Something went wrong on my side just now. Give me a moment and try again.';
const REPLY_EMPTY = 'I don’t have an answer for that one — try rephrasing?';

/**
 * The staff routing gate. Returns true when the sender is staff and the
 * message was handled here (so the caller must NOT run the lead pipeline);
 * false when the sender is unknown (lead pipeline proceeds, untouched).
 *
 * Once a profile matches, this returns true on EVERY downstream path —
 * including failures. A staff message must never fall through and mint a
 * lead row for a team member.
 */
export async function tryHandleElayaWhatsAppMessage(
  phone: string,
  message: MetaInboundMessage,
): Promise<boolean> {
  const normalizedPhone = normalizeWaPhone(phone);

  const profile = await getActiveProfileByPhone(normalizedPhone);
  if (!profile) return false;

  try {
    await handleStaffMessage(profile, normalizedPhone, message);
  } catch (err) {
    // D-05: log the failure, never the message contents. No retry — a failed
    // reply is logged (elaya_reply audit row) and dropped.
    console.error(
      '[elaya-whatsapp] staff turn failed:',
      err instanceof Error ? err.message : err,
    );
    await sendElayaWhatsAppReply(normalizedPhone, REPLY_UNAVAILABLE, profile.id);
  }
  return true;
}

async function handleStaffMessage(
  profile: Profile,
  normalizedPhone: string,
  message: MetaInboundMessage,
): Promise<void> {
  // Collision visibility: the staff number also exists on an active lead row.
  // Precedence is explicit — profile wins — but the overlap is logged so a
  // team member shadowed by a lead record is diagnosable.
  const collidingLead = await resolveLeadByPhone(normalizedPhone);
  if (collidingLead) {
    console.warn(
      `[elaya-whatsapp] phone collision: profile ${profile.id} also matches active lead ${collidingLead.id} — profile wins, lead pipeline skipped`,
    );
  }

  // Idempotency — BSPs redeliver; same contract as the lead pipeline's
  // wa_message_id dedup.
  if (await hasProcessedWaMessage(message.id)) return;

  const rawText =
    message.type === 'text' && typeof message.text.body === 'string' ? message.text.body : '';
  const content = sanitizeText(rawText).slice(0, MAX_INBOUND_CHARS);
  if (content.trim().length === 0) {
    await sendElayaWhatsAppReply(normalizedPhone, REPLY_TEXT_ONLY, profile.id);
    return;
  }

  // Daily cap — shared across channels (one count per user), enforced before
  // the model and before persisting, exactly like the in-app route.
  const [sentToday, cap] = await Promise.all([
    countUserMessagesToday(profile.id),
    getDailyMessageCap(),
  ]);
  if (sentToday >= cap) {
    await sendElayaWhatsAppReply(normalizedPhone, REPLY_CAP_REACHED, profile.id);
    return;
  }

  // One active session per user across channels — a WhatsApp message
  // continues the in-app conversation when one is live (24h window).
  const conversation = await getOrCreateActiveConversation(
    profile.id,
    await getSessionExpiryHours(),
    'whatsapp',
  );

  await insertUserMessage({
    conversationId: conversation.id,
    senderId: profile.id,
    content,
    channel: 'whatsapp',
    meta: { wa_message_id: message.id },
  });

  // No streaming on WhatsApp: the brain runs to completion, one reply.
  const principal = resolveStaffPrincipal(profile);
  const result = await runElayaTurn({
    principal,
    conversationId: conversation.id,
    emit: () => {},
    channel: 'whatsapp',
  });

  await insertAssistantMessage({
    conversationId: conversation.id,
    content: result.text,
    toolCalls: result.toolCalls,
    meta: result.meta,
    channel: 'whatsapp',
  });
  await touchConversation(conversation.id);

  // The transcript keeps the model's raw text; the wire gets WhatsApp-native
  // formatting (markdown ** / # would render as literal asterisks otherwise).
  const reply =
    result.text.trim().length > 0
      ? markdownToWhatsApp(result.text).slice(0, MAX_REPLY_CHARS)
      : REPLY_EMPTY;
  await sendElayaWhatsAppReply(normalizedPhone, reply, profile.id);
}
