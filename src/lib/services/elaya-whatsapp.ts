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
//
// TWO BRAINS, ONE GATE (Step 3, channel tranche 2026-08-31): the config row
// `brain_whatsapp` (elaya_settings, migration 0179 — read per message, no
// deploy to flip) decides who THINKS. `node` = the in-process brain below,
// unchanged. `python` = the FastAPI brain via lib/elaya/python-brain.ts, which
// then owns cap / session / persistence / the confirmation resolver / the turn
// for that message (its rows carry channel 'whatsapp' + the wa_message_id, the
// same columns as the Node path). Everything around the thinking — identity by
// phone, dedup, voice transcription, media handling, the single reply send, the
// learned-memory update — stays HERE, identical for both. No automatic
// fallback between brains on failure (a half-persisted turn must never run
// twice); the row IS the kill switch.

import { sanitizeText } from '@/lib/utils/sanitize';
import { normalizeWaPhone } from '@/lib/utils/phone';
import { markdownToWhatsApp, splitWhatsAppText } from '@/lib/utils/whatsapp-format';
import {
  getActiveProfileByPhone,
  getActiveStaffFirstNames,
} from '@/lib/services/profiles-service';
import { resolveLeadByPhone } from '@/lib/services/whatsapp-ingestion';
import { sendElayaWhatsAppReply } from '@/lib/services/whatsapp-api';
import { transcribeAudio } from '@/lib/services/transcription-service';
import { resolveStaffPrincipal, type StaffPrincipal } from '@/lib/elaya/principal';
import { runElayaTurn } from '@/lib/elaya/brain';
import { learnFromTurn } from '@/lib/elaya/memory';
import { isPythonBrainConfigured, runPythonBrainTurn } from '@/lib/elaya/python-brain';
import {
  countUserMessagesToday,
  getOrCreateActiveConversation,
  hasProcessedWaMessage,
  insertAssistantMessage,
  insertUserMessage,
  touchConversation,
} from '@/lib/services/elaya-service';
import {
  getDailyMessageCap,
  getElayaBrainForChannel,
  getSessionExpiryHours,
} from '@/lib/services/llm-providers-service';
import type { Profile } from '@/lib/types';
import type { MetaInboundMessage } from '@/lib/types/whatsapp';

/** Mirrors the in-app ElayaChatRequestSchema 4000-char bound. */
const MAX_INBOUND_CHARS = 4000;
/** Voice-note download bounds — a real note is tens-to-hundreds of KB. */
const VOICE_DOWNLOAD_TIMEOUT_MS = 15_000;
const VOICE_MAX_BYTES = 16 * 1024 * 1024;
/** WhatsApp text messages cap at 4096 chars — stay under it PER MESSAGE. A longer answer is
 * sent as several messages in order (2026-09-24), never cut: the founders want every name. */
const MAX_REPLY_CHARS = 4000;
/** A turn that runs past this sends one holding line first, so the phone is not silent while
 * the analyst reads the database (30 to 90 seconds on a real question). */
const ACK_AFTER_MS = 15_000;

// Channel copy — short, plain text, no markdown (WhatsApp surface).
const REPLY_TEXT_ONLY =
  'I can only read text and voice notes here for now — send me your question as a message or a voice note and I’ll take it from there.';
// Empty / non-speech voice note: a graceful nudge BEFORE the cap, model, or any
// persist — an empty transcript must never reach the brain (E4a failure mode 1).
const REPLY_NO_SPEECH =
  'I couldn’t catch anything in that voice note — try again, or send it as a message.';
const REPLY_CAP_REACHED =
  'You’ve reached your Elaya message limit for today. The count resets at midnight — see you then.';
// The line for a failure BEFORE the brain answered (the brain unreachable, the send path
// broken). A failure inside the brain gets a more specific line from the brain itself
// (backend/app/api/chat.py: the model's limit, overload, timeout), delivered as a normal reply.
const REPLY_UNAVAILABLE =
  'I could not reach my brain just now, so I cannot answer yet. Your message is saved: try again in a minute, and tell the tech team if it keeps happening.';
