// SERVER ONLY. THE public bot's orchestrator (0252, docs/architecture/indulge-bot-plan.md).
// Rewritten in place from the June customer layer; there is no second copy.
//
// Called by processInboundMessage for a message on the PUBLIC Indulge number, after the lead,
// its assignment, its new-lead alert and the inbound row all exist. The bot is a layer on a
// recorded conversation: anything that fails here loses nothing, and the agent still has the chat.
//
// The order of one inbound message (plan sections 10 and 11):
//   switch → opted out / agent took over → opt-out words → existing member → no words (an image)
//   → settle (a newer message takes over) → the conversation lock → per-phone and daily ceilings
//   → the published pack → the turn (customer-brain.ts) → the output guard → send the reply →
//   send queued library items → the brief and the alerts (a hand-over) → the turn ledger.
//
// THE GOLDEN RULE: the turn runs as a CustomerPrincipal whose three tools read nothing. Code, never
// the model, decides who is a member, who is a test phone, what was sent and what may leave.

import { createAdminClient } from '@/lib/supabase/admin';
import { giaDb, memberDb } from '@/lib/supabase/schemas';
import { redis } from '@/lib/redis';
import { markdownToWhatsApp, truncateWhatsAppText } from '@/lib/utils/whatsapp-format';
import { toISTMidnight } from '@/lib/utils/ist';
import { transcribeAudio } from '@/lib/services/transcription-service';
import { sendPublicBotText } from '@/lib/services/whatsapp-api';
import { getPublicBotSettings } from '@/lib/services/llm-providers-service';
import { forbiddenPhrasesFromPack, getGuardNames, getLatestPack } from '@/lib/services/bot-knowledge-service';
import { getLibraryItems, getSentAssetIds, sendLibraryItemCore, type ConversationRef } from '@/lib/services/bot-library-service';
import { guardInbound, guardOutbound, isOptOut, type GuardHit } from '@/lib/services/bot-guards';
import { alertHandover, alertMemberQueen, recordConciergeBriefCore, type ConciergeBrief } from '@/lib/services/public-bot-handover';
import { resolveCustomerPrincipal } from '@/lib/elaya/principal';
import { runCustomerTurn, type CustomerTurnInput, type PublicTurnResult } from '@/lib/elaya/customer-brain';
import {
  HANDOVER_REASONS_WITHOUT_ALERT,
  PUBLIC_BOT_CALL_WINDOW,
  PUBLIC_BOT_LIMITS,
  PUBLIC_BOT_LINES,
  PUBLIC_BOT_REDIS,
  type HandoverReason,
  type PublicBotTurnOutcome,
} from '@/lib/constants/public-bot';
import { isGiaDomain, type GiaDomain } from '@/lib/constants/domains';
import type { Json, Lead } from '@/lib/types/database';
import type { MetaInboundMessage, WhatsAppConversation } from '@/lib/types/whatsapp';

const VOICE_DOWNLOAD_TIMEOUT_MS = 15_000;
const VOICE_MAX_BYTES = 16 * 1024 * 1024;

export type PublicMember = { id: string; full_name: string | null; queendom_id: string | null };

/** What code knows about the sender before any model runs. */
export type PublicInboundContext = {
  isTestPhone: boolean;
  member: PublicMember | null;
};

const last10 = (phone: string) => phone.replace(/\D/g, '').slice(-10);

// ─── Who is writing (code, never the model) ───────────────────────────────────

