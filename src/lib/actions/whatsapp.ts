"use server";

import { z } from "zod";
import { requireProfile } from "@/lib/actions/_auth";
import { sendTextMessage, sendLeadInitiationMessage } from "@/lib/services/whatsapp-api";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  markConversationRead,
  getConversation,
  getConversationByLeadId as serviceGetConversationByLeadId,
  getConversations as serviceGetConversations,
  getMessages as serviceGetMessages,
  searchConversations as serviceSearchConversations,
} from "@/lib/services/whatsapp-service";
import { createClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/utils/sanitize";
import {
  WhatsAppListFilterSchema,
  WhatsAppSearchFilterSchema,
} from "@/lib/validations/whatsapp-schema";
import type { ActionResult } from "@/lib/types/index";
import type { WhatsAppConversation, WhatsAppMessage } from "@/lib/types/whatsapp";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SendMessageSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID"),
  content:        z.string().min(1, "Message cannot be empty").max(4096, "Message too long").transform(sanitizeText),
});

const ConversationIdSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID"),
});

// ─── sendWhatsAppMessage ──────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  input: { conversationId: string; content: string },
): Promise<ActionResult<WhatsAppMessage>> {
  const parsed = SendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const { conversationId, content } = parsed.data;

  // Load conversation to get wa_id and verify access
  const conversation = await getConversation(conversationId);
  if (!conversation) return { data: null, error: "Conversation not found" };
  if (conversation.status === "resolved") return { data: null, error: "Conversation is resolved" };

  // Send via Meta Cloud API
  const apiResult = await sendTextMessage(conversation.wa_id, content);
  if (!apiResult) return { data: null, error: "Failed to send message" };

  const waMessageId = apiResult.messages?.[0]?.id ?? null;

  // Persist to DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { data: row, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      conversation_id: conversationId,
      lead_id:         conversation.lead_id,
      direction:       "outbound",
      sender_type:     "agent",
      sender_id:       profile.id,
      wa_message_id:   waMessageId,
      message_type:    "text",
      content,
      status:          "sent",
      status_at:       new Date().toISOString(),
      is_bot:          false,
    })
    .select("*")
    .single();

  if (insertError || !row) {
    console.error('[sendWhatsAppMessage] insert failed:', insertError?.message ?? 'row was null');
    return { data: null, error: "Message sent but not recorded" };
  }

  const message: WhatsAppMessage = {
    id:              (row as Record<string, unknown>)["id"] as string,
    conversation_id: conversationId,
    lead_id:         conversation.lead_id,
    direction:       "outbound",
    sender_type:     "agent",
    sender_id:       profile.id,
    wa_message_id:   waMessageId,
    message_type:    "text",
    content,
    media_url:       null,
    media_mime_type: null,
    status:          "sent",
    status_at:       new Date().toISOString(),
    is_bot:          false,
    created_at:      (row as Record<string, unknown>)["created_at"] as string,
    sender_name:     profile.full_name,
    sender_avatar_url: profile.avatar_url ?? undefined,
  };

  // Update conversation last_message_at
  await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { data: message, error: null };
}

// ─── markConversationAsRead ───────────────────────────────────────────────────

export async function markConversationAsRead(
  input: { conversationId: string },
): Promise<ActionResult<null>> {
  const parsed = ConversationIdSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  await markConversationRead(parsed.data.conversationId);
  return { data: null, error: null };
}

// ─── resolveConversation ──────────────────────────────────────────────────────

export async function resolveConversation(
  input: { conversationId: string },
): Promise<ActionResult<null>> {
  const parsed = ConversationIdSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ status: "resolved", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.conversationId);

  if (error) return { data: null, error: "Failed to resolve conversation" };
  return { data: null, error: null };
}

// ─── reopenConversation ───────────────────────────────────────────────────────

export async function reopenConversation(
  input: { conversationId: string },
): Promise<ActionResult<null>> {
  const parsed = ConversationIdSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.conversationId);

  if (error) return { data: null, error: "Failed to reopen conversation" };
  return { data: null, error: null };
}

// ─── Read action wrappers (client-callable) ───────────────────────────────────
// whatsapp-service.ts uses the server Supabase client and cannot be imported
// from client components. These thin wrappers expose service reads via actions.

export async function getConversationsAction(
  input: unknown,
): Promise<{ conversations: WhatsAppConversation[]; nextCursor: string | null }> {
  const parsed = WhatsAppListFilterSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { conversations: [], nextCursor: null };
  }

  const auth = await requireProfile();
  if (!auth.ok) return { conversations: [], nextCursor: null };

  const { period, customFrom, customTo, limit, cursor } = parsed.data;
  return serviceGetConversations({
    limit,
    cursor: cursor ?? undefined,
    period,
    customFrom: customFrom ?? undefined,
    customTo:   customTo   ?? undefined,
  });
}

export async function getMessagesAction(
  conversationId: string,
  options: { limit?: number; before?: string } = {},
): Promise<WhatsAppMessage[]> {
  const auth = await requireProfile();
  if (!auth.ok) return [];
  const uuidResult = z.string().uuid().safeParse(conversationId);
  if (!uuidResult.success) return [];
  return serviceGetMessages(conversationId, options);
}

