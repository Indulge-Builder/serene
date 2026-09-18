// ticket-draft-core.ts — THE one place a stretch of member chat becomes a drafted ticket.
//
// Two callers, one draft: the New ticket form (a genie SELECTED the messages, ticket-creator.ts)
// and the intake sweep (Serene FOUND them, ticket-intake.ts). Same prompt, same checks, same
// vault, so a ticket proposed by intake is filled exactly as one a genie asked for.
//
// Names never reach the model: the messages and the profile lines go through the member
// profiler's vault (code names per group + maskPii + the leak check), and the draft's text is
// turned back into names on the way out. Reasoning tier through the Elaya provider, low effort,
// no tools. Every call is a sia.extraction_runs row. Fails CLOSED: anything wrong returns null
// and the human fills the form by hand.
//
// Free of `server-only` on purpose: the intake sweep runs from Trigger.dev and from a laptop.

import { resolveLlmForJob } from "@/lib/elaya/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { openVault, getBroadSenders } from "@/lib/services/member-profiler";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_SUB_CATEGORIES, TICKET_BRIEF_FIELDS_BY_CATEGORY, type TicketCategory, type TicketPriority } from "@/lib/constants/tickets";
import { TicketBriefSchema, type TicketBrief } from "@/lib/validations/ticket-schema";
import type { TicketDraft } from "@/lib/types/ticket";
import type { Json } from "@/lib/types/database";

export const TICKET_DRAFT_PROMPT_VERSION = "ticket-draft-v3";
/** Thinking counts against the allowance on the Claude 5 family; 1,200 could return no text at all. */
const DRAFT_MAX_OUTPUT_TOKENS = 4_000;
const DRAFT_TIMEOUT_MS = 60_000;

const SYSTEM = `You are the ticket creator for Indulge, a luxury concierge. The WhatsApp messages below make up ONE member
request. Turn them into a ticket draft. Return ONLY a JSON object, no prose, no code fence:
{
  "category": one of ${TICKET_CATEGORIES.values.join(" | ")},
  "sub_category": a sub-category id for that category or null,
  "title": one short line, what the member wants (max 120 chars),
  "brief": an object using only these keys when the messages say so: pax, date (ISO 8601), time, date_to, from_location,
           to_location, budget_inr (number), budget_note, product_details, quantity, delivery_address, delivery_contact,
           preferred_vendor, event_name, duration, luggage, airport, early_check_in (boolean), assistance_required,
           gift_specifications, notes,
  "priority": one of ${TICKET_PRIORITIES.values.join(" | ")},
  "priority_reason": one sentence,
  "requested_for": ISO 8601 date-time the member needs it by, or null,
  "acknowledgement": a warm one- or two-line reply the genie could send now, in the member's language and register,
  "vendor_terms": up to 4 short search terms for a supplier (most important first),
  "confidence": 0 to 1 that this is a real, single request
}
Sub-categories by category: ${Object.entries(TICKET_SUB_CATEGORIES).map(([c, subs]) => `${c}: ${subs.map((x) => x.id).join(", ") || "none"}`).join("; ")}.
Rules: the ticket is what the member asked for in "The request's messages"; use the conversation around it to understand
WHAT they mean (which event, which hotel, which product, how many) and put those details in the title and the brief;
never invent facts not in the messages, the conversation or the profile; a missing value stays absent; dates relative to
"today" use the provided date; people appear as codes (MEMBER_1, STAFF_GENIE_1, PERSON_2), keep them exactly as
written and never make up a code; addresses in the profile may be used to fill delivery_address when the member
says "home", "farmhouse" and so on; a preference in the profile (a usual seat, a dietary need, a brand) belongs in
the brief's notes when it matters to this request. Priority: urgent = today or a complaint; high = within 48 hours
or a high-value item; medium = this week; low = later or a recommendation.`;

export type DraftMessage = { wa_message_id: string; sender_jid: string; at: string; text: string };
export type DraftCoreInput = {
  member_id: string; group_jid: string; messages: DraftMessage[];
  /** "selected by a genie" or "found by intake"; lands in the run row. */
  via: "selection" | "intake";
  /**
   * What was said around the request, for UNDERSTANDING only. A member answers "2 tickets" to a
   * staff message naming the event; without that message the draft has no event. Never part of
   * the ticket's linked messages.
   */
  context?: DraftMessage[];
  /** The intake reader's one-line understanding, already in codes. A hint, not a fact. */
  hint?: string | null;
};

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

