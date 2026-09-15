// ticket-creator.ts — THE ticket creator: selected WhatsApp messages + the client twin → a
// drafted ticket (client-ticket-plan.md 7.8, phase 1). Reuses the Elaya provider layer wholesale
// (R-01 / D-01): resolveLlmForJob('reasoning') → adapter.complete() with NO tools, everything
// masked via maskPii before the model. Every call is a sia.extraction_runs row (law 6). Fails
// CLOSED: a bad or missing verdict returns null and the page falls back to the empty form.

import "server-only";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientDetail } from "@/lib/services/clients-service";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_SUB_CATEGORIES, TICKET_BRIEF_FIELDS_BY_CATEGORY, type TicketCategory, type TicketPriority } from "@/lib/constants/tickets";
import { TicketBriefSchema, type DraftTicketInput, type TicketBrief } from "@/lib/validations/ticket-schema";
import type { TicketDraft } from "@/lib/types/ticket";

const SYSTEM = `You are the ticket creator for Indulge, a luxury concierge. A genie selected the WhatsApp messages
that make up ONE client request. Turn them into a ticket draft. Return ONLY a JSON object, no prose:
{
  "category": one of ${TICKET_CATEGORIES.values.join(" | ")},
  "sub_category": a sub-category id for that category or null,
  "title": one short line, what the client wants (max 120 chars),
  "brief": an object using only these keys when the messages say so: pax, date (ISO 8601), time, date_to, from_location,
           to_location, budget_inr (number), budget_note, product_details, quantity, delivery_address, delivery_contact,
           preferred_vendor, event_name, duration, luggage, airport, early_check_in (boolean), assistance_required,
           gift_specifications, notes,
  "priority": one of ${TICKET_PRIORITIES.values.join(" | ")},
  "priority_reason": one sentence,
  "requested_for": ISO 8601 date-time the client needs it by, or null,
  "acknowledgement": a warm one- or two-line reply the genie could send now, in the client's language and register,
  "vendor_terms": up to 4 short search terms for a supplier (most important first),
  "confidence": 0 to 1 that this is a real, single request
}
Rules: never invent facts not in the messages or the profile; a missing value stays absent; dates relative to
"today" use the provided date; people appear as codes, keep them as codes; addresses in the profile may be
used to fill delivery_address when the client says "home", "farmhouse" and so on. Priority: urgent = today or a
complaint; high = within 48 hours or a high-value item; medium = this week; low = later or a recommendation.`;

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

export async function draftTicketFromMessages(input: DraftTicketInput): Promise<TicketDraft | null> {
  const admin = createAdminClient();
  const startedAt = new Date().toISOString();
  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({ kind: "ticket_creator", client_id: input.client_id, input_ref: { group_jid: input.group_jid, message_ids: input.messages.map((m) => m.wa_message_id) }, started_at: startedAt }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => {
    if (runId) await admin.schema("sia").from("extraction_runs").update({ finished_at: new Date().toISOString(), ok, ...patch }).eq("id", runId);
  };

  try {
    const [detail, depth, llm] = await Promise.all([getClientDetail(input.client_id), getPiiMaskingDepth(), resolveLlmForJob("reasoning")]);
    const profile = detail
      ? {
          essentials: detail.facts.filter((f) => ["address", "dietary", "family", "contact_rule"].includes(f.facet)).map((f) => `${f.facet}.${f.key}: ${f.polarity === "dislikes" ? "AVOIDS " : ""}${f.value}`).slice(0, 30),
          preferences: detail.facts.filter((f) => ["preference", "travel", "interest"].includes(f.facet)).map((f) => `${f.key}: ${f.polarity === "dislikes" ? "AVOIDS " : ""}${f.value}`).slice(0, 30),
          tier: detail.client.tier,
        }
      : { essentials: [], preferences: [], tier: null };
    const thread = input.messages.map((m) => `[${m.at.slice(0, 16)}] ${m.from_client ? "CLIENT" : "STAFF"}: ${m.text}`).join("\n");
    const userContent = maskPii(
      `Today: ${new Date().toISOString().slice(0, 10)}\nClient tier: ${profile.tier ?? "unknown"}\nProfile essentials:\n${profile.essentials.join("\n") || "(none)"}\nPreferences:\n${profile.preferences.join("\n") || "(none)"}\n\nSelected messages:\n${thread}\n\nReturn the JSON.`,
      depth,
    );
    const result = await llm.adapter.complete({ model: llm.model, maxTokens: Math.min(llm.maxTokens, 1200), system: SYSTEM, messages: [{ role: "user", content: userContent }] });
    const raw = extractJson(result.text);
    if (!raw) { await finish(false, { error: "no json", tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens, output: { text: result.text.slice(0, 2000) } }); return null; }

    const category = (TICKET_CATEGORIES.values as readonly string[]).includes(String(raw.category)) ? (raw.category as TicketCategory) : "special_request";
    const subIds = TICKET_SUB_CATEGORIES[category].map((s) => s.id);
    const sub = typeof raw.sub_category === "string" && subIds.includes(raw.sub_category) ? raw.sub_category : null;
    const briefParsed = TicketBriefSchema.safeParse(raw.brief ?? {});
    const allowed = new Set(TICKET_BRIEF_FIELDS_BY_CATEGORY[category]);
    const brief = (briefParsed.success ? Object.fromEntries(Object.entries(briefParsed.data).filter(([k, v]) => allowed.has(k as never) && v != null)) : {}) as TicketBrief;
    const priority = (TICKET_PRIORITIES.values as readonly string[]).includes(String(raw.priority)) ? (raw.priority as TicketPriority) : "medium";
    const draft: TicketDraft = {
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
    await finish(true, { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens, output: raw });
    return draft;
  } catch (e) {
    console.error("[ticket-creator] failed (fail-closed to null):", e instanceof Error ? e.message : e);
    await finish(false, { error: e instanceof Error ? e.message.slice(0, 300) : "error" });
    return null;
  }
}
