// SERVER ONLY — Elaya's WhatsApp CUSTOMER channel (FEATURE 2 — the welcome-blast).
//
// The outward-facing twin of elaya-whatsapp.ts (the staff gate). Where the staff gate
// runs for a number that matches a profile, THIS runs for a number that is a LEAD — a
// prospect. It is wired INTO the lead pipeline (processInboundMessage), never replacing
// it: the lead is still created, round-robin assigned, and the founder/agent notified.
// The customer-Elaya layer is ADDITIVE on top.
//
// Two entry points, both called from processInboundMessage:
//   • maybeSendCustomerWelcome(lead) — on a brand-new lead's first message: the approved
//     Gupshup welcome TEMPLATE, fired EXACTLY ONCE per lead (the welcomed_at stamp guard).
//   • handleCustomerReply(...) — on a lead's subsequent inbound (session window now open):
//     run the customer brain (KB-grounded) and reply conversationally + share material.
//
// THE GOLDEN RULE: the customer turn runs as a CustomerPrincipal (resolveCustomerPrincipal)
// whose toolset is the hard cap — it cannot read any staff/CRM data. Money is ₹ only; facts
// come only from the training KB. Outbound sends use the one-log-row-per-attempt contract
// and run inside the webhook route's after() (the staff-gate lifecycle), so the 200 ack is
// never blocked and a frozen lambda never orphans a send.
//
// Persistence: the customer transcript is the EXISTING whatsapp_messages thread (keyed by
// lead_id) — Elaya's replies are direction:'outbound', sender_type:'bot' rows, visible in
// the agent's /whatsapp view. There is NO elaya_conversations row (that table is profile-
// keyed, staff-only by schema). The bot_active flag on whatsapp_conversations is the
// take-over switch: when an agent replies, bot_active flips off and Elaya stops auto-replying.

import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeText } from '@/lib/utils/sanitize';
import { markdownToWhatsApp, truncateWhatsAppText } from '@/lib/utils/whatsapp-format';
import { transcribeAudio } from '@/lib/services/transcription-service';
import {
  sendCustomerWelcomeTemplate,
  sendCustomerWhatsAppReply,
  sendGupshupMediaMessage,
} from '@/lib/services/whatsapp-api';
import { CUSTOMER_WELCOME_TEMPLATE_CONFIGURED } from '@/lib/constants/whatsapp';
import { resolveCustomerPrincipal } from '@/lib/elaya/principal';
import { runCustomerTurn, type CustomerTurnInput } from '@/lib/elaya/customer-brain';
import { isGiaDomain, type GiaDomain } from '@/lib/constants/domains';
import type { Lead } from '@/lib/types/database';
import type { MetaInboundMessage } from '@/lib/types/whatsapp';

const MAX_INBOUND_CHARS = 4000;
const MAX_REPLY_CHARS = 4000;
const HISTORY_WINDOW = 12; // recent thread rows fed to the customer brain
const VOICE_DOWNLOAD_TIMEOUT_MS = 15_000;
const VOICE_MAX_BYTES = 16 * 1024 * 1024;
/** Cap how many media assets a single turn sends — spaced + humanised, never a dump. */
const MAX_MEDIA_PER_TURN = 4;

const REPLY_FALLBACK =
  "Thank you for reaching out to Indulge — one of our concierges will be right with you.";

