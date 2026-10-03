// hands-line-writer.ts — Elaya writes ONE line to the outside agent on the Hands page (2026-10-01,
// "Ask Elaya"). She follows the LIVE guide (the hands_elaya_guide row, read per call, so an edit on
// /settings/hands changes her next line), reads the thread's last messages, and for a job uses ONLY
// what the disclosure filter already lets out of the ticket (buildHandsMessage's text). The
// member's name, phone, email, card, ID and address never reach the model, so they cannot reach
// the line; the output is leak-checked here AND again at send.
//
// The result is a DRAFT in the composer; a person sends it. Routing tier, plain text, every call a
// sia.extraction_runs row (kind hands_line). Fails closed: no line and a reason. No `server-only`.

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getHandsGuides, getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { buildHandsMessage, leakCheck, maskNames, memberNamesFor } from "@/lib/services/hands-draft";
import { HANDS_IDENTITY_NAME } from "@/lib/constants/hands";
import type { HandsThreadSummary } from "@/lib/services/hands-service";
import type { HandsMessageRow } from "@/lib/types/hands";
import type { TicketRow } from "@/lib/types/ticket";

const LOG = "[hands-line-writer]";
const RUN_KIND = "hands_line";
const PROMPT_VERSION = "hands-line-v2";
const THREAD_LINES = 20;
const MAX_TOKENS = 800;
const TIMEOUT_MS = 45_000;

export type HandsLineResult = { ok: true; text: string } | { ok: false; error: string };

export async function writeHandsLine(input: {
  thread: HandsThreadSummary;
  messages: HandsMessageRow[];
  instruction: string;
  ticket: TicketRow | null;
  actorId: string;
}): Promise<HandsLineResult> {
  const [{ guide }, depth, names] = await Promise.all([
    getHandsGuides(),
    getPiiMaskingDepth(),
    input.ticket ? memberNamesFor(input.ticket.member_id) : Promise.resolve([] as string[]),
  ]);

  // v2 (2026-10-01): v1 refused a plain "ask for hotel recommendations" in a free chat and wrote
  // back to US ("send me the details"). The person's words ARE the request; she always writes the
  // message to the agent and lets the agent ask for what is missing.
  const agent = input.thread.contact_label;
  const system = [
    `You are Elaya, writing on WhatsApp to ${agent}, an outside AI booking agent, on behalf of the ${HANDS_IDENTITY_NAME} desk.`,
    `A teammate tells you what they want from ${agent}. Their words ARE the request. Turn them into the message to send to ${agent}.`,
    `Always write the message to ${agent}. Never answer the teammate, never ask the teammate for details, never refuse.`,
    `When details are missing (city, dates, how many people, budget), still write it: ask ${agent} for options with what you know, and say which details are still open or ask what it needs.`,
    "Follow THE GUIDE for tone and shape.",
    "Use only the facts given. Never add a person's name, a phone number, an email, a card, an ID or an address.",
    "Plain WhatsApp text, no markdown, no sign-off. Reply with the message only.",
    "",
    "Example. Teammate: ask instinct for hotel recommendations in Goa",
    `Message: Hi, could you recommend 3 good hotels in Goa? Dates and number of guests are not fixed yet; please share prices per night and what each is best for.`,
    "",
    "THE GUIDE:",
    guide.body,
  ].join("\n");

  const lines = input.messages.slice(-THREAD_LINES).map((m) => `${m.direction === "in" ? "AGENT" : "US"}: ${(m.text ?? `[${m.kind}]`).slice(0, 600)}`);
  // The job as the disclosure filter would send it: the fields allowed out, nothing about the member.
  const job = input.ticket ? buildHandsMessage(input.ticket, {}).text : null;
  const userContent = [
    `THE TEAMMATE SAYS: ${maskPii(maskNames(input.instruction, names), depth)}`,
    job ? `THE JOB (only these facts may be shared):\n${maskNames(job, names)}` : "",
    lines.length ? `THE CONVERSATION SO FAR (oldest first):\n${maskPii(lines.join("\n"), depth)}` : "Nothing has been said yet.",
  ].filter(Boolean).join("\n\n");

  const admin = createAdminClient();
  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({
    kind: RUN_KIND, prompt_version: `${PROMPT_VERSION}+G${guide.version}`, started_at: new Date().toISOString(),
    input_ref: { by: input.actorId, thread_id: input.thread.id, ticket_id: input.ticket?.id ?? null, guide_version: guide.version },
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => {
    if (runId) await admin.schema("sia").from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", runId);
  };

  try {
    const llm = await resolveLlmForJob("routing");
    const result = await llm.adapter.complete({ usage: { feature: 'hands_line' }, model: llm.model, maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS, system, messages: [{ role: "user", content: userContent }] });
    const usage = { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens };
    const text = result.text.trim().replace(/^["“]|["”]$/g, "").trim();
    if (result.stopReason === "max_tokens" || !text) {
      await finish(false, { ...usage, error: "no line" });
      return { ok: false, error: "Elaya could not write a line just now. Try again or write it yourself." };
    }
    const leaks = leakCheck(text, names);
    if (leaks.length) {
      await finish(false, { ...usage, error: `leak (${leaks.length})` });
      return { ok: false, error: "Elaya's line carried a name, phone or email, so it was thrown away. Try again or write it yourself." };
    }
    await finish(true, { ...usage, output: { text } });
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error(`${LOG} line failed:`, msg);
    await finish(false, { error: msg.slice(0, 300) });
    return { ok: false, error: "Elaya could not write a line just now. Try again or write it yourself." };
  }
}
