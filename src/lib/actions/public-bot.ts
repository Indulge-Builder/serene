"use server";

// The public bot's actions (0252, docs/architecture/indulge-bot-plan.md): the knowledge pack
// (preview, publish, roll back, versions), the agent's Library button, who answers a public
// chat, and the corrections queue. Zod first → requireProfile → the conversation read on the
// SESSION client (RLS decides who may open it) → the core → { data, error }.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formErrors } from "@/lib/validations/form-errors";
import {
  BotCorrectionSchema,
  PackVersionSchema,
  ResolveBotCorrectionSchema,
  SendLibraryItemSchema,
  SetChatHandlerSchema,
} from "@/lib/validations/public-bot-schema";
import { listPackVersions, previewPack, publishPackCore, restorePackCore, type PackLeakHit, type PackVersionSummary } from "@/lib/services/bot-knowledge-service";
import { getLibraryItems, listLibraryItems, sendLibraryItemCore, sendShapeOf } from "@/lib/services/bot-library-service";
import {
  getBotMessageText,
  listOpenBotCorrections,
  recordBotCorrectionCore,
  resolveBotCorrectionCore,
  setPublicChatHandlerCore,
  type BotCorrectionRow,
} from "@/lib/services/public-bot-handover";
import { getConversation } from "@/lib/services/whatsapp-service";
import type { ActionResult, UserRole } from "@/lib/types";

const PUBLISHER_ROLES: UserRole[] = ["admin", "founder"];
const CURATOR_ROLES: UserRole[] = ["manager", "admin", "founder"];
const LIBRARY_PATH = "/admin/elaya-training";

// ─── The pack ─────────────────────────────────────────────────────────────────

export type PackOverview = {
  versions: PackVersionSummary[];
  /** What a publish right now would contain, and what the leak check found. */
  draft: { itemCount: number; chars: number; hits: PackLeakHit[] };
};

export async function getPackOverviewAction(): Promise<ActionResult<PackOverview>> {
  const auth = await requireProfile(CURATOR_ROLES);
  if (!auth.ok) return auth.result;
  try {
    const [versions, preview] = await Promise.all([listPackVersions(10), previewPack()]);
    return { data: { versions, draft: { itemCount: preview.itemCount, chars: preview.text.length, hits: preview.hits } }, error: null };
  } catch (e) {
    console.error("[public-bot-action] pack overview failed:", e);
    return { data: null, error: formErrors.generic };
  }
}

export async function publishPackAction(): Promise<ActionResult<{ version: number }>> {
  const auth = await requireProfile(PUBLISHER_ROLES);
  if (!auth.ok) return auth.result;
  const r = await publishPackCore(auth.profile.id);
  if (!r.ok) {
    if (r.reason === "empty") return { data: null, error: "Nothing is approved yet. Approve the facts, stories and files first." };
    if (r.reason === "leak") return { data: null, error: `The pack was not published: it contains ${r.hits?.map((h) => h.value).slice(0, 3).join(", ")}. Remove these and try again.` };
    return { data: null, error: formErrors.generic };
  }
  revalidatePath(LIBRARY_PATH);
  return { data: { version: r.version }, error: null };
}

export async function restorePackAction(input: { version: number }): Promise<ActionResult<{ version: number }>> {
  const parsed = parseActionInput(PackVersionSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(PUBLISHER_ROLES);
  if (!auth.ok) return auth.result;
  const r = await restorePackCore(auth.profile.id, parsed.data.version);
  if (!r.ok) return { data: null, error: "That version could not be restored." };
  revalidatePath(LIBRARY_PATH);
  return { data: { version: r.version }, error: null };
}

// ─── The Library button in the inbox ──────────────────────────────────────────

export type LibraryPickerItem = {
  id: string;
  kind: string;
  title: string;
  whenToSend: string | null;
  shape: "image" | "video" | "document" | "audio" | "link" | "message";
};

/** Every approved library item (the picker in the WhatsApp composer). Anyone signed in. */
export async function listLibraryItemsAction(): Promise<ActionResult<LibraryPickerItem[]>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const items = await listLibraryItems();
  return {
    data: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      whenToSend: i.when_to_send,
      shape: i.kind === "ready_message" ? "message" : sendShapeOf(i),
    })),
    error: null,
  };
}

