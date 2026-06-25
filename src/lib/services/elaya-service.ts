// Elaya conversation/message DB access (migration 0116). SERVER ONLY.
//
// Write posture: user-role rows could be inserted on the session client (RLS
// allows own-conversation user inserts), but the chat route is the single
// authenticated entry point and passes only session-derived identity args, so
// all writes go through the admin client here (Q-13 convention — the caller is
// the trust boundary). Reads for the UI use the session client so RLS
// double-enforces ownership (A-09).
//
// No Redis: chat must always be live; the daily-cap count is one indexed
// predicate (idx_elaya_messages_sender_day).

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { toISTMidnight } from '@/lib/utils/ist';
import { getDailyMessageCap, getSessionExpiryHours } from '@/lib/services/llm-providers-service';
import { getElayaTimeGreeting, pickElayaDailyLine } from '@/lib/constants/elaya';
import type {
  ElayaChannel,
  ElayaConversation,
  ElayaMessageRow,
  ElayaToolCallRecord,
} from '@/lib/types/elaya';
import type { Profile } from '@/lib/types/database';

/** Verbatim history window handed to the model — the last 10 messages. */
export const ELAYA_MODEL_CONTEXT_MESSAGES = 10;
/** Transcript window rendered in the UI. */
export const ELAYA_UI_MESSAGES = 50;

// ─────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────

/**
 * The user's active conversation, respecting the session expiry window:
 * a conversation whose last_message_at is older than `expiryHours` is expired —
 * a new one is created. Expiry is server-enforced here, never client-side.
 *
 * ONE session per user across channels (WhatsApp channel decision 2026-06-12):
 * the read deliberately does NOT filter on channel — a WhatsApp message
 * continues the same active session the in-app chat uses, so context follows
 * the user between channels. `originChannel` only stamps a newly created row.
 */
export async function getOrCreateActiveConversation(
  userId: string,
  expiryHours: number,
  originChannel: ElayaChannel = 'in_app',
): Promise<ElayaConversation> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - expiryHours * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: readError } = await (supabase as any)
    .from('elaya_conversations')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null)
    .gte('last_message_at', cutoff)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) {
    console.error('[elaya-service] conversation read failed:', readError.message);
  }
  if (existing) return existing as ElayaConversation;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error: insertError } = await (supabase as any)
    .from('elaya_conversations')
    .insert({ user_id: userId, channel: originChannel })
    .select('*')
    .single();

  if (insertError || !created) {
    console.error('[elaya-service] conversation insert failed:', insertError?.message);
    throw new Error('Could not start an Elaya conversation');
  }
  return created as ElayaConversation;
}

/** Verify a conversation id belongs to the user (route-level ownership check, S-06). */
export async function getOwnedConversation(
  conversationId: string,
  userId: string,
): Promise<ElayaConversation | null> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('elaya_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .is('archived_at', null)
    .maybeSingle();
  return (data as ElayaConversation | null) ?? null;
}

export async function touchConversation(conversationId: string): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('elaya_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (error) console.warn('[elaya-service] touchConversation failed:', error.message);
}

// ─────────────────────────────────────────────
// Messages (append-only — inserts only, ever)
// ─────────────────────────────────────────────

/** Oldest-first transcript for the UI — session client so RLS enforces ownership. */
export async function getConversationMessages(
  conversationId: string,
  limit: number = ELAYA_UI_MESSAGES,
): Promise<ElayaMessageRow[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('elaya_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[elaya-service] messages read failed:', error.message);
    return [];
  }
  return ((data ?? []) as ElayaMessageRow[]).reverse();
}

/** Last-N verbatim window for the model (admin client — called by the brain). */
export async function getModelContextMessages(
  conversationId: string,
  limit: number = ELAYA_MODEL_CONTEXT_MESSAGES,
): Promise<ElayaMessageRow[]> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('elaya_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[elaya-service] model context read failed:', error.message);
    return [];
  }
  return ((data ?? []) as ElayaMessageRow[]).reverse();
}

/**
 * Insert the inbound user message. Returns `{ duplicate: true }` when the partial
 * UNIQUE index on the WhatsApp wa_message_id rejects a raced redelivery (23505,
 * migration 0148 — M7): the SAME inbound message reached us twice and a row already
 * exists, so the caller must NOT run a second brain turn. Throws on any other error.
 */
