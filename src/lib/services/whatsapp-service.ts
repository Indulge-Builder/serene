// UI-facing WhatsApp queries. Uses session Supabase client — RLS handles access.
// Do not add manual domain checks here. Do not use adminClient.
//
// NOTE: whatsapp_conversations, whatsapp_messages, and whatsapp_conversation_reads
// are not yet in the generated Database type (database.ts is regenerated via
// `supabase gen types typescript --local`). Until then, Supabase client calls on
// these tables use `(supabase as any)` — the same pattern used for new RPCs.
// eslint-disable-next-line comments are co-located with each cast.

import { createClient } from '@/lib/supabase/server';
import { sanitizeText } from '@/lib/utils/sanitize';
import {
  WHATSAPP_CONVERSATIONS_PAGE_SIZE,
  WHATSAPP_MESSAGES_PAGE_SIZE,
} from '@/lib/constants/whatsapp';
import type { WhatsAppPeriod } from '@/lib/constants/whatsapp-period';
import { getWhatsAppPeriodRange } from '@/lib/utils/whatsapp-period';
import { mapRows } from '@/lib/utils/rows';
import type { WhatsAppConversation, WhatsAppMessage } from '@/lib/types/whatsapp';

export type WhatsAppConversationListFilters = {
  period?:     WhatsAppPeriod;
  customFrom?: string | null;
  customTo?:   string | null;
};

// Query row shapes — the DB columns of the app types + the joined relation
// (dry-audit L-6: one declared row type per query, no Record<string, unknown>).
type WaConversationRow = Omit<WhatsAppConversation, 'lead_name' | 'lead_phone' | 'unread_count'> & {
  leads: { first_name: string; last_name: string | null; phone: string };
};
type WaMessageRow = Omit<WhatsAppMessage, 'sender_name' | 'sender_avatar_url'> & {
  sender: { full_name: string; avatar_url: string | null } | null;
};

function mapConversationRow(row: WaConversationRow): WhatsAppConversation {
  const { leads, ...conversation } = row;
  return {
    ...conversation,
    lead_name:  [leads.first_name, leads.last_name].filter(Boolean).join(' '),
    lead_phone: leads.phone,
  };
}

function mapMessageRow(row: WaMessageRow): WhatsAppMessage {
  const { sender, ...message } = row;
  return {
    ...message,
    sender_name:       sender?.full_name,
    sender_avatar_url: sender?.avatar_url ?? undefined,
  };
}