const REPLY_EMPTY = 'I don’t have an answer for that one — try rephrasing?';
const REPLY_WORKING = 'On it. This one needs a proper look, give me a minute.';

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
  // Idempotency FIRST — BSPs redeliver constantly; short-circuit a duplicate before
  // any other work (saves the collision-lookup round-trip on every redelivery). Same
  // contract as the lead pipeline's wa_message_id dedup.
  if (await hasProcessedWaMessage(message.id)) return;

  // Collision visibility: the staff number also exists on an active lead row.
  // Precedence is explicit — profile wins — but the overlap is logged so a
  // team member shadowed by a lead record is diagnosable.
  const collidingLead = await resolveLeadByPhone(normalizedPhone);
  if (collidingLead) {
    console.warn(
      `[elaya-whatsapp] phone collision: profile ${profile.id} also matches active lead ${collidingLead.id} — profile wins, lead pipeline skipped`,
    );
  }

  // Resolve the inbound message to text. Voice notes are transcribed here (E4a) —
  // voice is an INPUT TRANSFORM ONLY: once it's text, everything downstream (cap,
  // session, persist, brain, reply, E3 confirmation gate) is byte-identical to a
  // typed message. Audio bytes are transcribed in-memory and discarded — never
  // persisted (D-01 interim stance, same as the in-app voice note).
  let rawText: string;
  if (message.type === 'text') {
    rawText = typeof message.text.body === 'string' ? message.text.body : '';
  } else if (message.type === 'audio' && message.audio.url) {
    rawText = await transcribeWhatsAppAudio(message.audio.url, message.audio.mime_type);
    // Empty / non-speech transcript: nudge and stop BEFORE the cap, the model,
    // and any persist — never fire an empty prompt at the brain.
    if (rawText.trim().length === 0) {
      await sendElayaWhatsAppReply(normalizedPhone, REPLY_NO_SPEECH, profile.id);
      return;
    }
  } else {
    // image / video / document — Elaya can't see the media itself, but a CAPTION is
    // real text the user typed alongside it. Route the caption as the message rather
    // than discarding it behind the "text only" nudge; only nudge when there's no
    // caption to work with.
    const caption =
      message.type === 'image' ? message.image.caption
      : message.type === 'video' ? message.video.caption
      : message.type === 'document' ? message.document.caption
      : undefined;
    if (caption && caption.trim().length > 0) {
      rawText = caption;
    } else {
      await sendElayaWhatsAppReply(normalizedPhone, REPLY_TEXT_ONLY, profile.id);
      return;
    }
  }

  const isVoice = message.type === 'audio';
  const content = sanitizeText(rawText).slice(0, MAX_INBOUND_CHARS);
  if (content.trim().length === 0) {
    await sendElayaWhatsAppReply(normalizedPhone, REPLY_TEXT_ONLY, profile.id);
    return;
  }

  // Which brain thinks for WhatsApp (config row, read per message). The Python
  // branch is taken ONLY when the transport is actually configured — a flipped row
  // on a box without ELAYA_BRAIN_URL/BRAIN_API_SECRET keeps answering from Node
  // (warn-logged) rather than going silent.
  const brain = await getElayaBrainForChannel('whatsapp');
  let outcome: StaffTurnOutcome;
  if (brain === 'python') {
    if (isPythonBrainConfigured()) {
      outcome = await turnViaPythonBrain(profile, content, message.id, normalizedPhone, isVoice);
    } else {
      console.warn(
        '[elaya-whatsapp] brain_whatsapp=python but the Python transport is not configured — answered by the Node brain',
      );
      outcome = await turnViaNodeBrain(profile, content, message.id, isVoice);
    }
  } else {
    outcome = await turnViaNodeBrain(profile, content, message.id, isVoice);
  }

  if (outcome.kind === 'silent') return;
  if (outcome.kind === 'canned') {
    await sendElayaWhatsAppReply(normalizedPhone, outcome.text, profile.id);
    return;
  }

  // The transcript keeps the model's raw text; the wire gets WhatsApp-native
  // formatting (markdown ** / # would render as literal asterisks otherwise).
  // Truncation is marker-aware — a bare slice could cut a */_/~ pair in half
  // and leave the orphaned opener rendering literally.
  const parts =
    outcome.text.trim().length > 0
      ? splitWhatsAppText(markdownToWhatsApp(outcome.text), MAX_REPLY_CHARS)
      : [REPLY_EMPTY];
  for (const part of parts) {
    // Sequential and awaited: the parts must land in order, inside the after() window.
    await sendElayaWhatsAppReply(normalizedPhone, part, profile.id);
  }

  // Post-turn learned-memory update (Jarvis Phase 3) — AFTER the reply is sent, still
  // inside the webhook route's after() lambda-alive window. Throttled + non-fatal
  // (never throws). messagesToday = this message's ordinal today (shared
  // cross-channel cap); both brains report it, so the throttle cadence is identical.
  if (outcome.conversationId) {
    await learnFromTurn({ principal: outcome.principal, conversationId: outcome.conversationId });
  }
}

