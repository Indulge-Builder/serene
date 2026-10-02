// elaya-chats-service.ts — THE admin read of everyone's chats with Elaya (2026-09-29): who has
// talked to her, one person's whole history across sessions and channels (WhatsApp, in-app, voice),
// and the reply an admin flags as wrong. The /settings/elaya-chats page and its actions are the only
// callers. Admin client throughout (elaya_messages RLS lets a user read only their OWN chats), so
// THE CALLER GATES: admin/founder, checked in the page and in actions/elaya-chats.ts.
//
// Read only. The flag itself is an ordinary improvement request written by
// createImprovementRequestCore (elaya-memory-service.ts); nothing here writes.
import { createAdminClient } from '@/lib/supabase/admin';
import { mapRows } from '@/lib/utils/rows';
import { ELAYA_CHATS_PAGE_SIZE } from '@/lib/constants/elaya';
import type { ElayaChannel, ElayaToolCallRecord } from '@/lib/types/elaya';
import type { ElayaRequestStatus } from '@/lib/constants/elaya-memory';
import type { UserRole } from '@/lib/types/database';

const LOG = '[elaya-chats-service]';
// The embedded-resource filter (elaya_conversations.user_id) is outside the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };
const admin = () => createAdminClient() as unknown as Loose;
/** PostgREST answers at most 1,000 rows; every scan below pages under it. */
const PAGE = 1000;

export type ElayaChatPerson = {
  userId: string;
  name: string;
  role: UserRole | null;
  /** Sessions that hold at least one message (opening the page starts an empty one; those are not counted). */
  sessions: number;
  messages: number;
  /** Messages per channel, for the rail line. */
  byChannel: Partial<Record<ElayaChannel, number>>;
  lastAt: string;
};

export type ElayaChatMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  channel: ElayaChannel;
  content: string;
  createdAt: string;
  /** Elaya's replies only: the tool names she called, in order. */
  tools: string[];
  /** Elaya's replies only: which specialist answered, the playbook it followed, the brain that ran. */
  specialist: string | null;
  playbook: string | null;
  brain: string | null;
  /** The turn failed and this row is the fallback line. */
  failed: boolean;
  /** A scheduled brief ('morning' / 'evening') rather than an answer to a message. */
  briefSlot: string | null;
  /** Someone already flagged this reply as wrong (an improvement request carries its text). */
  flag: { status: ElayaRequestStatus; kind: string } | null;
};

export type ElayaChatPage = { messages: ElayaChatMessage[]; hasMore: boolean };

/** Every row of a narrow select, keyset-paged on id under the 1,000-row cap. */
async function scanAll<T extends { id: string }>(table: string, columns: string): Promise<T[] | null> {
  const out: T[] = [];
  let after: string | null = null;
  for (;;) {
    let q = admin().from(table).select(columns).order('id', { ascending: true }).limit(PAGE);
    if (after) q = q.gt('id', after);
    const { data, error } = await q;
    if (error) {
      console.error(`${LOG} ${table} scan failed:`, error.message);
      return null;
    }
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
    after = rows[rows.length - 1]!.id;
  }
}

/**
 * Everyone who has talked to Elaya, most recent first. Built from the MESSAGES, not the sessions:
 * a session row is created the moment someone opens the page, so 201 of the first 647 were empty.
 * Returns [] when a read fails (the page then shows its empty state, never a partial list).
 */
