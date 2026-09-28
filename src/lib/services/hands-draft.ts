// hands-draft.ts — THE filter that turns a ticket into a message for an outside agent (hands
// plan section 5: minimal disclosure). No `server-only`: Elaya's bridged tools and the page's
// action both call it.
//
// The one rule: a message that leaves the hands number is BUILT from the brief through the
// disclosure table, never typed free by a model. The member's name, phone, email, company,
// health, facts and chat are never read here, so they cannot leak by construction. What CAN
// leak is free text (the brief's notes, a genie's typed line), so every outgoing text passes
// leakCheck(): the member's name parts and any phone or email shape stop the send and name the
// line. The trust ladder (section 6) is read here too: what Elaya may do on her own for this
// ticket's category, and the rupee caps a payment is measured against.

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { maskPii } from "@/lib/elaya/pii";
import { getHandsSettings } from "@/lib/services/llm-providers-service";
import {
  HANDS_DISCLOSURE, HANDS_IDENTITY_NAME, HANDS_TRUST_LEVELS, HANDS_DEFAULT_TRUST_LEVEL, type HandsTrustLevel,
} from "@/lib/constants/hands";
import { TICKET_BRIEF_FIELDS_BY_CATEGORY, TICKET_CATEGORIES, type TicketBriefField, type TicketCategory } from "@/lib/constants/tickets";
import type { TicketRow } from "@/lib/types/ticket";

const LOG = "[hands-draft]";

export type HandsDraft = {
  /** The message as it would leave, ready for the approver's eyes. */
  text: string;
  /** Brief fields that went in, with the value sent. */
  sent: { field: TicketBriefField; value: string }[];
  /** Brief fields held back and why (the disclosure table, or a tick the approver did not give). */
  heldBack: { field: TicketBriefField; reason: "never" | "needs_tick" }[];
  /** Names, phones or emails found in the text: the send is refused while this is non-empty. */
  leaks: string[];
  /** The trust level for this ticket's category, read from settings at draft time. */
  trust: HandsTrustLevel;
  /** The record written on the outbox row so the ticket timeline can say what was told and what was kept. */
  disclosure: Record<string, unknown>;
};

const FIELD_LABEL: Record<TicketBriefField, string> = {
  pax: "Guests", date: "Date", time: "Time", date_to: "Until", duration: "Duration",
  from_location: "From", to_location: "To", airport: "Airport", budget_inr: "Budget ceiling (INR)", budget_note: "Budget note",
  product_details: "Product", quantity: "Quantity", delivery_address: "Deliver to", delivery_contact: "Delivery contact",
  preferred_vendor: "Preferred vendor", event_name: "Event", luggage: "Luggage", early_check_in: "Early check-in",
  assistance_required: "Assistance", gift_specifications: "Gift details", notes: "Notes",
};

function valueOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) { const s = v.map(valueOf).filter(Boolean).join(", "); return s || null; }
  return null;
}

/**
 * The opening message for a ticket, from its brief alone. `tick` names the "tick" fields the
 * approver allowed on this job (today only delivery_address). Deterministic: the same ticket and
 * ticks give the same text, so a proposal and its execution cannot drift.
 */
export function buildHandsMessage(ticket: Pick<TicketRow, "category" | "sub_category" | "title" | "brief" | "item">, opts: { tick?: TicketBriefField[]; reply?: string | null } = {}): Omit<HandsDraft, "trust" | "leaks"> {
  const tick = new Set(opts.tick ?? []);
  const fields = TICKET_BRIEF_FIELDS_BY_CATEGORY[ticket.category as TicketCategory] ?? [];
  const brief = (ticket.brief ?? {}) as Partial<Record<TicketBriefField, unknown>>;
  const sent: HandsDraft["sent"] = [];
  const heldBack: HandsDraft["heldBack"] = [];
  for (const f of fields) {
    const v = valueOf(brief[f]);
    if (!v) continue;
    const rule = HANDS_DISCLOSURE[f];
    if (rule === "never") { heldBack.push({ field: f, reason: "never" }); continue; }
    if (rule === "tick" && !tick.has(f)) { heldBack.push({ field: f, reason: "needs_tick" }); continue; }
    sent.push({ field: f, value: f === "budget_inr" ? `keep it under ₹${Number(v).toLocaleString("en-IN")}` : v });
  }
  const category = TICKET_CATEGORIES.labels[ticket.category as TicketCategory] ?? ticket.category;
  const what = [category, ticket.sub_category, ticket.item].filter(Boolean).join(" · ");
  const lines = [
    `Hi, this is ${HANDS_IDENTITY_NAME}. New request, please handle it in the name ${HANDS_IDENTITY_NAME}.`,
    `Request: ${ticket.title}${what ? ` (${what})` : ""}.`,
    ...sent.map((s) => `${FIELD_LABEL[s.field]}: ${s.value}`),
    "Reply with DONE, NEED, OPTIONS, FAILED or WAITING as agreed, and give the full total before asking me to pay.",
  ];
  const text = opts.reply ? opts.reply.trim() : lines.join("\n");
  return {
    text,
    sent,
    heldBack,
    disclosure: { sent: sent.map((s) => s.field), held_back: heldBack.map((h) => `${h.field}:${h.reason}`), ticked: [...tick], identity: HANDS_IDENTITY_NAME, ...(opts.reply ? { typed: true } : {}) },
  };
}