/**
 * What a brain turn produced, brain-agnostic. `reply` = a real answer to format and
 * send (+ what the learned-memory writer needs); `canned` = a fixed channel line
 * (cap reached / unavailable) sent as-is; `silent` = a duplicate delivery — say
 * nothing (the first delivery already answered).
 */
type StaffTurnOutcome =
  | {
      kind: 'reply';
      text: string;
      principal: StaffPrincipal;
      conversationId: string | null;
      messagesToday: number;
    }
  | { kind: 'canned'; text: string }
  | { kind: 'silent' };

/**
 * The in-process (Node) brain path — byte-for-byte the original WhatsApp turn:
 * shared daily cap → one active session across channels → append the user row
 * (with the wa_message_id dedup backstop) → the brain to completion → append the
 * assistant row → touch.
 */
async function turnViaNodeBrain(
  profile: Profile,
  content: string,
  waMessageId: string,
  isVoice = false,
): Promise<StaffTurnOutcome> {
  // Daily cap — shared across channels (one count per user), enforced before
  // the model and before persisting, exactly like the in-app route.
  const [sentToday, cap] = await Promise.all([
    countUserMessagesToday(profile.id),
    getDailyMessageCap(),
  ]);
  if (sentToday >= cap) {
    return { kind: 'canned', text: REPLY_CAP_REACHED };
  }

  // One active session per user across channels — a WhatsApp message
  // continues the in-app conversation when one is live (24h window).
  const conversation = await getOrCreateActiveConversation(
    profile.id,
    await getSessionExpiryHours(),
    'whatsapp',
  );

  const inserted = await insertUserMessage({
    conversationId: conversation.id,
    senderId: profile.id,
    content,
    channel: 'whatsapp',
    // `voice` marks a transcribed voice note (the audio itself is never kept).
    meta: { wa_message_id: waMessageId, ...(isVoice ? { voice: true } : {}) },
  });
  // Structural dedup backstop (M7): a concurrent redelivery already inserted this
  // exact wa_message_id (23505 on the partial UNIQUE index). The earlier
  // hasProcessedWaMessage check raced past it; stop here so we never run a second
  // brain turn, burn the cap again, or send a duplicate reply.
  if (inserted.duplicate) {
    return { kind: 'silent' };
  }

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

  return {
    kind: 'reply',
    text: result.text,
    principal,
    conversationId: conversation.id,
    messagesToday: sentToday + 1,
  };
}

/**
 * The Python brain path — the FastAPI brain owns cap / session / persistence /
 * resolver / turn for this message (its rows carry channel 'whatsapp' and the
 * wa_message_id, the same columns the Node path writes). This side only maps its
 * typed rejections onto the channel copy. The principal is still resolved here
 * because the learned-memory writer (Node-owned) needs it.
 */