// Per-caller unread flag for list rows. Mirrors the get_wa_unread_count RPC
// predicate exactly: a conversation is unread when it is open AND the caller
// has no read row OR last_message_at is newer than their last_read_at.
// The reads SELECT runs on the session client — RLS (`agent_id = auth.uid()`)
// scopes it to the caller's own rows, so no explicit agent filter is needed.
// Read failure is non-fatal: rows fall back to unread_count 0 (dot hidden).
async function attachUnreadCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  conversations: WhatsAppConversation[],
): Promise<WhatsAppConversation[]> {
  if (conversations.length === 0) return conversations;

  const { data, error } = await supabase
    .from('whatsapp_conversation_reads')
    .select('conversation_id, last_read_at')
    .in('conversation_id', conversations.map((c) => c.id));

  if (error) return conversations;

  const lastReadByConversation = new Map<string, string>(
    ((data ?? []) as { conversation_id: string; last_read_at: string }[]).map(
      (r) => [r.conversation_id, r.last_read_at],
    ),
  );

  return conversations.map((c) => {
    const lastRead = lastReadByConversation.get(c.id);
    const unread =
      lastRead === undefined ||
      (c.last_message_at !== null &&
        new Date(c.last_message_at).getTime() > new Date(lastRead).getTime());
    return { ...c, unread_count: unread ? 1 : 0 };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyLastMessagePeriodFilter(query: any, filters?: WhatsAppConversationListFilters) {
  if (!filters?.period) return query;

  const range = getWhatsAppPeriodRange(
    filters.period,
    filters.customFrom,
    filters.customTo,
  );
  if (!range) return query;

  return query
    .not('last_message_at', 'is', null)
    .gte('last_message_at', range.from)
    .lte('last_message_at', range.to);
}

// ─────────────────────────────────────────────
// getConversations
// Paginated conversation list, sorted by last_message_at DESC.
// Cursor = last row's last_message_at ISO string.
// Optional period filter uses last_message_at (last send/receive).
// ─────────────────────────────────────────────

export async function getConversations(options: {
  limit?:      number;
  cursor?:     string;
  period?:     WhatsAppPeriod;
  customFrom?: string | null;
  customTo?:   string | null;
}): Promise<{ conversations: WhatsAppConversation[]; nextCursor: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const limit    = options.limit ?? WHATSAPP_CONVERSATIONS_PAGE_SIZE;
  const listFilters: WhatsAppConversationListFilters | undefined = options.period
    ? { period: options.period, customFrom: options.customFrom, customTo: options.customTo }
    : undefined;

  let query = supabase
    .from('whatsapp_conversations')
    .select(`
      *,
      leads!inner (
        first_name,
        last_name,
        phone
      )
    `)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  query = applyLastMessagePeriodFilter(query, listFilters);

  if (options.cursor) {
    query = query.lt('last_message_at', options.cursor);
  }

  const { data, error } = await query;

  if (error || !data) return { conversations: [], nextCursor: null };

  const conversations = await attachUnreadCounts(
    supabase,
    mapRows<WaConversationRow, WhatsAppConversation>(data, mapConversationRow),
  );

  const nextCursor =
    conversations.length === limit
      ? (conversations[conversations.length - 1].last_message_at ?? null)
      : null;

  return { conversations, nextCursor };
}

// ─────────────────────────────────────────────
// getConversation
// ─────────────────────────────────────────────

export async function getConversation(
  conversationId: string,
): Promise<WhatsAppConversation | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select(`
      *,
      leads!inner (
        first_name,
        last_name,
        phone
      )
    `)
    .eq('id', conversationId)
    .single();

  if (error || !data) return null;

  return mapConversationRow(data as WaConversationRow);
}

// ─────────────────────────────────────────────
// getConversationByLeadId
// Finds the single conversation row for a given lead (UNIQUE on lead_id).
// Returns null when no conversation exists — not an error.
// ─────────────────────────────────────────────

export async function getConversationByLeadId(
  leadId: string,
): Promise<WhatsAppConversation | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select(`
      *,
      leads!inner (
        first_name,
        last_name,
        phone
      )
    `)
    .eq('lead_id', leadId)
    .single();

  if (error || !data) return null;

  return mapConversationRow(data as WaConversationRow);
}

// ─────────────────────────────────────────────
// getMessages
// Paginated message history, ASC within page (oldest → newest).
// Cursor = oldest row's created_at (used as `before` — fetch rows older than this).
// Agent/bot sender names joined from profiles.
// ─────────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  options: {
    limit?:  number;
    before?: string;
  } = {},
): Promise<WhatsAppMessage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const limit    = options.limit ?? WHATSAPP_MESSAGES_PAGE_SIZE;

  let query = supabase
    .from('whatsapp_messages')
    .select(`
      *,
      sender:profiles (
        full_name,
        avatar_url
      )
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (options.before) {
    query = query.lt('created_at', options.before);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return mapRows<WaMessageRow, WhatsAppMessage>(data, mapMessageRow);
}

// ─────────────────────────────────────────────
// getUnreadCount
// Per-agent unread conversation count via get_wa_unread_count RPC.
// Counts open conversations with no read record or a message newer
// than the agent's last_read_at. Returns 0 (never null).
// ─────────────────────────────────────────────

export async function getUnreadCount(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data, error } = await supabase.rpc('get_wa_unread_count');

  if (error) return 0;
  return (data as number) ?? 0;
}

// ─────────────────────────────────────────────
// markConversationRead
// UPSERT agent's read position for a conversation.
// agent_id has NO DB default (migration 0034) — it must be supplied explicitly
// from the caller's verified profile or the INSERT fails its NOT NULL constraint.
// RLS (`agent_id = auth.uid()`) still guarantees the row is the caller's own.
// ─────────────────────────────────────────────

export async function markConversationRead(
  conversationId: string,
  agentId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase
    .from('whatsapp_conversation_reads')
    .upsert(
      {
        conversation_id: conversationId,
        agent_id:        agentId,
        last_read_at:    new Date().toISOString(),
      },
      { onConflict: 'conversation_id,agent_id' },
    );

  if (error) {
    console.warn('[whatsapp-service] markConversationRead failed', error);
  }
}

// ─────────────────────────────────────────────
// searchConversations
// ILIKE search on lead name and phone. Max 20 results.
// Query is sanitized before use (S-02).
// ─────────────────────────────────────────────

export async function searchConversations(
  query: string,
  filters?: WhatsAppConversationListFilters,
): Promise<WhatsAppConversation[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const safe     = sanitizeText(query).trim();
  if (!safe) return [];

  let dbQuery = supabase
    .from('whatsapp_conversations')
    .select(`
      *,
      leads!inner (
        first_name,
        last_name,
        phone
      )
    `)
    .or(`leads.first_name.ilike.%${safe}%,leads.last_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(20);

  dbQuery = applyLastMessagePeriodFilter(dbQuery, filters);

  const { data, error } = await dbQuery;

  if (error || !data) return [];

  return attachUnreadCounts(
    supabase,
    mapRows<WaConversationRow, WhatsAppConversation>(data, mapConversationRow),
  );
}