/** A team test phone (no alerts) or an existing member (their own team, not sales). */
export async function getPublicInboundContext(normalizedPhone: string): Promise<PublicInboundContext> {
  const digits = last10(normalizedPhone);
  const settings = await getPublicBotSettings();
  let member: PublicMember | null = null;
  if (digits.length === 10) {
    try {
      const { data } = await memberDb(createAdminClient())
        .from('members')
        .select('id, full_name, queendom_id, primary_phone, alt_phones')
        .or(`primary_phone.ilike.%${digits},alt_phones.cs.{${normalizedPhone}},alt_phones.cs.{${digits}}`)
        .limit(1);
      const row = (data ?? [])[0] as (PublicMember & { primary_phone: string | null }) | undefined;
      if (row) member = { id: row.id, full_name: row.full_name, queendom_id: row.queendom_id };
    } catch (e) {
      console.warn('[public-bot] member lookup failed (treated as not a member):', e);
    }
  }
  return { isTestPhone: settings.testPhones.includes(digits), member };
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A first name that is a name, never the phone number ingestion falls back to. */
function realFirstName(lead: Pick<Lead, 'first_name'>): string | null {
  const n = (lead.first_name ?? '').trim();
  return n && !/\d{5,}/.test(n) ? n.split(/\s+/)[0] : null;
}

async function transcribeWhatsAppAudio(url: string, mimeType: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VOICE_DOWNLOAD_TIMEOUT_MS);
  let audio: ArrayBuffer;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`voice-note download failed: ${res.status}`);
    if (Number(res.headers.get('content-length') ?? 0) > VOICE_MAX_BYTES) throw new Error('voice-note too large');
    audio = await res.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
  if (audio.byteLength === 0 || audio.byteLength > VOICE_MAX_BYTES) throw new Error('voice-note invalid size');
  return transcribeAudio(audio, mimeType || 'audio/ogg');
}

/** The words of an inbound message: text, a caption, or a voice note transcribed in memory. */
async function wordsOf(message: MetaInboundMessage): Promise<string | null> {
  if (message.type === 'text') return typeof message.text.body === 'string' && message.text.body.trim() ? message.text.body : null;
  // A button or list reply is the option the person chose; a reaction, a sticker, a location or a
  // contact card carries no words and never starts a paid turn (2026-10-02).
  if (message.type === 'interactive') return message.interactive.title.trim() ? message.interactive.title : null;
  if (message.type === 'reaction' || message.type === 'unsupported') return null;
  if (message.type === 'audio' && message.audio.url) {
    try {
      const t = await transcribeWhatsAppAudio(message.audio.url, message.audio.mime_type);
      return t.trim() ? t : null;
    } catch (e) {
      console.warn('[public-bot] voice note not transcribed:', e instanceof Error ? e.message : e);
      return null;
    }
  }
  const caption =
    message.type === 'image' ? message.image.caption
    : message.type === 'video' ? message.video.caption
    : message.type === 'document' ? message.document.caption
    : undefined;
  return caption && caption.trim() ? caption : null;
}