export async function initiateWhatsAppConversationAction(
  leadId: string,
): Promise<ActionResult<{ conversation: WhatsAppConversation; message: WhatsAppMessage }>> {
  const uuidResult = z.string().uuid().safeParse(leadId);
  if (!uuidResult.success) return { data: null, error: "Invalid lead ID" };

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  // Access check via RLS — session client SELECT will return null if caller lacks access
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { data: lead } = await supabase
    .from("leads")
    .select(`
      id,
      first_name,
      last_name,
      phone,
      assigned_to,
      assignee:profiles!leads_assigned_to_fkey (
        full_name
      )
    `)
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found" };
  if (!lead.phone) return { data: null, error: "Lead has no phone number" };

  // Guard: return existing conversation if one already exists (race condition safety)
  const existing = await serviceGetConversationByLeadId(leadId);
  if (existing) {
    // Synthesise a placeholder message so the card can transition — caller fetches real messages via Realtime
    const placeholderMessage: WhatsAppMessage = {
      id:              `init-placeholder-${existing.id}`,
      conversation_id: existing.id,
      lead_id:         leadId,
      direction:       "outbound",
      sender_type:     "agent",
      sender_id:       profile.id,
      wa_message_id:   null,
      message_type:    "template",
      content:         null,
      media_url:       null,
      media_mime_type: null,
      status:          null,
      status_at:       null,
      is_bot:          false,
      created_at:      new Date().toISOString(),
    };
    return { data: { conversation: existing, message: placeholderMessage }, error: null };
  }

  const waId      = lead.phone.replace('+', '');
  const agentName = (lead.assignee as { full_name: string } | null)?.full_name ?? profile.full_name;
  const leadName  = [lead.first_name as string, lead.last_name as string | null].filter(Boolean).join(' ');

  // adminClient INSERT — no app-user INSERT policy on whatsapp_conversations
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: convRow, error: convError } = await (admin as any)
    .from("whatsapp_conversations")
    .insert({ lead_id: leadId, wa_id: waId, phone: lead.phone, status: "open" })
    .select("*")
    .single();

  let conversation: WhatsAppConversation;

  if (convError || !convRow) {
    // UNIQUE conflict — re-fetch the existing row
    const fallback = await serviceGetConversationByLeadId(leadId);
    if (!fallback) return { data: null, error: "Failed to create conversation" };
    conversation = fallback;
  } else {
    const raw = convRow as Record<string, unknown>;
    conversation = {
      id:              raw["id"] as string,
      lead_id:         leadId,
      wa_id:           waId,
      phone:           lead.phone as string,
      status:          "open",
      last_message_at: null,
      bot_active:      raw["bot_active"] as boolean,
      bot_paused_by:   null,
      bot_paused_at:   null,
      created_at:      raw["created_at"] as string,
      updated_at:      raw["updated_at"] as string,
      lead_name:       leadName,
      lead_phone:      lead.phone as string,
    };
  }

  // Send Gupshup initiation template — throws on failure
  try {
    await sendLeadInitiationMessage(lead.phone as string, leadName, agentName);
  } catch (err) {
    console.error("[initiateWhatsAppConversationAction] sendLeadInitiationMessage failed:", err);
    return { data: null, error: "Failed to send initiation message. The conversation has been created and the lead will receive messages when they reply." };
  }

  const now = new Date().toISOString();
  const messageContent = `Hello ${leadName}, this is ${agentName} from Indulge Global.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: msgRow, error: msgError } = await (admin as any)
    .from("whatsapp_messages")
    .insert({
      conversation_id: conversation.id,
      lead_id:         leadId,
      direction:       "outbound",
      sender_type:     "agent",
      sender_id:       profile.id,
      message_type:    "template",
      content:         messageContent,
      status:          "sent",
      status_at:       now,
      is_bot:          false,
    })
    .select("*")
    .single();

  if (msgError || !msgRow) {
    console.error("[initiateWhatsAppConversationAction] message insert failed:", msgError?.message ?? "row was null");
    return { data: null, error: "Message sent but not recorded" };
  }

  // Update last_message_at on the conversation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("whatsapp_conversations")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", conversation.id);

  const raw = msgRow as Record<string, unknown>;
  const message: WhatsAppMessage = {
    id:              raw["id"] as string,
    conversation_id: conversation.id,
    lead_id:         leadId,
    direction:       "outbound",
    sender_type:     "agent",
    sender_id:       profile.id,
    wa_message_id:   null,
    message_type:    "template",
    content:         messageContent,
    media_url:       null,
    media_mime_type: null,
    status:          "sent",
    status_at:       now,
    is_bot:          false,
    created_at:      raw["created_at"] as string,
    sender_name:     profile.full_name,
    sender_avatar_url: profile.avatar_url ?? undefined,
  };

  return { data: { conversation, message }, error: null };
}

export async function getConversationByLeadIdAction(
  leadId: string,
): Promise<{ data: WhatsAppConversation | null; error: string | null }> {
  const uuidResult = z.string().uuid().safeParse(leadId);
  if (!uuidResult.success) return { data: null, error: "Invalid lead ID" };

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  const conversation = await serviceGetConversationByLeadId(leadId);
  return { data: conversation, error: null };
}

export async function searchConversationsAction(
  input: unknown,
): Promise<WhatsAppConversation[]> {
  const parsed = WhatsAppSearchFilterSchema.safeParse(input);
  if (!parsed.success) return [];

  const auth = await requireProfile();
  if (!auth.ok) return [];

  const { query, period, customFrom, customTo } = parsed.data;
  return serviceSearchConversations(query, period
    ? { period, customFrom: customFrom ?? null, customTo: customTo ?? null }
    : undefined,
  );
}
