"use server";
// actions/elaya-chats.ts — the /settings/elaya-chats page (2026-09-29; admin/founder only): read one
// person's history with Elaya, and flag one of her replies as wrong. The flag is an ordinary
// improvement request through createImprovementRequestCore, so it lands in the Requests queue and
// is folded into her prompt as a known issue until someone resolves it there.
import { revalidatePath } from "next/cache";
import { requireProfile } from "./_auth";
import { parseActionInput } from "./_validation";
import { sanitizeText } from "@/lib/utils/sanitize";
import { FlagElayaReplySchema, GetElayaChatSchema } from "@/lib/validations/elaya-chats-schema";
import { getElayaChatPage, getElayaReplyForCorrection, type ElayaChatPage } from "@/lib/services/elaya-chats-service";
import { createImprovementRequestCore } from "@/lib/services/elaya-memory-service";
import { ELAYA_REQUESTS_PATH } from "@/lib/constants/elaya-memory";
import type { ElayaChannel } from "@/lib/types/elaya";
import type { ActionResult } from "@/lib/types";

// Everyone's private chats with Elaya: the two top roles only, never the tech workbench.
const CHAT_READERS = ["admin", "founder"] as const;

/** One page of a person's messages, newest page first, optionally one channel. */
export async function getElayaChatPageAction(input: unknown): Promise<ActionResult<ElayaChatPage>> {
  const parsed = parseActionInput(GetElayaChatSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...CHAT_READERS]);
  if (!auth.ok) return auth.result;
  return getElayaChatPage(parsed.data.user_id, { before: parsed.data.before, channel: parsed.data.channel });
}

/** Mark one of Elaya's replies as wrong, with the right answer. The server reads the reply itself. */
export async function flagElayaReplyAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(FlagElayaReplySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...CHAT_READERS]);
  if (!auth.ok) return auth.result;

  const reply = await getElayaReplyForCorrection(parsed.data.message_id);
  if (!reply) return { data: null, error: "That reply could not be found." };

  // The requests table's channel CHECK (0237) predates the voice channel (0247); a voice call runs
  // inside the app, so it is filed as in-app until that CHECK is widened.
  const channel: ElayaChannel = reply.channel === "voice" ? "in_app" : reply.channel;
  const res = await createImprovementRequestCore({
    userId: auth.profile.id,
    conversationId: reply.conversationId,
    channel,
    kind: parsed.data.kind,
    question: reply.question,
    answer: reply.answer,
    correction: sanitizeText(parsed.data.correction),
    diagnosis: null,
  });
  if (res.error || !res.data) return { data: null, error: res.error ?? "The correction could not be saved just now." };
  revalidatePath(ELAYA_REQUESTS_PATH);
  return { data: { id: res.data.id }, error: null };
}