/** Trust nothing: every field is checked against our own vocabulary; anything else falls to a safe default. */
export function validateTicketDraft(raw: Record<string, unknown>, runId: string | null): TicketDraft {
  const category = (TICKET_CATEGORIES.values as readonly string[]).includes(String(raw.category)) ? (raw.category as TicketCategory) : "special_request";
  const subIds = TICKET_SUB_CATEGORIES[category].map((s) => s.id);
  const sub = typeof raw.sub_category === "string" && subIds.includes(raw.sub_category) ? raw.sub_category : null;
  const briefParsed = TicketBriefSchema.safeParse(raw.brief ?? {});
  const allowed = new Set<string>(TICKET_BRIEF_FIELDS_BY_CATEGORY[category]);
  const brief = (briefParsed.success ? Object.fromEntries(Object.entries(briefParsed.data).filter(([k, v]) => allowed.has(k) && v != null)) : {}) as TicketBrief;
  const priority = (TICKET_PRIORITIES.values as readonly string[]).includes(String(raw.priority)) ? (raw.priority as TicketPriority) : "medium";
  return {
    category, sub_category: sub,
    title: String(raw.title ?? "").slice(0, 160) || "Request",
    brief, priority,
    priority_reason: String(raw.priority_reason ?? "").slice(0, 300),
    requested_for: typeof raw.requested_for === "string" && !Number.isNaN(Date.parse(raw.requested_for)) ? new Date(raw.requested_for).toISOString() : null,
    acknowledgement: String(raw.acknowledgement ?? "").slice(0, 600),
    vendor_terms: Array.isArray(raw.vendor_terms) ? raw.vendor_terms.map(String).slice(0, 4) : [],
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
    run_id: runId,
  };
}

export async function draftTicketCore(input: DraftCoreInput, broad?: Set<string>): Promise<TicketDraft | null> {
  const admin = createAdminClient();
  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({
    kind: "ticket_creator", member_id: input.member_id, prompt_version: TICKET_DRAFT_PROMPT_VERSION, started_at: new Date().toISOString(),
    input_ref: { group_jid: input.group_jid, via: input.via, message_ids: input.messages.map((m) => m.wa_message_id) },
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => {
    if (runId) await admin.schema("sia").from("extraction_runs").update({ finished_at: new Date().toISOString(), ok, ...patch }).eq("id", runId);
  };

  try {
    const vault = await openVault(input.group_jid, input.member_id, [...input.messages, ...(input.context ?? [])].map((m) => m.sender_jid), broad ?? (await getBroadSenders()));
    if (!vault) { await finish(false, { error: "member not found" }); return null; }
    const facts = vault.ctx.facts;
    const line = (f: (typeof facts)[number], withFacet: boolean) => `${withFacet ? `${f.facet}.` : ""}${f.key}: ${f.polarity === "dislikes" ? "AVOIDS " : ""}${vault.mask(f.value)}`;
    const essentials = facts.filter((f) => ["address", "dietary", "family", "contact_rule"].includes(f.facet)).slice(0, 30).map((f) => line(f, true));
    const preferences = facts.filter((f) => ["preference", "travel", "interest"].includes(f.facet)).slice(0, 30).map((f) => line(f, false));
    const thread = input.messages.map((m) => `[${m.at.slice(0, 16).replace("T", " ")}] ${vault.codeOf(m.sender_jid)}: ${vault.mask(m.text.slice(0, 1200))}`).join("\n");
    const around = (input.context ?? []).map((m) => `[${m.at.slice(0, 16).replace("T", " ")}] ${vault.codeOf(m.sender_jid)}: ${vault.mask(m.text.slice(0, 700))}`).join("\n");
    const userContent = `Today: ${new Date().toISOString().slice(0, 10)}\nMember tier: ${vault.ctx.tier ?? "unknown"}\nProfile essentials:\n${essentials.join("\n") || "(none)"}\nPreferences:\n${preferences.join("\n") || "(none)"}${around ? `\n\nThe conversation around it (for understanding only: what the member is replying to, what staff offered):\n${around}` : ""}${input.hint ? `\n\nA first reading of the request: ${vault.mask(input.hint)}` : ""}\n\nThe request's messages:\n${thread}\n\nReturn the JSON.`;

    const leaked = vault.leaks(userContent);
    if (leaked.length) { await finish(false, { error: `vault leak (${leaked.length})` }); return null; }

    const llm = await resolveLlmForJob("reasoning");
    const result = await llm.adapter.complete({ model: llm.model, maxTokens: DRAFT_MAX_OUTPUT_TOKENS, effort: "low", timeoutMs: DRAFT_TIMEOUT_MS, system: SYSTEM, messages: [{ role: "user", content: userContent }] });
    const usage = { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens };
    if (result.stopReason === "max_tokens") { await finish(false, { ...usage, error: "answer cut off at the token limit" }); return null; }
    const raw = extractJson(result.text);
    if (!raw) { await finish(false, { ...usage, error: "no json", output: { text: result.text.slice(0, 2000) } }); return null; }

    const draft = vault.unmask(validateTicketDraft(raw, runId));
    await finish(true, { ...usage, output: raw as unknown as Json });
    return draft;
  } catch (e) {
    console.error("[ticket-draft] failed (fail-closed to null):", e instanceof Error ? e.message : e);
    await finish(false, { error: e instanceof Error ? e.message.slice(0, 300) : "error" });
    return null;
  }
}