// ─────────────────────────────────────────────────────────────────────────
// maybeSendCustomerWelcome — the FIRST touch (approved template), exactly once.
//
// Called from processInboundMessage's brand-new-lead branch. The exactly-once contract is
// STAMP-ONCE-NEVER-ROLL-BACK: the UPDATE … WHERE welcomed_at IS NULL RETURNING is the atomic
// gate — only the single call that WINS the stamp ever sends, and the stamp is NEVER cleared
// afterward. A welcome template is a marketing nicety, not a transactional must-send: it is
// FAR safer to occasionally miss one (the lead still exists, the agent still follows up, and
// the conversational blast still fires on the customer's reply via the welcomed-IS-SET path)
// than to EVER double-message a real prospect. A rollback-on-failure (the obvious-but-wrong
// design) re-arms the guard and double-welcomes when a send is delivered-but-reported-failed
// or when a concurrent first message raced past the stamp — so we do NOT roll back.
//
// The ONE exception is the not-yet-configured template: if no real Gupshup welcome template
// id is set, we must NOT burn the stamp (else the lead can never be welcomed once it lands).
// So we check configuration BEFORE stamping and return early when unset — no stamp, no send.
//
// NEVER throws — a welcome failure must never break the lead pipeline it rides on.
// ─────────────────────────────────────────────────────────────────────────
export async function maybeSendCustomerWelcome(lead: Lead): Promise<void> {
  try {
    if (!lead.domain || !isGiaDomain(lead.domain)) return; // only Gia prospects
    if (!lead.phone) return;
    // Don't stamp before there's a template to send — else the lead is permanently marked
    // welcomed without ever receiving anything, and can never be welcomed once configured.
    if (!CUSTOMER_WELCOME_TEMPLATE_CONFIGURED) return;

    const admin = createAdminClient();
    // Exactly-once stamp: only the winner of this atomic UPDATE proceeds to send. A row
    // already stamped (welcomed_at NOT NULL) — or a concurrent first message that won the
    // stamp — returns zero rows → we stop. The stamp is NEVER cleared, so even a failed
    // send cannot re-arm the gate and double-welcome.
    const { data: won } = await admin
      .from('leads')
      .update({ welcomed_at: new Date().toISOString() })
      .eq('id', lead.id)
      .is('welcomed_at', null)
      .select('id')
      .maybeSingle();
    if (!won) return; // already welcomed (or raced) — never blast twice

    const firstName = (lead.first_name ?? '').trim() || 'there';
    // Best-effort: a failed send leaves the stamp in place. We accept a missed welcome over
    // any risk of a duplicate one (see the contract above). The conversational blast still
    // fires when the customer replies (welcomed_at is now set → the reply path).
    await sendCustomerWelcomeTemplate(lead.phone, firstName, lead.id);
  } catch (err) {
    console.error('[elaya-customer] maybeSendCustomerWelcome failed (non-fatal):', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// handleCustomerReply — a lead's inbound reply (session window open). Runs the customer
// brain and replies conversationally + shares material. Called from processInboundMessage
// AFTER the inbound row is recorded. Gated on bot_active (an agent take-over stops Elaya).
// Idempotency is the caller's wa_message_id dedup (processInboundMessage already exits on
// a duplicate before reaching here). NEVER throws.
// ─────────────────────────────────────────────────────────────────────────
export async function handleCustomerReply(args: {
  lead: Lead;
  conversationId: string;
  botActive: boolean;
  message: MetaInboundMessage;
}): Promise<void> {
  const { lead, conversationId, botActive, message } = args;
  try {
    if (!botActive) return; // an agent has taken over — Elaya stays quiet
    if (!lead.domain || !isGiaDomain(lead.domain)) return;
    if (!lead.phone) return;

    // Resolve the inbound to text (voice → transcript; media → caption; else nudge-free skip).
    const rawText = await resolveInboundText(message);
    if (!rawText) return; // nothing to act on (no text/caption/speech) — stay quiet
    const content = sanitizeText(rawText).slice(0, MAX_INBOUND_CHARS);
    if (content.trim().length === 0) return;

    const admin = createAdminClient();

    // Recent thread history (both directions) for context — oldest→newest.
    const { data: rows } = await admin
      .from('whatsapp_messages')
      .select('direction, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_WINDOW);
    const history: CustomerTurnInput[] = (rows ?? [])
      .reverse()
      .map((r: { direction: string; content: string | null }) => ({
        role: r.direction === 'outbound' ? ('assistant' as const) : ('user' as const),
        content: (r.content ?? '').trim(),
      }))
      .filter((m: CustomerTurnInput) => m.content.length > 0);
    // The just-recorded inbound is already in the thread; ensure the latest user line is present.
    if (history.length === 0 || history[history.length - 1].content !== content) {
      history.push({ role: 'user', content });
    }

    const principal = resolveCustomerPrincipal({
      id: lead.id,
      domain: lead.domain as GiaDomain,
      first_name: lead.first_name,
      last_name: lead.last_name,
    });

    const result = await runCustomerTurn({ principal, history });

    // Text reply FIRST (the conversational lead-in), THEN the material — never dump files
    // ahead of the message that frames them (the persona + design §5 "intro → then share").
    // Record the reply as a bot outbound row in the agent-visible thread.
    const replyText =
      result.text.trim().length > 0
        ? truncateWhatsAppText(markdownToWhatsApp(result.text), MAX_REPLY_CHARS)
        : REPLY_FALLBACK;
    await sendCustomerWhatsAppReply(lead.phone, replyText, lead.id);
    await recordBotMessage(admin, conversationId, lead.id, replyText);

    // Then any media the turn fetched (get_company_material's sendable urls). Spaced by
    // send_order, capped per turn so it's a conversation, not a dump. Best-effort.
    await sendTurnMedia(lead.phone, lead.id, result, admin, conversationId);
  } catch (err) {
    console.error('[elaya-customer] handleCustomerReply failed (non-fatal):', err);
  }
}

// ── Resolve an inbound message to text (text / caption / transcribed voice). ──
async function resolveInboundText(message: MetaInboundMessage): Promise<string | null> {
  if (message.type === 'text') {
    return typeof message.text.body === 'string' ? message.text.body : null;
  }
  if (message.type === 'audio' && message.audio.url) {
    const transcript = await transcribeWhatsAppAudio(message.audio.url, message.audio.mime_type);
    return transcript.trim().length > 0 ? transcript : null;
  }
  const caption =
    message.type === 'image' ? message.image.caption
    : message.type === 'video' ? message.video.caption
    : message.type === 'document' ? message.document.caption
    : undefined;
  return caption && caption.trim().length > 0 ? caption : null;
}

// ── Map a training-asset kind → the Gupshup media type. A 'fact' never reaches here
//    (it's text, not media); 'url'/'review'/'testimonial' default to document unless the
//    kind is clearly visual/AV. ──
function mediaTypeForKind(kind: string): 'image' | 'video' | 'document' | 'audio' {
  if (kind === 'image' || kind === 'work_example' || kind === 'review') return 'image';
  if (kind === 'video') return 'video';
  if (kind === 'podcast') return 'audio';
  return 'document'; // brochure, doc, testimonial, url, anything else
}

// ── Send the media a turn fetched (get_company_material), spaced + capped, recording
//    each as a bot row so the agent's thread shows what Elaya shared. Best-effort: a
//    single media failure never aborts the turn or the text reply. ──
async function sendTurnMedia(
  phone: string,
  leadId: string,
  result: Awaited<ReturnType<typeof runCustomerTurn>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  conversationId: string,
): Promise<void> {
  const assets = result.media.slice(0, MAX_MEDIA_PER_TURN);
  for (const asset of assets) {
    if (!asset.url) continue;
    const type = mediaTypeForKind(asset.kind);
    try {
      await sendGupshupMediaMessage(
        phone,
        type,
        asset.url,
        asset.title || undefined,
        type === 'document' ? `${asset.title || 'document'}` : undefined,
      );
      await admin.from('whatsapp_messages').insert({
        conversation_id: conversationId,
        lead_id:         leadId,
        direction:       'outbound',
        sender_type:     'bot',
        sender_id:       null,
        wa_message_id:   null,
        message_type:    type,
        content:         asset.title || null,
        media_url:       asset.url,
        media_mime_type: null,
        status:          null,
        status_at:       null,
        is_bot:          true,
      });
    } catch (err) {
      console.error('[elaya-customer] media send failed (non-fatal):', err);
    }
  }
}

// ── Record an Elaya customer reply as a bot outbound row (agent-visible thread). ──
async function recordBotMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  conversationId: string,
  leadId: string,
  text: string,
): Promise<void> {
  try {
    await admin.from('whatsapp_messages').insert({
      conversation_id: conversationId,
      lead_id:         leadId,
      direction:       'outbound',
      sender_type:     'bot',
      sender_id:       null,
      wa_message_id:   null,
      message_type:    'text',
      content:         text,
      media_url:       null,
      media_mime_type: null,
      status:          null,
      status_at:       null,
      is_bot:          true,
    });
    await admin
      .from('whatsapp_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);
  } catch (err) {
    console.error('[elaya-customer] recordBotMessage failed (non-fatal):', err);
  }
}

// ── Download + transcribe a Gupshup voice note (shared transcription-service). ──
async function transcribeWhatsAppAudio(url: string, mimeType: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VOICE_DOWNLOAD_TIMEOUT_MS);
  let audio: ArrayBuffer;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`[elaya-customer] voice-note download failed: ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > VOICE_MAX_BYTES) throw new Error('[elaya-customer] voice-note too large');
    audio = await res.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
  if (audio.byteLength === 0 || audio.byteLength > VOICE_MAX_BYTES) {
    throw new Error('[elaya-customer] voice-note invalid size');
  }
  return transcribeAudio(audio, mimeType || 'audio/ogg');
}

