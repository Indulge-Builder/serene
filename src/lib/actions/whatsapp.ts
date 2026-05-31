"use server";

import { z } from "zod";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { sendTextMessage } from "@/lib/services/whatsapp-api";
import {
  markConversationRead,
  getConversation,
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

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: "Unauthorised" };

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

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: "Unauthorised" };

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

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: "Unauthorised" };

  const allowed: string[] = ["manager", "admin", "founder"];
  if (!allowed.includes(profile.role)) return { data: null, error: "Unauthorised" };

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

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: "Unauthorised" };

  const allowed: string[] = ["manager", "admin", "founder"];
  if (!allowed.includes(profile.role)) return { data: null, error: "Unauthorised" };

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

  const profile = await getCurrentProfile();
  if (!profile) return { conversations: [], nextCursor: null };

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
  const profile = await getCurrentProfile();
  if (!profile) return [];
  const uuidResult = z.string().uuid().safeParse(conversationId);
  if (!uuidResult.success) return [];
  return serviceGetMessages(conversationId, options);
}

export async function searchConversationsAction(
  input: unknown,
): Promise<WhatsAppConversation[]> {
  const parsed = WhatsAppSearchFilterSchema.safeParse(input);
  if (!parsed.success) return [];

  const profile = await getCurrentProfile();
  if (!profile) return [];

  const { query, period, customFrom, customTo } = parsed.data;
  return serviceSearchConversations(query, period
    ? { period, customFrom: customFrom ?? null, customTo: customTo ?? null }
    : undefined,
  );
}