// ─── The leak check ───────────────────────────────────────────────────────────

const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)|\+\d{7,15}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Names, phones and emails in an outgoing text. `names` are the member's and their people's names;
 * a part shorter than four letters is ignored (a first name like "Raj" inside "Rajasthan" is not a
 * leak worth blocking; the approver still reads the text). Phones and emails of anyone stop it: the
 * hands number and the genie's number are given to the agent by the rulebook, never in a job line.
 */
export function leakCheck(text: string, names: string[]): string[] {
  const found = new Set<string>();
  for (const m of text.match(PHONE_RE) ?? []) found.add(m.trim());
  for (const m of text.match(EMAIL_RE) ?? []) found.add(m.trim());
  const parts = [...new Set(names.flatMap((n) => n.split(/[\s,.'’-]+/)).map((p) => p.trim()).filter((p) => p.length >= 4))];
  for (const p of parts) {
    if (new RegExp(`(?<![\\p{L}\\p{N}])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text)) found.add(p);
  }
  return [...found];
}

/** The member's name and the names on their file: what must never appear in an outgoing line. */
export async function memberNamesFor(memberId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: m }, { data: people }] = await Promise.all([
    memberDb(admin).from("members").select("full_name").eq("id", memberId).maybeSingle(),
    memberDb(admin).from("member_people").select("name").eq("member_id", memberId).limit(60),
  ]);
  const names = [(m as { full_name: string } | null)?.full_name ?? "", ...(((people ?? []) as { name: string }[]).map((p) => p.name))];
  return names.filter(Boolean);
}

// ─── The whole draft for a ticket ─────────────────────────────────────────────

export async function draftForTicket(ticket: TicketRow, opts: { tick?: TicketBriefField[]; reply?: string | null } = {}): Promise<HandsDraft> {
  const [settings, names] = await Promise.all([getHandsSettings(), memberNamesFor(ticket.member_id)]);
  const built = buildHandsMessage(ticket, opts);
  const trust = settings.trustByCategory[ticket.category] ?? HANDS_DEFAULT_TRUST_LEVEL;
  const leaks = leakCheck(built.text, names);
  if (leaks.length) console.warn(`${LOG} leak stopped a draft for ${ticket.ticket_no}: ${leaks.length} item(s)`);
  return { ...built, trust, leaks };
}

/** A free line (typed by a person, or a reply Elaya wrote) checked the same way; no member context = phones and emails only. */
export async function checkFreeLine(text: string, memberId: string | null): Promise<string[]> {
  const names = memberId ? await memberNamesFor(memberId) : [];
  return leakCheck(text, names);
}

/** What the trust ladder lets Elaya do on her own for this category, in words a tool result can carry. */
export function trustAllows(level: HandsTrustLevel): { openOnHerOwn: boolean; answerFromBrief: boolean; confirmWithinBudget: boolean; label: string } {
  const i = HANDS_TRUST_LEVELS.values.indexOf(level);
  return { openOnHerOwn: i >= 1, answerFromBrief: i >= 2, confirmWithinBudget: i >= 3, label: HANDS_TRUST_LEVELS.labels[level] };
}

/** For the tool results: the text masked as the model may see it (a leak-free text is unchanged). */
export function maskedForModel(text: string): string {
  return maskPii(text, "light");
}