export async function listElayaChatPeople(): Promise<ElayaChatPerson[]> {
  const [conversations, messages] = await Promise.all([
    scanAll<{ id: string; user_id: string }>('elaya_conversations', 'id, user_id'),
    scanAll<{ id: string; conversation_id: string; channel: ElayaChannel; created_at: string }>(
      'elaya_messages', 'id, conversation_id, channel, created_at'),
  ]);
  if (!conversations || !messages) return [];

  const ownerOf = new Map(conversations.map((c) => [c.id, c.user_id]));
  const byUser = new Map<string, { sessions: Set<string>; messages: number; byChannel: Partial<Record<ElayaChannel, number>>; lastAt: string }>();
  for (const m of messages) {
    const userId = ownerOf.get(m.conversation_id);
    if (!userId) continue;
    const acc = byUser.get(userId) ?? { sessions: new Set<string>(), messages: 0, byChannel: {}, lastAt: m.created_at };
    acc.sessions.add(m.conversation_id);
    acc.messages += 1;
    acc.byChannel[m.channel] = (acc.byChannel[m.channel] ?? 0) + 1;
    if (m.created_at > acc.lastAt) acc.lastAt = m.created_at;
    byUser.set(userId, acc);
  }
  if (byUser.size === 0) return [];

  const { data: profiles, error } = await admin().from('profiles').select('id, full_name, role').in('id', [...byUser.keys()]);
  if (error) console.warn(`${LOG} profile names failed:`, error.message);
  const who = new Map(mapRows<{ id: string; full_name: string | null; role: UserRole | null }, [string, { name: string; role: UserRole | null }]>(
    profiles, (p) => [p.id, { name: p.full_name?.trim() || 'Unnamed account', role: p.role }]));

  return [...byUser.entries()]
    .map(([userId, a]) => ({
      userId,
      name: who.get(userId)?.name ?? 'Removed account',
      role: who.get(userId)?.role ?? null,
      sessions: a.sessions.size,
      messages: a.messages,
      byChannel: a.byChannel,
      lastAt: a.lastAt,
    }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

type RawMessage = {
  id: string;
  conversation_id: string;
  role: string;
  channel: ElayaChannel;
  content: string;
  tool_calls: ElayaToolCallRecord[] | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/**
 * One person's history with Elaya, newest page first and returned oldest-first for display:
 * every session, every channel (or one), keyset on created_at. Each of Elaya's replies carries
 * what she called and whether someone has already flagged it.
 */
export async function getElayaChatPage(
  userId: string,
  opts: { before?: string; channel?: ElayaChannel } = {},
): Promise<{ data: ElayaChatPage | null; error: string | null }> {
  let q = admin()
    .from('elaya_messages')
    .select('id, conversation_id, role, channel, content, tool_calls, meta, created_at, elaya_conversations!inner(user_id)')
    .eq('elaya_conversations.user_id', userId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(ELAYA_CHATS_PAGE_SIZE + 1);
  if (opts.before) q = q.lt('created_at', opts.before);
  if (opts.channel) q = q.eq('channel', opts.channel);
  const { data, error } = await q;
  if (error) {
    console.error(`${LOG} chat page failed:`, error.message);
    return { data: null, error: 'Those messages could not be loaded just now.' };
  }
  const rows = mapRows<RawMessage, RawMessage>(data, (r) => r);
  const hasMore = rows.length > ELAYA_CHATS_PAGE_SIZE;
  const page = rows.slice(0, ELAYA_CHATS_PAGE_SIZE).reverse();

  const flags = await getFlagsFor([...new Set(page.filter((r) => r.role === 'assistant').map((r) => r.conversation_id))]);

  const messages = page.map((r): ElayaChatMessage => {
    const meta = r.meta ?? {};
    const isReply = r.role === 'assistant';
    return {
      id: r.id,
      conversationId: r.conversation_id,
      role: isReply ? 'assistant' : 'user',
      channel: r.channel,
      content: r.content,
      createdAt: r.created_at,
      tools: isReply && Array.isArray(r.tool_calls) ? r.tool_calls.map((t) => t?.name).filter((n): n is string => typeof n === 'string') : [],
      specialist: isReply ? str(meta.specialist) : null,
      playbook: isReply ? str(meta.playbook) : null,
      brain: isReply ? str(meta.brain) : null,
      failed: isReply && meta.turnError != null,
      briefSlot: isReply ? str(meta.slot) : null,
      flag: isReply ? flags.get(flagKey(r.conversation_id, r.content)) ?? null : null,
    };
  });
  return { data: { messages, hasMore }, error: null };
}

// A request stores the answer it is about (cut at 4,000 characters) and its session, not the message
// id, so a reply is matched on both. Elaya's own raise_improvement_request rows match the same way.
const flagKey = (conversationId: string, answer: string) => `${conversationId}\u0000${answer.slice(0, 4000)}`;

async function getFlagsFor(conversationIds: string[]): Promise<Map<string, { status: ElayaRequestStatus; kind: string }>> {
  const out = new Map<string, { status: ElayaRequestStatus; kind: string }>();
  if (conversationIds.length === 0) return out;
  const { data, error } = await admin()
    .from('elaya_improvement_requests')
    .select('conversation_id, answer, status, kind, created_at')
    .in('conversation_id', conversationIds)
    .not('answer', 'is', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn(`${LOG} flags read failed:`, error.message);
    return out;
  }
  // Oldest first, so the newest request on a reply is the one kept.
  type Flagged = { conversation_id: string; answer: string; status: ElayaRequestStatus; kind: string };
  for (const r of mapRows<Flagged, Flagged>(data, (x) => x)) {
    out.set(flagKey(r.conversation_id, r.answer), { status: r.status, kind: r.kind });
  }
  return out;
}

/**
 * The reply an admin is flagging, read on the server (the browser sends only its id): the reply
 * text, the person's message just before it in the same session, the session and the channel.
 * null when the id is not one of Elaya's replies.
 */
export async function getElayaReplyForCorrection(messageId: string): Promise<{
  conversationId: string;
  channel: ElayaChannel;
  answer: string;
  question: string | null;
} | null> {
  const { data: reply, error } = await admin()
    .from('elaya_messages')
    .select('conversation_id, role, channel, content, created_at')
    .eq('id', messageId)
    .maybeSingle();
  if (error) console.error(`${LOG} reply read failed:`, error.message);
  const r = reply as { conversation_id: string; role: string; channel: ElayaChannel; content: string; created_at: string } | null;
  if (!r || r.role !== 'assistant') return null;

  const { data: asked } = await admin()
    .from('elaya_messages')
    .select('content')
    .eq('conversation_id', r.conversation_id)
    .eq('role', 'user')
    .lt('created_at', r.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    conversationId: r.conversation_id,
    channel: r.channel,
    answer: r.content,
    question: (asked as { content: string } | null)?.content ?? null,
  };
}