export async function insertUserMessage(args: {
  conversationId: string;
  senderId: string;
  content: string;
  channel?: ElayaChannel;
  meta?: Record<string, unknown>;
}): Promise<{ duplicate: false; row: ElayaMessageRow } | { duplicate: true }> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('elaya_messages')
    .insert({
      conversation_id: args.conversationId,
      sender_id: args.senderId,
      role: 'user',
      channel: args.channel ?? 'in_app',
      content: args.content,
      meta: args.meta ?? null,
    })
    .select('*')
    .single();

  if (error) {
    // 23505 = unique violation on idx_elaya_messages_wa_dedup → the WhatsApp message
    // was already processed by a concurrent redelivery. Not an error — the structural
    // backstop firing. The caller short-circuits without a second turn.
    if ((error as { code?: string }).code === '23505') {
      return { duplicate: true };
    }
    console.error('[elaya-service] user message insert failed:', error.message);
    throw new Error('Could not save the message');
  }
  if (!data) throw new Error('Could not save the message');
  return { duplicate: false, row: data as ElayaMessageRow };
}

export async function insertAssistantMessage(args: {
  conversationId: string;
  content: string;
  toolCalls: ElayaToolCallRecord[];
  meta: Record<string, unknown>;
  channel?: ElayaChannel;
}): Promise<ElayaMessageRow | null> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('elaya_messages')
    .insert({
      conversation_id: args.conversationId,
      sender_id: null,
      role: 'assistant',
      channel: args.channel ?? 'in_app',
      content: args.content,
      tool_calls: args.toolCalls.length > 0 ? args.toolCalls : null,
      meta: args.meta,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[elaya-service] assistant message insert failed:', error?.message);
    return null;
  }
  return data as ElayaMessageRow;
}

/**
 * WhatsApp-channel idempotency guard — has this Gupshup message id already been
 * persisted? Mirrors the lead pipeline's wa_message_id dedup (BSPs redeliver).
 * Fails open (false): a broken check must not silently drop a staff message.
 */
export async function hasProcessedWaMessage(waMessageId: string): Promise<boolean> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('elaya_messages')
    .select('id')
    .eq('channel', 'whatsapp')
    .eq('role', 'user')
    .eq('meta->>wa_message_id', waMessageId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[elaya-service] wa dedup check failed:', error.message);
    return false;
  }
  return Boolean(data);
}

// ─────────────────────────────────────────────
// Daily cap (server-enforced — the route rejects before any model call)
// ─────────────────────────────────────────────

/** User-authored messages since IST midnight, across all the user's conversations. */
export async function countUserMessagesToday(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const todayStartIst = toISTMidnight(new Date()).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('elaya_messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .eq('role', 'user')
    .gte('created_at', todayStartIst);

  if (error) {
    console.error('[elaya-service] cap count failed:', error.message);
    // Fail closed-ish: a broken count must not grant unlimited messages.
    return Number.MAX_SAFE_INTEGER;
  }
  return Number(count ?? 0);
}

// ─────────────────────────────────────────────
// user_context
// ─────────────────────────────────────────────

export async function getUserContext(userId: string): Promise<Record<string, unknown>> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_context')
    .select('context')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[elaya-service] user_context read failed:', error.message);
    return {};
  }
  return ((data as { context: Record<string, unknown> } | null)?.context) ?? {};
}

// ─────────────────────────────────────────────
// Chat seed — THE single source of the ElayaChatShell props
// ─────────────────────────────────────────────

/** A transcript message handed to ElayaChatShell (mirrors ElayaUiMessage). */
export type ElayaSeedMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

/** Everything ElayaChatShell needs to render — the four shell props. */
export type ElayaChatSeed = {
  conversationId: string;
  initialMessages: ElayaSeedMessage[];
  greeting: string;
  remainingToday: number;
};

/**
 * Resolve the active conversation, seed the transcript, compute the deterministic
 * greeting, and derive the remaining daily budget — the EXACT seeding the /elaya
 * page does. THE single source of ElayaChatShell's props so both entry points
 * (the /elaya RSC page and the floating widget's server action) seed identically;
 * never re-inline this logic at a second call site (R-01). SERVER ONLY — composes
 * server-only service reads; never import into a 'use client' component.
 */
export async function resolveElayaChatSeed(profile: Profile): Promise<ElayaChatSeed> {
  const expiryHours = await getSessionExpiryHours();
  const conversation = await getOrCreateActiveConversation(profile.id, expiryHours);

  const [rows, sentToday, cap] = await Promise.all([
    getConversationMessages(conversation.id),
    countUserMessagesToday(profile.id),
    getDailyMessageCap(),
  ]);

  const initialMessages: ElayaSeedMessage[] = rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }));

  const now = new Date();
  const firstName = profile.full_name.split(' ')[0] ?? profile.full_name;
  const dailyLine = pickElayaDailyLine(profile.id, now);
  const greeting = `${getElayaTimeGreeting(now)}, ${firstName}. ${dailyLine}`;

  return {
    conversationId: conversation.id,
    initialMessages,
    greeting,
    remainingToday: Math.max(0, cap - sentToday),
  };
}
