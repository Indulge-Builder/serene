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
import type { WhatsAppConversation, WhatsAppMessage } from '@/lib/types/whatsapp';

// ─────────────────────────────────────────────
// getConversations
// Paginated conversation list, sorted by last_message_at DESC.
// Cursor = last row's last_message_at ISO string.
// ─────────────────────────────────────────────

export async function getConversations(options: {
  limit?:  number;
  cursor?: string;
}): Promise<{ conversations: WhatsAppConversation[]; nextCursor: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const limit    = options.limit ?? WHATSAPP_CONVERSATIONS_PAGE_SIZE;

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

  if (options.cursor) {
    query = query.lt('last_message_at', options.cursor);
  }

  const { data, error } = await query;

  if (error || !data) return { conversations: [], nextCursor: null };

  const conversations: WhatsAppConversation[] = (data as Record<string, unknown>[]).map((row) => {
    const lead = row['leads'] as { first_name: string; last_name: string | null; phone: string };
    return {
      id:              row['id'] as string,
      lead_id:         row['lead_id'] as string,
      wa_id:           row['wa_id'] as string,
      phone:           row['phone'] as string,
      status:          row['status'] as 'open' | 'resolved',
      last_message_at: row['last_message_at'] as string | null,
      bot_active:      row['bot_active'] as boolean,
      bot_paused_by:   row['bot_paused_by'] as string | null,
      bot_paused_at:   row['bot_paused_at'] as string | null,
      created_at:      row['created_at'] as string,
      updated_at:      row['updated_at'] as string,
      lead_name:  [lead.first_name, lead.last_name].filter(Boolean).join(' '),
      lead_phone: lead.phone,
    };
  });

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

  const row  = data as Record<string, unknown>;
  const lead = row['leads'] as { first_name: string; last_name: string | null; phone: string };
  return {
    id:              row['id'] as string,
    lead_id:         row['lead_id'] as string,
    wa_id:           row['wa_id'] as string,
    phone:           row['phone'] as string,
    status:          row['status'] as 'open' | 'resolved',
    last_message_at: row['last_message_at'] as string | null,
    bot_active:      row['bot_active'] as boolean,
    bot_paused_by:   row['bot_paused_by'] as string | null,
    bot_paused_at:   row['bot_paused_at'] as string | null,
    created_at:      row['created_at'] as string,
    updated_at:      row['updated_at'] as string,
    lead_name:  [lead.first_name, lead.last_name].filter(Boolean).join(' '),
    lead_phone: lead.phone,
  };
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

  return (data as Record<string, unknown>[]).map((row): WhatsAppMessage => {
    const sender = row['sender'] as { full_name: string; avatar_url: string | null } | null;
    return {
      id:              row['id'] as string,
      conversation_id: row['conversation_id'] as string,
      lead_id:         row['lead_id'] as string,
      direction:       row['direction'] as 'inbound' | 'outbound',
      sender_type:     row['sender_type'] as 'lead' | 'agent' | 'bot',
      sender_id:       row['sender_id'] as string | null,
      wa_message_id:   row['wa_message_id'] as string | null,
      message_type:    row['message_type'] as WhatsAppMessage['message_type'],
      content:         row['content'] as string | null,
      media_url:       row['media_url'] as string | null,
      media_mime_type: row['media_mime_type'] as string | null,
      status:          row['status'] as WhatsAppMessage['status'],
      status_at:       row['status_at'] as string | null,
      is_bot:          row['is_bot'] as boolean,
      created_at:      row['created_at'] as string,
      sender_name:       sender?.full_name,
      sender_avatar_url: sender?.avatar_url ?? undefined,
    };
  });
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
// The agent_id column is populated by the DB default (auth.uid()) via RLS policy.
// ─────────────────────────────────────────────

export async function markConversationRead(conversationId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  await supabase
    .from('whatsapp_conversation_reads')
    .upsert(
      {
        conversation_id: conversationId,
        last_read_at:    new Date().toISOString(),
      },
      { onConflict: 'conversation_id,agent_id' },
    );
}

// ─────────────────────────────────────────────
// searchConversations
// ILIKE search on lead name and phone. Max 20 results.
// Query is sanitized before use (S-02).
// ─────────────────────────────────────────────

export async function searchConversations(
  query: string,
): Promise<WhatsAppConversation[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const safe     = sanitizeText(query).trim();
  if (!safe) return [];

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
    .or(`leads.first_name.ilike.%${safe}%,leads.last_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(20);

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => {
    const lead = row['leads'] as { first_name: string; last_name: string | null; phone: string };
    return {
      id:              row['id'] as string,
      lead_id:         row['lead_id'] as string,
      wa_id:           row['wa_id'] as string,
      phone:           row['phone'] as string,
      status:          row['status'] as 'open' | 'resolved',
      last_message_at: row['last_message_at'] as string | null,
      bot_active:      row['bot_active'] as boolean,
      bot_paused_by:   row['bot_paused_by'] as string | null,
      bot_paused_at:   row['bot_paused_at'] as string | null,
      created_at:      row['created_at'] as string,
      updated_at:      row['updated_at'] as string,
      lead_name:  [lead.first_name, lead.last_name].filter(Boolean).join(' '),
      lead_phone: lead.phone,
    };
  });
}
