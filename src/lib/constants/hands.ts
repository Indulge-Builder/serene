// constants/hands.ts — THE Hands vocabulary (migration 0245; docs/architecture/hands-plan.md).
//
// Hands = Elaya's second WhatsApp number, linked through its own connector (connector-hands/),
// that may TYPE, but only to the numbers on hands.allowed_contacts (Instinct today). A ticket
// whose vendor is an `agent` vendor owns one thread; every line out goes through hands.outbox and
// every line in lands in hands.messages and on the ticket timeline. The SQL CHECKs mirror the
// lists below; a new value = one entry here + a CHECK migration.

import { defineEnum } from "@/lib/constants/define-enum";
import type { TicketBriefField } from "@/lib/constants/tickets";

export const HANDS_PATH = "/hands";
export const HANDS_SETTINGS_PATH = "/settings/hands";

export const HANDS_THREAD_KINDS = ["ticket", "talk"] as const;
export type HandsThreadKind = (typeof HANDS_THREAD_KINDS)[number];

export const HANDS_THREAD_STATUSES = ["open", "closed"] as const;
export type HandsThreadStatus = (typeof HANDS_THREAD_STATUSES)[number];

export const HANDS_DIRECTIONS = ["in", "out"] as const;
export type HandsDirection = (typeof HANDS_DIRECTIONS)[number];

export const HANDS_MESSAGE_KINDS = ["text", "image", "document", "audio", "video", "other"] as const;
export type HandsMessageKind = (typeof HANDS_MESSAGE_KINDS)[number];

export const HANDS_OUTBOX_STATUSES = ["queued", "sent", "failed", "refused"] as const;
export type HandsOutboxStatus = (typeof HANDS_OUTBOX_STATUSES)[number];

export const HANDS_OUTBOX_SOURCES = ["human", "elaya"] as const;
export type HandsOutboxSource = (typeof HANDS_OUTBOX_SOURCES)[number];

/**
 * The reply frame the rulebook asks the agent for: the first word of every reply. The connector
 * reads it into hands.messages.frame; anything else is null and a human reads the line.
 */
export const HANDS_FRAMES = defineEnum([
  { id: "done",    label: "Done" },
  { id: "need",    label: "Needs an answer" },
  { id: "options", label: "Options" },
  { id: "failed",  label: "Failed" },
  { id: "waiting", label: "Waiting" },
] as const);
export type HandsFrame = (typeof HANDS_FRAMES.values)[number];

// ── Job codes (2026-10-03): one WhatsApp chat carries many jobs ─────────────────
// Every line to the agent on a ticket thread starts with the ticket's code (#T42 for T-000042), the
// rulebook asks the agent to start its replies with it, and the connector files a reply by it.
// connector-hands/src/index.ts mirrors readHandsJobCode; change both together.

/** Most jobs open with one agent at once; more wait their turn (a calmer chat, a safer number). */
export const HANDS_MAX_OPEN_JOBS = 10;
const HANDS_JOB_CODE_LEAD = /^\s*\*?#\s?T-?0*\d{1,6}\*?[\s:.,-]*/i;