async function recordBotText(conversation: ConversationRef, text: string, waMessageId: string | null): Promise<void> {
  const admin = createAdminClient();
  const { error } = await giaDb(admin).from('whatsapp_messages').insert({
    conversation_id: conversation.id,
    lead_id: conversation.lead_id,
    direction: 'outbound',
    sender_type: 'bot',
    sender_id: null,
    wa_message_id: waMessageId,
    message_type: 'text',
    content: text,
    media_url: null,
    media_mime_type: null,
    status: 'sent',
    status_at: new Date().toISOString(),
    is_bot: true,
  });
  if (error) console.error('[public-bot] bot reply not recorded:', error.message);
  await giaDb(admin).from('whatsapp_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);
}

/** Send one of the fixed lines (never model-written) and record it. */
async function sayLine(conversation: ConversationRef, line: string): Promise<boolean> {
  const { delivered, messageId } = await sendPublicBotText(conversation.wa_id, line, conversation.lead_id, conversation.line);
  if (delivered) await recordBotText(conversation, line, messageId);
  return delivered;
}

async function setBotState(conversationId: string, state: 'handed_over' | 'opted_out', reason: HandoverReason | null): Promise<void> {
  const { error } = await giaDb(createAdminClient())
    .from('whatsapp_conversations')
    .update({ bot_state: state, handed_over_at: new Date().toISOString(), handover_reason: reason })
    .eq('id', conversationId);
  if (error) console.error('[public-bot] bot state not saved:', error.message);
}

async function writeLedger(row: {
  conversation: ConversationRef;
  outcome: PublicBotTurnOutcome;
  turn?: PublicTurnResult | null;
  packVersion?: number | null;
  sent?: string[];
  inputGuard?: Record<string, unknown>;
  outputGuard?: { hits: GuardHit[] } | Record<string, unknown>;
  handoverReason?: HandoverReason | null;
  startedAt: number;
}): Promise<void> {
  const t = row.turn;
  const { error } = await giaDb(createAdminClient()).from('whatsapp_bot_turns').insert({
    conversation_id: row.conversation.id,
    lead_id: row.conversation.lead_id,
    line: row.conversation.line,
    outcome: row.outcome,
    model: t?.model || null,
    pack_version: row.packVersion ?? null,
    input_tokens: t?.usage.inputTokens ?? 0,
    output_tokens: t?.usage.outputTokens ?? 0,
    cache_read_tokens: t?.usage.cacheReadTokens ?? 0,
    cache_write_tokens: t?.usage.cacheWriteTokens ?? 0,
    cost_usd: t?.costUsd ?? 0,
    tools: (t?.toolCalls.map((c) => ({ name: c.name, input: c.input })) ?? []) as unknown as Json,
    sent_asset_ids: row.sent ?? [],
    input_guard: (row.inputGuard ?? {}) as Json,
    output_guard: (row.outputGuard ?? {}) as unknown as Json,
    handover_reason: row.handoverReason ?? null,
    latency_ms: Date.now() - row.startedAt,
  });
  if (error) console.error('[public-bot] ledger row not written:', error.message);
}

/** Today's spend so far (IST day), from the ledger. */
async function spentTodayUsd(): Promise<number> {
  const { data } = await giaDb(createAdminClient())
    .from('whatsapp_bot_turns')
    .select('cost_usd')
    .gte('created_at', toISTMidnight(new Date()).toISOString())
    .limit(10_000);
  return ((data ?? []) as { cost_usd: number | string }[]).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
}

/** Count one message against this phone's hour and day. Redis down = not counted (the daily cap still holds). */
async function overPhoneCeiling(phone: string): Promise<{ over: boolean; firstOver: boolean }> {
  try {
    const now = new Date();
    const digits = last10(phone);
    const hourKey = PUBLIC_BOT_REDIS.phoneHour(digits, now.toISOString().slice(0, 13));
    const dayKey = PUBLIC_BOT_REDIS.phoneDay(digits, toISTMidnight(now).toISOString().slice(0, 10));
    const [h, d] = await Promise.all([redis.incr(hourKey), redis.incr(dayKey)]);
    if (h === 1) await redis.expire(hourKey, 3_600);
    if (d === 1) await redis.expire(dayKey, 86_400);
    const over = h > PUBLIC_BOT_LIMITS.perPhonePerHour || d > PUBLIC_BOT_LIMITS.perPhonePerDay;
    const firstOver = h === PUBLIC_BOT_LIMITS.perPhonePerHour + 1 || d === PUBLIC_BOT_LIMITS.perPhonePerDay + 1;
    return { over, firstOver };
  } catch (e) {
    console.warn('[public-bot] phone ceiling not counted (redis):', e);
    return { over: false, firstOver: false };
  }
}

/** Wait out the settle time; false when a newer message arrived (it answers instead). */
async function settle(conversationId: string, messageId: string): Promise<boolean> {
  const key = PUBLIC_BOT_REDIS.latestInbound(conversationId);
  try {
    await redis.set(key, messageId, { ex: 300 });
  } catch {
    return true;
  }
  await sleep(PUBLIC_BOT_LIMITS.settleMs);
  try {
    return (await redis.get<string>(key)) === messageId;
  } catch {
    return true;
  }
}

/** The conversation lock (one turn at a time). Returns a release function, or null. */
async function takeLock(conversationId: string, messageId: string): Promise<(() => Promise<void>) | null> {
  const key = PUBLIC_BOT_REDIS.lock(conversationId);
  const token = `${messageId}:${Date.now()}`;
  const deadline = Date.now() + PUBLIC_BOT_LIMITS.lockWaitMs;
  try {
    for (;;) {
      if ((await redis.set(key, token, { nx: true, ex: PUBLIC_BOT_LIMITS.lockSeconds })) === 'OK') break;
      if (Date.now() > deadline) return null;
      await sleep(1_000);
    }
  } catch {
    return async () => {};
  }
  return async () => {
    try {
      if ((await redis.get<string>(key)) === token) await redis.del(key);
    } catch {
      // the lock expires on its own
    }
  };
}

// ─── The hand-over (shared by the model's hand_over and the code's own) ───────

async function handOver(args: {
  lead: Lead;
  conversation: ConversationRef;
  context: PublicInboundContext;
  reason: HandoverReason;
  business?: ConciergeBrief['business'];
  summary: string;
  inTheirWords?: string | null;
  interests?: string[];
  sent?: string[];
  callTime?: string | null;
}): Promise<void> {
  const promised = ['call_requested', 'wants_to_buy'].includes(args.reason)
    ? args.callTime ? `A call at ${args.callTime} (${PUBLIC_BOT_CALL_WINDOW})` : `A call ${PUBLIC_BOT_CALL_WINDOW}`
    : null;
  const brief: ConciergeBrief = {
    reason: args.reason,
    business: args.business ?? 'membership',
    summary: args.summary,
    inTheirWords: args.inTheirWords ?? null,
    interests: args.interests ?? [],
    sent: args.sent ?? [],
    promised,
    nextStep: promised ? 'Call them in the window they chose' : 'Reply to them here',
  };
  const ref = { id: args.lead.id, slug: args.lead.slug ?? null, domain: args.lead.domain ?? null, first_name: realFirstName(args.lead), assigned_to: args.lead.assigned_to ?? null };
  await recordConciergeBriefCore(ref, brief);
  await setBotState(args.conversation.id, 'handed_over', args.reason);
  await alertHandover(ref, brief, { quiet: args.context.isTestPhone, withoutAlert: HANDOVER_REASONS_WITHOUT_ALERT.includes(args.reason) });
}

// ─── The entry point ──────────────────────────────────────────────────────────

/**
 * One inbound message on the public line. Never throws (the caller logs, the lead pipeline has
 * already finished). Awaited inside the webhook's after(), so every send and write completes.
 */
export async function handlePublicInbound(args: {
  lead: Lead;
  conversation: WhatsAppConversation;
  message: MetaInboundMessage;
  referral: Record<string, unknown> | null;
  context: PublicInboundContext;
}): Promise<void> {
  const startedAt = Date.now();
  const { lead, message, context } = args;
  const conversation: ConversationRef = { id: args.conversation.id, lead_id: args.conversation.lead_id, wa_id: args.conversation.wa_id, line: 'public' };

  const settings = await getPublicBotSettings();
  if (!settings.enabled) return;
  if (args.conversation.bot_state === 'opted_out') return;
  if (args.conversation.bot_active === false) return; // an agent took over; the bot stays quiet
  if (!lead.domain || !isGiaDomain(lead.domain)) return;

  const words = await wordsOf(message);

  // Opt-out: recorded and acknowledged once, never messaged again.
  if (words && isOptOut(words)) {
    await setBotState(conversation.id, 'opted_out', null);
    await sayLine(conversation, PUBLIC_BOT_LINES.optedOut);
    await writeLedger({ conversation, outcome: 'opted_out', startedAt });
    return;
  }

  // An existing member: their own team, once; then the bot stays out of it.
  if (context.member) {
    if (args.conversation.bot_state === 'handed_over') return;
    await sayLine(conversation, PUBLIC_BOT_LINES.existingMember);
    await setBotState(conversation.id, 'handed_over', 'existing_member');
    await alertMemberQueen(context.member, words ?? '(a file)');
    await writeLedger({ conversation, outcome: 'handed_over', handoverReason: 'existing_member', startedAt });
    return;
  }

  // A file with no words (often a screenshot of something they want): a person looks at it.
  if (!words) {
    if (['image', 'video', 'document'].includes(message.type)) {
      await sayLine(conversation, PUBLIC_BOT_LINES.imageReceived);
      await handOver({ lead, conversation, context, reason: 'image_without_caption', summary: 'They sent a file with no message. Please look at it in the chat.' });
      await writeLedger({ conversation, outcome: 'handed_over', handoverReason: 'image_without_caption', startedAt });
    }
    return;
  }

  // Settle: three quick messages get one considered answer, from the last of them.
  if (!(await settle(conversation.id, message.id))) return;
  const release = await takeLock(conversation.id, message.id);
  if (!release) return; // another turn is still running; the next message is answered by it or after it

  try {
    // A newer message arrived while this one waited for the lock: it answers instead.
    try {
      const latest = await redis.get<string>(PUBLIC_BOT_REDIS.latestInbound(conversation.id));
      if (latest && latest !== message.id) return;
    } catch {
      // carry on
    }

    // Ceilings: per phone (Redis), then the day's spend (the ledger).
    const phone = await overPhoneCeiling(lead.phone ?? conversation.wa_id);
    if (phone.over) {
      if (phone.firstOver) {
        await sayLine(conversation, PUBLIC_BOT_LINES.capped);
        await handOver({ lead, conversation, context, reason: 'capped', summary: 'They sent many messages in a short time; the concierge stepped back. Please take over.' });
      }
      await writeLedger({ conversation, outcome: 'capped', handoverReason: phone.firstOver ? 'capped' : null, startedAt });
      return;
    }
    if ((await spentTodayUsd()) >= settings.dailyCapUsd) {
      await sayLine(conversation, PUBLIC_BOT_LINES.capped);
      await handOver({ lead, conversation, context, reason: 'capped', summary: "The concierge reached today's spending limit. Please reply to them here." });
      await writeLedger({ conversation, outcome: 'capped', handoverReason: 'capped', startedAt });
      return;
    }

    // The pack. No published pack = the bot does not speak (the agent has the chat).
    const pack = await getLatestPack();
    if (!pack) {
      console.warn('[public-bot] no published knowledge pack; the bot stays quiet');
      return;
    }

    // The conversation, through the input guard.
    const admin = createAdminClient();
    const { data: rows } = await giaDb(admin)
      .from('whatsapp_messages')
      .select('direction, content, message_type')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(PUBLIC_BOT_LIMITS.historyMessages);
    const ordered = ((rows ?? []) as { direction: string; content: string | null; message_type: string }[]).reverse();
    const inputFound = new Set<string>();
    const history: CustomerTurnInput[] = ordered.map((r) => {
      if (r.direction === 'outbound') return { role: 'assistant', content: r.content ?? '' };
      const raw = r.content?.trim() ? r.content : r.message_type !== 'text' ? `(sent a ${r.message_type})` : '';
      const g = guardInbound(raw);
      g.found.forEach((f) => inputFound.add(f));
      return { role: 'user', content: g.text };
    });
    // A voice note's transcript is not stored on the row: the latest turn carries the words.
    const latestWords = guardInbound(words);
    latestWords.found.forEach((f) => inputFound.add(f));
    const lastInbound = [...history].reverse().find((h) => h.role === 'user');
    if (!lastInbound || lastInbound.content !== latestWords.text) history.push({ role: 'user', content: latestWords.text });

    const [sentIds, libraryInPack] = await Promise.all([getSentAssetIds(conversation.id), getLibraryItems(pack.assetIds)]);
    const sentTitles = [...sentIds].map((id) => libraryInPack.get(id)?.title).filter((t): t is string => !!t);
    const referral = args.referral;
    const cameFrom = referral
      ? [referral.headline, referral.body, referral.source_url].filter((v): v is string => typeof v === 'string' && v.trim().length > 0).join(' | ').slice(0, 300) || null
      : null;

    const turn = await runCustomerTurn({
      principal: resolveCustomerPrincipal({ id: lead.id, domain: lead.domain as GiaDomain, first_name: realFirstName(lead), last_name: null }),
      packText: pack.text,
      libraryIds: new Set(libraryInPack.keys()),
      sentIds,
      history,
      context: {
        firstName: realFirstName(lead),
        firstReply: !ordered.some((r) => r.direction === 'outbound'),
        alreadySent: sentTitles,
        interests: Array.isArray(lead.service_interests) ? lead.service_interests : [],
        cameFrom,
        handedOver: args.conversation.bot_state === 'handed_over',
      },
    });

    // No reply from the model (an error, a refusal, nothing written): a person takes it.
    if (!turn.text) {
      await sayLine(conversation, PUBLIC_BOT_LINES.failed);
      await handOver({ lead, conversation, context, reason: 'unsure', summary: `The concierge could not answer (${turn.error ?? 'no reply'}). Please reply to them here.`, interests: turn.interests });
      await writeLedger({ conversation, outcome: 'error', turn, packVersion: pack.version, inputGuard: { found: [...inputFound] }, handoverReason: 'unsure', startedAt });
      return;
    }

    // The output guard. A hit: the reply never leaves; a safe line goes and a person takes over.
    const reply = truncateWhatsAppText(markdownToWhatsApp(turn.text), PUBLIC_BOT_LIMITS.maxReplyChars);
    const verdict = guardOutbound(reply, {
      packText: pack.text,
      libraryUrls: [...libraryInPack.values()].map((i) => i.publicUrl).filter((u): u is string => !!u),
      names: await getGuardNames(),
      forbiddenPhrases: forbiddenPhrasesFromPack(pack.text),
      conversationText: history.filter((h) => h.role === 'user').map((h) => h.content).join('\n'),
      personName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null,
    });
    if (!verdict.ok) {
      console.warn('[public-bot] reply held back by the output guard:', verdict.hits);
      await sayLine(conversation, PUBLIC_BOT_LINES.heldBack);
      await handOver({ lead, conversation, context, reason: 'guard_blocked', summary: 'A reply was held back by the safety check. Please read the chat and reply to them here.', interests: turn.interests });
      await writeLedger({ conversation, outcome: 'blocked', turn, packVersion: pack.version, inputGuard: { found: [...inputFound] }, outputGuard: { hits: verdict.hits }, handoverReason: 'guard_blocked', startedAt });
      return;
    }

    // The reply, then the files it framed.
    const delivered = await sayLine(conversation, reply);
    const sent: string[] = [];
    if (delivered) {
      for (const id of turn.queuedSends) {
        const item = libraryInPack.get(id);
        if (!item || sentIds.has(id)) continue;
        await sleep(PUBLIC_BOT_LIMITS.sendGapMs);
        const r = await sendLibraryItemCore({ conversation, item, sender: { kind: 'bot' }, firstName: realFirstName(lead) });
        if (r.delivered > 0) sent.push(id);
      }
    }

    // The hand-over the model asked for.
    if (turn.handover) {
      await handOver({
        lead,
        conversation,
        context,
        reason: turn.handover.reason,
        business: turn.handover.business,
        summary: turn.handover.summary,
        inTheirWords: turn.handover.inTheirWords,
        interests: turn.interests,
        sent: [...sentTitles, ...sent.map((id) => libraryInPack.get(id)?.title ?? id)],
        callTime: turn.handover.callTime,
      });
    }

    await writeLedger({
      conversation,
      outcome: turn.handover ? 'handed_over' : 'replied',
      turn,
      packVersion: pack.version,
      sent,
      inputGuard: { found: [...inputFound] },
      outputGuard: { hits: [] },
      handoverReason: turn.handover?.reason ?? null,
      startedAt,
    });
  } finally {
    await release();
  }
}