async function turnViaPythonBrain(
  profile: Profile,
  content: string,
  waMessageId: string,
  phone: string,
  isVoice = false,
): Promise<StaffTurnOutcome> {
  const principal = resolveStaffPrincipal(profile);
  // The holding line: if the brain is still thinking after ACK_AFTER_MS, say so once, then
  // keep waiting for the real answer. Awaited (never detached) so it cannot outlive the lambda.
  const turn = runPythonBrainTurn({
    userId: profile.id,
    message: content,
    channel: 'whatsapp',
    waMessageId,
    voice: isVoice,
  });
  let ackTimer: ReturnType<typeof setTimeout> | undefined;
  const ack = new Promise<'ack'>((resolve) => { ackTimer = setTimeout(() => resolve('ack'), ACK_AFTER_MS); });
  const first = await Promise.race([turn.then(() => 'done' as const), ack]);
  if (first === 'ack') {
    await sendElayaWhatsAppReply(phone, REPLY_WORKING, profile.id);
  }
  if (ackTimer) clearTimeout(ackTimer);
  const result = await turn;

  if (result.ok) {
    return {
      kind: 'reply',
      text: result.text,
      principal,
      conversationId: result.conversationId,
      messagesToday: result.messagesToday,
    };
  }

  switch (result.reason) {
    case 'cap':
      return { kind: 'canned', text: REPLY_CAP_REACHED };
    case 'duplicate':
      // The brain's dedup index caught a redelivery our pre-check raced past —
      // the first delivery already answered.
      return { kind: 'silent' };
    case 'unauthorized':
      // Secret drift between the four BRAIN_API_SECRET homes, or the brain no
      // longer recognises the profile. Loud log (the ops signature), honest reply.
      console.error(
        `[elaya-whatsapp] python brain refused the turn (${result.status}) — check BRAIN_API_SECRET parity (maintenance ledger #4)`,
      );
      return { kind: 'canned', text: REPLY_UNAVAILABLE };
    case 'unconfigured':
    case 'unavailable':
    default:
      // A mid-stream failure may already have said something real — e.g. the
      // resolver's "Done — moved X to In Discussion." line for an action that DID
      // execute. Deliver what she said rather than a contradiction; otherwise the
      // channel's standard unavailable line.
      if (result.partialText && result.partialText.trim().length > 0) {
        return {
          kind: 'reply',
          text: result.partialText,
          principal,
          conversationId: null,
          messagesToday: 0,
        };
      }
      return { kind: 'canned', text: REPLY_UNAVAILABLE };
  }
}

/**
 * Download a Gupshup voice note from its time-limited CDN url and transcribe it
 * (Deepgram, via the shared server-only transcription-service — the SAME call
 * site the notes section uses; never a second STT path). Returns the trimmed
 * transcript ('' for silence / non-speech). Throws on a download/transcription
 * failure — the caller's try/catch maps that to REPLY_UNAVAILABLE and the gate
 * still returns handled, so a failed voice note never mints a lead.
 */
async function transcribeWhatsAppAudio(url: string, mimeType: string): Promise<string> {
  // Bound the download: a 15s timeout (the CDN url is time-limited and the lambda
  // budget is finite) + a 16 MB cap (a voice note is tens-to-hundreds of KB; a huge
  // body is bad data, not a real note). Both throw → caller maps to REPLY_UNAVAILABLE.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VOICE_DOWNLOAD_TIMEOUT_MS);
  let audio: ArrayBuffer;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) {
      throw new Error(`[elaya-whatsapp] voice-note download failed: ${res.status}`);
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > VOICE_MAX_BYTES) {
      throw new Error(`[elaya-whatsapp] voice-note too large: ${declared} bytes`);
    }
    audio = await res.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
  if (audio.byteLength === 0) {
    throw new Error('[elaya-whatsapp] voice-note download was empty');
  }
  if (audio.byteLength > VOICE_MAX_BYTES) {
    throw new Error(`[elaya-whatsapp] voice-note too large: ${audio.byteLength} bytes`);
  }
  // Staff-roster keyword boost (layer 1 of name resolution): staff voice notes
  // constantly name teammates ("Arfam ko bolo…"), and unboosted STT mangles
  // those into artifacts ("Arapham"). Non-fatal — an empty roster just means
  // an unboosted transcription.
  const staffNames = await getActiveStaffFirstNames();
  return transcribeAudio(audio, mimeType || 'audio/ogg', staffNames);
}