/**
 * An agent sends a library item from the inbox. The conversation is read on the session client,
 * so a person who cannot open it gets "not found". It leaves from the conversation's own line,
 * and, like a typed reply, it takes the chat over from the bot.
 */
export async function sendLibraryItemAction(input: { conversationId: string; assetId: string }): Promise<ActionResult<{ delivered: number }>> {
  const parsed = parseActionInput(SendLibraryItemSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  const conversation = await getConversation(parsed.data.conversationId);
  if (!conversation) return { data: null, error: "Conversation not found" };
  const item = (await getLibraryItems([parsed.data.assetId])).get(parsed.data.assetId);
  if (!item) return { data: null, error: "That library item is not approved for sending." };

  const firstName = (conversation.lead_name ?? "").split(" ")[0] || null;
  const r = await sendLibraryItemCore({
    conversation: { id: conversation.id, lead_id: conversation.lead_id, wa_id: conversation.wa_id, line: conversation.line },
    item,
    sender: { kind: "agent", profileId: auth.profile.id },
    firstName: firstName && !/\d{5,}/.test(firstName) ? firstName : null,
  });
  if (r.delivered === 0) return { data: null, error: "Couldn't send it. The customer's WhatsApp window may be closed; ask them to message first." };
  if (conversation.line === "public") after(setPublicChatHandlerCore(conversation.id, "team", auth.profile.id).then(() => undefined));
  return { data: { delivered: r.delivered }, error: null };
}

// ─── Who answers a public chat ────────────────────────────────────────────────

export async function setChatHandlerAction(input: { conversationId: string; handler: "bot" | "team" }): Promise<ActionResult<{ handler: "bot" | "team" }>> {
  const parsed = parseActionInput(SetChatHandlerSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const conversation = await getConversation(parsed.data.conversationId);
  if (!conversation) return { data: null, error: "Conversation not found" };
  if (conversation.line !== "public") return { data: null, error: "Only chats on the Indulge number have the concierge." };
  if (conversation.bot_state === "opted_out") return { data: null, error: "This person asked not to be messaged by the concierge." };
  const ok = await setPublicChatHandlerCore(conversation.id, parsed.data.handler, auth.profile.id);
  if (!ok) return { data: null, error: formErrors.generic };
  return { data: { handler: parsed.data.handler }, error: null };
}

// ─── Corrections ──────────────────────────────────────────────────────────────

export async function recordBotCorrectionAction(input: { conversationId: string; messageId: string; shouldHaveSaid: string; note?: string }): Promise<ActionResult<{ ok: true }>> {
  const parsed = parseActionInput(BotCorrectionSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const conversation = await getConversation(parsed.data.conversationId);
  if (!conversation) return { data: null, error: "Conversation not found" };
  const message = await getBotMessageText(conversation.id, parsed.data.messageId);
  if (!message) return { data: null, error: "Only the concierge's own messages can be corrected." };
  const ok = await recordBotCorrectionCore({
    messageId: parsed.data.messageId,
    conversationId: conversation.id,
    leadId: message.leadId,
    whatSheSaid: message.text,
    shouldHaveSaid: sanitizeText(parsed.data.shouldHaveSaid),
    note: parsed.data.note ? sanitizeText(parsed.data.note) : null,
    createdBy: auth.profile.id,
  });
  if (!ok) return { data: null, error: formErrors.generic };
  revalidatePath(LIBRARY_PATH);
  return { data: { ok: true }, error: null };
}

export async function listBotCorrectionsAction(): Promise<ActionResult<BotCorrectionRow[]>> {
  const auth = await requireProfile(CURATOR_ROLES);
  if (!auth.ok) return auth.result;
  return { data: await listOpenBotCorrections(), error: null };
}

export async function resolveBotCorrectionAction(input: { id: string; status: "applied" | "dismissed"; note?: string }): Promise<ActionResult<{ ok: true }>> {
  const parsed = parseActionInput(ResolveBotCorrectionSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(PUBLISHER_ROLES);
  if (!auth.ok) return auth.result;
  const ok = await resolveBotCorrectionCore(parsed.data.id, parsed.data.status, auth.profile.id, parsed.data.note ? sanitizeText(parsed.data.note) : null);
  if (!ok) return { data: null, error: "That correction is already closed." };
  revalidatePath(LIBRARY_PATH);
  return { data: { ok: true }, error: null };
}