/** "T-000042" → "#T42". */
export function handsJobCode(ticketNo: string): string {
  const n = Number(ticketNo.replace(/\D/g, ""));
  return `#T${Number.isFinite(n) ? n : ticketNo}`;
}
/** The ticket number a line names ("#T42 OPTIONS…", "re #t-42", "T-000042") → "T-000042", or null. */
export function readHandsJobCode(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/(?:#\s?T-?|\bT-)0*(\d{1,6})\b/i);
  return m ? `T-${m[1].padStart(6, "0")}` : null;
}

/** Read the frame off a reply's first word ("DONE: booked…" → done; a leading job code "#T42" is skipped). Case-insensitive; null when absent. */
export function readHandsFrame(text: string | null | undefined): HandsFrame | null {
  const word = (text ?? "").trim().replace(HANDS_JOB_CODE_LEAD, "").match(/^([A-Za-z]+)\b/)?.[1]?.toLowerCase();
  return word && (HANDS_FRAMES.values as readonly string[]).includes(word) ? (word as HandsFrame) : null;
}

/**
 * The trust ladder (plan section 6): what Elaya may send on her own, per ticket category. Every
 * category starts at L0; a founder moves it up on /settings/hands when the ledger has earned it.
 */
export const HANDS_TRUST_LEVELS = defineEnum([
  { id: "draft",   label: "L0 · Draft: a human approves every line" },
  { id: "open",    label: "L1 · Open: Elaya sends the opening message under the per-job cap" },
  { id: "answer",  label: "L2 · Answer: Elaya answers questions the brief already answers" },
  { id: "confirm", label: "L3 · Confirm: Elaya may say yes to a price within budget" },
] as const);
export type HandsTrustLevel = (typeof HANDS_TRUST_LEVELS.values)[number];
export const HANDS_DEFAULT_TRUST_LEVEL: HandsTrustLevel = "draft";

/** Settings rows (elaya_settings) the hands layer reads per turn; missing = the default here. */
export const HANDS_SETTING_KEYS = {
  enabled:          "hands_enabled",             // boolean; OFF unless exactly true
  trustByCategory:  "hands_trust_by_category",   // { [ticketCategory]: HandsTrustLevel }
  perJobCapInr:     "hands_per_job_cap_inr",
  dailyCapInr:      "hands_daily_cap_inr",
  monthlyCapInr:    "hands_monthly_cap_inr",
  rulebook:         "hands_rulebook",            // HandsGuideDoc: what the agent is told (editable on /settings/hands)
  elayaGuide:       "hands_elaya_guide",         // HandsGuideDoc: how Elaya writes to the agent (folded into her hands tools)
} as const;
export const HANDS_PER_JOB_CAP_DEFAULT_INR = 10_000;
export const HANDS_DAILY_CAP_DEFAULT_INR   = 20_000;
export const HANDS_MONTHLY_CAP_DEFAULT_INR = 50_000;

/** Instinct's UPI QR lives about nine minutes (the founder's export, 2026-09-26). */
export const HANDS_QR_LIFETIME_MS = 9 * 60_000;

/**
 * Minimal disclosure (plan section 5): what a brief field may do when the job message is built.
 *   send  = goes into the message as is
 *   tick  = goes only when the approver ticks it on that job (a member's address)
 *   never = never leaves Serene (a member's contact; the hands number or the genie's stands in)
 * Everything about the MEMBER (name, phone, email, company, health, facts, chat) is never, by
 * construction: the drafter only ever reads the brief, and this table.
 */
export const HANDS_DISCLOSURE: Record<TicketBriefField, "send" | "tick" | "never"> = {
  pax: "send", date: "send", time: "send", date_to: "send", duration: "send",
  from_location: "send", to_location: "send", airport: "send",
  budget_inr: "send", budget_note: "send",
  product_details: "send", quantity: "send", gift_specifications: "send", event_name: "send",
  luggage: "send", early_check_in: "send", assistance_required: "send",
  delivery_address: "tick",
  delivery_contact: "never",
  preferred_vendor: "send", notes: "send",
};

/** The name every booking, order and enquiry is made under. Decide 2 in the plan; a settings row later. */
/** The ranker's lift for an agent vendor when the category's trust level is above L0 (plan Layer B): company policy, not a sticky note. */
export const HANDS_AGENT_BOOST = 1;

export const HANDS_IDENTITY_NAME = "Indulge Concierge";

/**
 * The standing rules sent to the agent once from the hands phone (plan Layer D). The agent keeps
 * standing rules across days (the founder's export); the Talk tab can re-send this after a drift.
 */
export const HANDS_RULEBOOK = [
  `You work for the ${HANDS_IDENTITY_NAME} desk. Bookings, orders and enquiries are always in the name ${HANDS_IDENTITY_NAME}, never another person.`,
  "Never spend without a yes from me on the exact amount. Always give the full total before asking. Prefer pay-at-venue over prepaid when both exist.",
  "Reply in short pointers.",
  "Every job I send starts with its code, like #T42. We run many jobs at once: start every reply about a job with that same code, keep one job per message, and never mix two jobs in one reply.",
  "After the code, start with one word: DONE (with the reference number and a screenshot), NEED (one question at a time, with the deadline if something is on hold), OPTIONS (numbered), FAILED (why, and the best alternative), or WAITING (what you are waiting for and when you will check). For example: #T42 OPTIONS 1. ...",
  "Never contact a phone number I did not give you. Never ask me for an identity document.",
].join("\n");

/**
 * How Elaya writes to the outside agent (2026-10-01). The starting text of the editable guide on
 * /settings/hands; the live text is the `hands_elaya_guide` row, which Elaya receives with every
 * hands read (follow_when_writing_to_the_agent). Privacy is NOT in this text's power: the
 * disclosure filter and the leak check in hands-draft.ts hold whatever the guide says.
 */
export const HANDS_ELAYA_GUIDE_DEFAULT = [
  `You are writing to an outside booking agent for the ${HANDS_IDENTITY_NAME} desk.`,
  "One request per message. Say what, where, when, how many, and the budget when we have one.",
  "Short pointers. No greetings, no small talk.",
  "Every search or recommendation request ends with a short paragraph on our standard, so the agent filters before it answers. Write it in your own words, in this spirit:",
  "Our standard: our members are ultra-premium. Only luxury and the best boutique options (5-star hotels, private villas and resorts, top-rated restaurants and experiences) with strong recent reviews, 4.5 and above on Google or TripAdvisor, and no recent complaints about cleanliness, service or safety. Well located, private where possible. Send 3 options, each with the full price, why it fits, and photos or a link. Skip budget chains, hostels and anything that is not truly premium.",
  "Always ask for the full total before anything is booked, and never agree to pay without a person's yes.",
  "When the member was not specific, ask for options and say how many.",
  "When the agent replies NEED, answer only that one question.",
  `Never share a member's name, phone, email, card, ID or address. Bookings are in the name ${HANDS_IDENTITY_NAME}.`,
].join("\n");

export type HandsGuideKind = "rulebook" | "elaya_guide";
export const HANDS_GUIDE_LABELS: Record<HandsGuideKind, string> = {
  rulebook: "The rulebook the agent receives",
  elaya_guide: "How Elaya writes to the agent",
};
export const HANDS_GUIDE_MAX_CHARS = 6_000;
export const HANDS_GUIDE_HISTORY = 20;
export const HANDS_FEEDBACK_MAX_CHARS = 2_000;
export const HANDS_GUIDE_WRITER_MAX_TOKENS = 4_000;
export const HANDS_GUIDE_WRITER_TIMEOUT_MS = 90_000;

/** The reply words the rulebook must keep: Serene reads the agent's first word (readHandsFrame), so a rulebook without them breaks every thread. */
export function missingFrameWords(rulebook: string): string[] {
  return HANDS_FRAMES.values.map((w) => w.toUpperCase()).filter((w) => !new RegExp(`\\b${w}\\b`).test(rulebook));
}
