// joker-capture.ts — THE jokers' capture sweep (migration 0248): step 1 of Recommendations &
// Engagement. It finds every OPENING the four jokers make in linked client WhatsApp groups and
// records it once, with its text labelled (kind, category, title) by one cheap model call per
// distinct text. Step 2 will tie the members' replies to these openings.
//
//   joker messages ─► facts per message ─► the rules ─────────────► opening / piece / follow-up
//   (48h, settled)    (chat before it,      (joker-capture-rules.ts,   └─ undecided ─► model
//                      sides, reach)          no model)                    (routing tier, masked)
//                                                                     new text ─► label call
//
// Posture, borrowed from the intake sweep and the profiler:
//   * Names never reach a model: the profiler's vault masks every known name, phone and email,
//     and a leak stops the call. The greeting line (the member's name) is cut before labelling.
//   * Fails closed: a failed read leaves the message `undecided` (never counted) and the text
//     `pending`; after JOKER_MAX_ATTEMPTS they stay that way and say so. A thrown call counts
//     toward giving up only when another call in the same run succeeded (the provider was up).
//   * A dry run (apply: false) writes NOTHING, anywhere: no decisions, no run ledger, no code
//     names. That is what lets the pilot read the live mirror.
//
// Free of `server-only` on purpose: it runs from Trigger.dev and from a laptop.

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { clipText } from "@/lib/utils/strings";
import { normalizeToE164 } from "@/lib/utils/phone";
import { JOKER_SEATS } from "@/lib/constants/sia-roles";
import { getBroadSenders, openVault, type Vault } from "@/lib/services/member-profiler";
import {
  boldPhrases, cleanTitle, decideJokerMessage, sameItemTitle, stripGreeting, templateKey, titleShortlist,
  type PriorMsg, type Side, type UnitFacts,
} from "@/lib/services/joker-capture-rules";
import {
  JOKER_BROADCAST_WINDOW_HOURS, JOKER_CATEGORIES, JOKER_CONTEXT_HOURS, JOKER_CONTEXT_MESSAGES, JOKER_COST_PER_MTOK,
  JOKER_DUPLICATE_MINUTES, JOKER_LABELS_PER_RUN, JOKER_LOOKBACK_HOURS, JOKER_MAX_ATTEMPTS, JOKER_MESSAGE_CHAR_CAP,
  JOKER_OPENING_KIND_LABELS, JOKER_OPENING_KINDS, JOKER_OUTAGE_STOP, JOKER_PIECE_SECONDS, JOKER_PROMPT_VERSION, JOKER_REPEAT_DAYS, JOKER_RULE_VERSION,
  JOKER_RUN_KIND, JOKER_SETTLE_SECONDS,
  type JokerCategory, type JokerDecision, type JokerOpeningKind,
  JOKER_TITLE_REUSE_DAYS, JOKER_TITLE_SHORTLIST,
} from "@/lib/constants/joker-engagement";

const LOG = "[joker-capture]";

// The 0248 tables are not in the generated types until the next regen; one loose handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };
const sia = (): Loose => createAdminClient().schema("sia") as unknown as Loose;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STAFF_ROLES = new Set(["genie", "bishop", "queen", "joker", "founder", "watcher", "vendor"]);

export const chunks = <T,>(xs: T[], n = 120): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };
export const byGroup = <T,>(xs: T[], key: (x: T) => string): Map<string, T[]> => { const m = new Map<string, T[]>(); for (const x of xs) { const kk = key(x); const l = m.get(kk); if (l) l.push(x); else m.set(kk, [x]); } return m; };
const k = (chat: string, id: string) => `${chat}|${id}`;
const split = (key: string): [string, string] => { const i = key.indexOf("|"); return [key.slice(0, i), key.slice(i + 1)]; };
const ms = (iso: string) => new Date(iso).getTime();

// ─── Shapes ──────────────────────────────────────────────────────────────────

/** A Joker: their Serene account, the phone it carries (E.164; the rules' key), their name. */
export type Joker = { profileId: string; phone: string; name: string };

type Row = {
  chat_jid: string; wa_message_id: string; sender_jid: string; type: string; text: string | null;
  quoted_wa_message_id?: string | null; quoted_sender_jid?: string | null; wa_timestamp: string;
  is_revoked: boolean; edit_of_wa_message_id: string | null; parent: string | null;
  m1?: unknown; m2?: unknown; m3?: unknown; m4?: unknown;
};

export type Group = { group_jid: string; group_kind: string; member_id: string | null; queendom_id: string | null };

export type Contact = { jid: string; lid: string | null; push_name: string | null; participant_role: string | null; staff_profile_id: string | null; vendor_id: string | null; member_id: string | null };

type Decided = { decision: JokerDecision; reason: string; decided_by: "rule" | "model"; anchor: string | null; opening_id: string | null; attempts: number };

type Unit = {
  row: Row; joker: Joker; group: Group;
  /** The caption for media, the body for text; an album's is its first captioned photo's. */
  text: string;
  at: number; template_key: string; reach: number;
  /** The album's photos: decided with it. */
  children: Row[];
};

export type CaptureDecision = {
  chat_jid: string; wa_message_id: string; joker_phone: string; joker_name: string; sent_at: string; type: string;
  decision: JokerDecision; reason: string; decided_by: "rule" | "model";
  /** For a piece: the message that opened its send. */
  anchor: string | null;
  template_key: string; reach: number; member_id: string | null; queendom_id: string | null;
  /** The message's own text (an album's caption). In memory only, for the pilot's report. */
  text: string;
};

export type TextLabel = { template_key: string; kind: JokerOpeningKind; category: JokerCategory | null; title: string };

export type CaptureOptions = {
  apply: boolean;
  /** Pilot / back-fill: decide joker messages from here instead of the last JOKER_LOOKBACK_HOURS. */
  since?: string;
  until?: string;
  /** Model calls this run. 0 = rules only (a dry run that spends nothing). */
  maxLabels?: number;
  deadlineMs?: number;
  onProgress?: (line: string) => void;
};

export type CaptureResult = {
  jokerIds: number; fetched: number; decided: number; openings: number; undecided: number; unlinked: number;
  decisions: CaptureDecision[];
  labels: TextLabel[];
  calls: { made: number; failed: number; tokens_in: number; tokens_out: number; cost_usd: number };
  errors: string[];
};

// ─── Who is who ──────────────────────────────────────────────────────────────

const e164 = (phone: string | null): string | null => { if (!phone) return null; try { return normalizeToE164(phone); } catch { return null; } };

/**
 * The Jokers (2026-09-28): whoever holds a joker or joker_head seat (profiles.sia_role, active), and
 * their WhatsApp ids are the contacts sia-staff-link linked to that account by phone (the phone row
 * and its @lid pair). A new Joker needs no code change; a company number handed to someone else
 * follows its new account.
 */
export async function resolveJokerIds(): Promise<Map<string, Joker>> {
  const out = new Map<string, Joker>();
  const { data: people, error } = await createAdminClient().from("profiles").select("id, full_name, phone").in("sia_role", [...JOKER_SEATS]).eq("is_active", true);
  if (error) throw new Error(`${LOG} joker seats lookup failed: ${error.message}`);
  const seats = (people ?? []) as { id: string; full_name: string | null; phone: string | null }[];
  if (!seats.length) { console.warn(`${LOG} nobody holds a joker seat: nothing to capture`); return out; }
  const { data: links, error: le } = await sia().from("wag_contacts").select("jid, lid, staff_profile_id").in("staff_profile_id", seats.map((p) => p.id));
  if (le) throw new Error(`${LOG} joker WhatsApp ids lookup failed: ${le.message}`);
  const rows = (links ?? []) as { jid: string; lid: string | null; staff_profile_id: string }[];
  for (const p of seats) {
    const joker: Joker = { profileId: p.id, phone: e164(p.phone) ?? `profile:${p.id}`, name: p.full_name ?? "Joker" };
    for (const r of rows.filter((x) => x.staff_profile_id === p.id)) { out.set(r.jid, joker); if (r.lid) out.set(r.lid, joker); }
    if (![...out.entries()].some(([jid, x]) => x.profileId === p.id && jid.endsWith("@lid"))) {
      console.warn(`${LOG} ${joker.name}: no hidden (@lid) WhatsApp id linked to the account; their group messages will be missed`);
    }
  }
  return out;
}

export async function contactsFor(jids: string[]): Promise<Map<string, Contact[]>> {
  const out = new Map<string, Contact[]>();
  const cols = "jid, lid, push_name, participant_role, staff_profile_id, vendor_id, member_id";
  const add = (key: string, c: Contact) => { const l = out.get(key); if (l) l.push(c); else out.set(key, [c]); };
  for (const part of chunks([...new Set(jids)])) {
    const [{ data: byJid }, { data: byLid }] = await Promise.all([
      sia().from("wag_contacts").select(cols).in("jid", part),
      sia().from("wag_contacts").select(cols).in("lid", part),
    ]);
    for (const c of (byJid ?? []) as Contact[]) add(c.jid, c);
    // A hidden-id sender's phone row carries its lid: that row's tags count for the sender too.
    for (const c of (byLid ?? []) as Contact[]) if (c.lid) add(c.lid, c);
  }
  return out;
}

export function sideFor(jid: string, group: Group, jokers: Map<string, Joker>, contacts: Map<string, Contact[]>, broad: Set<string>): Side {
  if (jokers.has(jid)) return "joker";
  const rows = contacts.get(jid) ?? [];
  // The member's own number in their own group is the member, whatever else it is.
  if (group.member_id && rows.some((c) => c.member_id === group.member_id)) return "client";
  if (rows.some((c) => STAFF_ROLES.has(c.participant_role ?? "") || c.staff_profile_id || c.vendor_id || /indulge/i.test(c.push_name ?? ""))) return "staff";
  if (broad.has(jid)) return "staff";
  return "client";
}

// ─── Reading the mirror ──────────────────────────────────────────────────────

const PARENT = "parent:raw->message->messageContextInfo->messageAssociation->parentMessageKey->>id";
const MSG_COLS = [
  "chat_jid, wa_message_id, sender_jid, type, text, quoted_wa_message_id, quoted_sender_jid, wa_timestamp, is_revoked, edit_of_wa_message_id",
  PARENT,
  "m1:raw->message->extendedTextMessage->contextInfo->mentionedJid",
  "m2:raw->message->imageMessage->contextInfo->mentionedJid",
  "m3:raw->message->videoMessage->contextInfo->mentionedJid",
  "m4:raw->message->documentWithCaptionMessage->message->documentMessage->contextInfo->mentionedJid",
].join(", ");
const CTX_COLS = `chat_jid, wa_message_id, sender_jid, type, text, wa_timestamp, is_revoked, edit_of_wa_message_id, ${PARENT}`;

/** A message the connector could not decrypt is stored with this placeholder as its text. */
const UNDECRYPTED = /no session found to decrypt message/i;
export const usable = (r: Pick<Row, "is_revoked" | "edit_of_wa_message_id" | "type" | "text">) =>
  !r.is_revoked && !r.edit_of_wa_message_id && r.type !== "system" && r.type !== "unknown" && !UNDECRYPTED.test(r.text ?? "");
const mentionsOf = (r: Row): string[] => [r.m1, r.m2, r.m3, r.m4].flatMap((m) => (Array.isArray(m) ? (m as unknown[]).map(String) : []));

export async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(`${LOG} read failed: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function jokerMessages(ids: string[], since: string, until: string): Promise<Row[]> {
  const all: Row[] = [];
  for (const jid of ids) {
    all.push(...(await pageAll<Row>((a, b) => sia().from("wag_messages").select(MSG_COLS).eq("sender_jid", jid).gte("wa_timestamp", since).lt("wa_timestamp", until)
      .order("wa_timestamp", { ascending: true }).order("wa_message_id", { ascending: true }).range(a, b))));
  }
  return all;
}

export async function groupsFor(chats: string[]): Promise<Map<string, Group>> {
  const out = new Map<string, Group>();
  for (const part of chunks(chats)) {
    const { data, error } = await sia().from("wag_groups").select("group_jid, group_kind, member_id").in("group_jid", part);
    if (error) throw new Error(`${LOG} groups read failed: ${error.message}`);
    for (const g of (data ?? []) as Omit<Group, "queendom_id">[]) out.set(g.group_jid, { ...g, queendom_id: null });
  }
  const memberIds = [...new Set([...out.values()].map((g) => g.member_id).filter((x): x is string => !!x))];
  const admin = createAdminClient();
  for (const part of chunks(memberIds)) {
    const { data } = await memberDb(admin).from("members").select("id, queendom_id").in("id", part);
    const q = new Map(((data ?? []) as { id: string; queendom_id: string | null }[]).map((m) => [m.id, m.queendom_id]));
    for (const g of out.values()) if (g.member_id && q.has(g.member_id)) g.queendom_id = q.get(g.member_id) ?? null;
  }
  return out;
}

type KnownRow = { chat_jid: string; wa_message_id: string; decision: JokerDecision; opening_id: string | null; anchor_wa_message_id: string | null; attempts: number };
const KNOWN_COLS = "chat_jid, wa_message_id, decision, opening_id, anchor_wa_message_id, attempts";
const asDecided = (r: KnownRow): Decided => ({ decision: r.decision, reason: "", decided_by: "rule", anchor: r.anchor_wa_message_id, opening_id: r.opening_id, attempts: r.attempts });

/** Everything already decided for these jokers since `since`, in one paged read. */
async function knownSince(jokerIds: string[], since: string): Promise<Map<string, Decided>> {
  const rows = await pageAll<KnownRow>((a, b) => sia().from("joker_messages").select(KNOWN_COLS).in("sender_jid", jokerIds).gte("sent_at", since)
    .order("sent_at", { ascending: true }).order("wa_message_id", { ascending: true }).range(a, b));
  return new Map(rows.map((r) => [k(r.chat_jid, r.wa_message_id), asDecided(r)]));
}

async function knownOne(chat: string, id: string): Promise<Decided | null> {
  const { data } = await sia().from("joker_messages").select(KNOWN_COLS).eq("chat_jid", chat).eq("wa_message_id", id).maybeSingle();
  return data ? asDecided(data as KnownRow) : null;
}

// ─── The label call ──────────────────────────────────────────────────────────

const SYSTEM = `You read one message that a "joker" sent into a member's WhatsApp group at a luxury concierge. A joker delights members: she sends picks (a product, an experience, an event, a restaurant, a stay) and keeps in touch (wishes, check-ins). Return ONLY one JSON object, no prose, no code fence:
{
  "kind": "recommendation" | "wish" | "check_in" | "intro" | "other",
  "category": "experience" | "event" | "restaurant" | "retail" | "travel" | "news_info" | null,
  "title_choice": for a recommendation, the number of the bold phrase that names WHAT is offered (the product, place, event or experience); 0 if none does or for any other kind,
  "title": a short name for what is offered, at most 6 words; for any other kind a plain label such as "Birthday wish", "Festival greeting", "Check-in", "Intro" or "Shop invite". Never a greeting and never a person's name or code,
  "is_opening": true or false (answer only when the input starts with DECIDE, else null),
  "same_as": the number of the RECENT ITEM this message offers again, or 0,
  "reason": at most 15 words
}

Kinds:
- recommendation: she offers or suggests something the member could buy, book, attend, eat, visit or try. A wish that also offers something ("Happy birthday! Shall we send a cake?") is a recommendation.
- wish: a birthday, anniversary or festival greeting that offers nothing.
- check_in: asking how the member is, or how a trip or an event went, offering nothing.
- intro: the joker introducing herself to a new member.
- other: news or information offering nothing, or anything else.

Category, for a recommendation only (null for every other kind). These are the jokers' own:
- experience: something to do or try: a spa, wellness, a class, sport, a darshan, a drive, a flight in a jet, a tasting, a bespoke experience.
- event: something on a date: a concert, festival, show, play, match, party, exhibition, summit.
- restaurant: restaurants, bars, cafés, chefs, a meal, a table to book.
- retail: anything to buy: fashion, bags, shoes, jewellery, watches, beauty, gadgets, home, books, food or a gift to buy.
- travel: a trip or a stay away: a destination, hotel, villa, retreat, flights, a car or transfer for the trip.
- news_info: news or information she shares with an offer to act on it: an award, a launch, an opening, a festival's timings.

When the input starts with DECIDE, also say whether the joker's message OPENS something:
- true: she starts something new: a new pick, a wish, a check-in, an intro, including a pick prompted by something the member said on their own (the member mentions a trip and she suggests a place there).
- false: she continues a conversation she started (her earlier pick or wish got a reply and she follows up, even with a new offer in that conversation), answers what the member asked for, sends details, logistics, a reminder or a call arrangement, or talks to her team.

Same item (one item, one title): when the input lists RECENT ITEMS, answer same_as with the number of the one this message offers again: the same product, place, event or experience, even worded differently or named shorter or longer ("iPhone Duo" is "iPhone Duo available for pre-order"). A different restaurant, product, show or date is not the same item: then 0. When unsure, 0.

Names are replaced by codes (MEMBER_1 is the member or their household, STAFF_… the concierge team). Use codes exactly as written.`;

function parseJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"); const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

export type LabelAnswer = { kind: JokerOpeningKind; category: JokerCategory | null; title_choice: number; title: string; is_opening: boolean | null; same_as: number; reason: string };

/** The model's answer, checked. Only offered values are believed; a DECIDE answer with no yes or no is torn. */
export function validateLabel(raw: Record<string, unknown>, boldCount: number, decide: boolean, recentCount = 0): LabelAnswer | null {
  const kind = (JOKER_OPENING_KINDS as readonly string[]).includes(String(raw.kind)) ? (raw.kind as JokerOpeningKind) : "other";
  const category = kind === "recommendation" && (JOKER_CATEGORIES as readonly string[]).includes(String(raw.category)) ? (raw.category as JokerCategory) : null;
  const choice = Number(raw.title_choice);
  const title_choice = Number.isInteger(choice) && choice >= 1 && choice <= boldCount ? choice : 0;
  const title = typeof raw.title === "string" ? clipText(raw.title.replace(/\s+/g, " ").trim(), 80) : "";
  const isOpening = typeof raw.is_opening === "boolean" ? raw.is_opening : null;
  if (decide && isOpening === null) return null;
  const same = Number(raw.same_as);
  const same_as = kind === "recommendation" && Number.isInteger(same) && same >= 1 && same <= recentCount ? same : 0;
  return { kind, category, title_choice, title, is_opening: decide ? isOpening : null, same_as, reason: typeof raw.reason === "string" ? clipText(raw.reason.replace(/\s+/g, " ").trim(), 160) : "" };
}

const GREETING_WORDS = /\b(?:happy|happiest|birthday|anniversary|wishing|congrat\w*|hey|hi|hello|dear)\b/i;
const CODE_WORDS = /(?<![\p{L}\p{N}_])(?:MEMBER|STAFF|VENDOR|PERSON)(?:_[A-Z]+)*_\d+(?![\p{L}\p{N}_])/gu;

/**
 * The title an opening is counted under. A Recommendation takes the bold phrase that names what is
 * offered, from the ORIGINAL text (never a masked one), unless that phrase is a greeting. Every
 * other title is the model's short words with any code removed, never turned back into a name:
 * a title is shown on counts and charts, and nobody's name belongs there.
 */
export function titleFor(label: Pick<LabelAnswer, "kind" | "title_choice" | "title">, bolds: string[]): string {
  const picked = label.title_choice ? bolds[label.title_choice - 1] : null;
  if (label.kind === "recommendation" && picked && !GREETING_WORDS.test(picked) && cleanTitle(picked)) return clipText(cleanTitle(picked), 80);
  const own = cleanTitle(label.title.replace(CODE_WORDS, ""));
  return own || JOKER_OPENING_KIND_LABELS[label.kind];
}

type CallOutcome =
  | { ok: true; label: LabelAnswer; title: string; reused: boolean; tokens: { in: number; out: number } }
  | { ok: false; error: string; tokens: { in: number; out: number } | null; thrown: boolean };

type CallTarget = { chat_jid: string; wa_message_id: string; text: string; template_key: string; member_id: string };

/**
 * One model call: label a text, or (DECIDE, with the chat before it) also say whether the message
 * opens something. `recent` = the titles already in use that this message could be repeating
 * (titleShortlist); when the model says it is one of them, that title is reused as it is.
 * Exported for the title bench (scripts/jokers/titles-check.ts).
 */
export async function callLabel(t: CallTarget, vault: Vault, ctx: { lines: string[]; why: string } | null, apply: boolean, recent: string[] = []): Promise<CallOutcome> {
  const decide = !!ctx;
  const bolds = boldPhrases(t.text);
  // A title never holds a name, but it is masked and checked like everything else that reaches a model.
  const offered = recent.map((title) => ({ title, masked: vault.mask(title) })).filter((x) => !vault.leaks(x.masked).length);
  const body = decide ? t.text : stripGreeting(t.text);
  const maskedBody = vault.mask(clipText(body, JOKER_MESSAGE_CHAR_CAP));
  const maskedBolds = bolds.map((b) => vault.mask(b));
  const userContent = [
    decide ? `DECIDE: does the joker's message below open something?\nWhy the rules could not tell: ${ctx!.why}` : "",
    decide ? `CONVERSATION BEFORE IT (oldest first):\n${ctx!.lines.join("\n") || "- nothing in the last hours"}` : "",
    `MESSAGE${decide ? " (the joker's)" : " (greeting removed)"}:\n${maskedBody}`,
    `Bold phrases:\n${maskedBolds.map((b, i) => `${i + 1}. ${b}`).join("\n") || "- none"}`,
    offered.length ? `RECENT ITEMS (titles already in use):\n${offered.map((x, i) => `${i + 1}. ${x.masked}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  // The leak check reads the chat's own words only. Our instructions say "joker", and a joker's
  // WhatsApp name holds that word: checking them read our own prompt as a leaked name (2026-09-24).
  // The context lines were checked one by one before they got here.
  const leaked = vault.leaks([maskedBody, ...maskedBolds].join("\n"));
  if (leaked.length) return { ok: false, error: `vault leak (${leaked.length} name${leaked.length === 1 ? "" : "s"})`, tokens: null, thrown: false };

  const admin = createAdminClient();
  let runId: string | null = null;
  if (apply) {
    const { data } = await admin.schema("sia").from("extraction_runs").insert({
      kind: JOKER_RUN_KIND, member_id: t.member_id, prompt_version: JOKER_PROMPT_VERSION, started_at: new Date().toISOString(),
      input_ref: { chat_jid: t.chat_jid, wa_message_id: t.wa_message_id, template_key: t.template_key, mode: decide ? "decide" : "label", masked_input: clipText(userContent, 8_000) },
    }).select("id").single();
    runId = (data as { id: string } | null)?.id ?? null;
  }
  const finish = async (ok: boolean, patch: Record<string, unknown>) => { if (runId) await admin.schema("sia").from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", runId); };

  try {
    const llm = await resolveLlmForJob("routing");
    const result = await llm.adapter.complete({ model: llm.model, maxTokens: 600, effort: "low", timeoutMs: 30_000, cachePrefix: true, system: SYSTEM, messages: [{ role: "user", content: userContent }] });
    const tokens = { in: result.usage.inputTokens, out: result.usage.outputTokens };
    const usage = { model: llm.model, tokens_in: tokens.in, tokens_out: tokens.out, cost_usd: (tokens.in * JOKER_COST_PER_MTOK.input + tokens.out * JOKER_COST_PER_MTOK.output) / 1_000_000 };
    const raw = result.stopReason === "max_tokens" ? null : parseJson(result.text);
    const label = raw ? validateLabel(raw, bolds.length, decide, offered.length) : null;
    if (!label) { await finish(false, { ...usage, error: "no usable json", output: { text: clipText(result.text, 1500) } }); return { ok: false, error: "no usable json", tokens, thrown: false }; }
    const reused = label.same_as > 0;
    const title = reused ? offered[label.same_as - 1].title : titleFor(label, bolds);
    await finish(true, { ...usage, output: { label, title, reused } });
    return { ok: true, label, title, reused, tokens };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish(false, { error: clipText(msg, 500) });
    return { ok: false, error: msg, tokens: null, thrown: true };
  }
}

// ─── The sweep ───────────────────────────────────────────────────────────────

export async function runJokerCaptureSweep(opts: CaptureOptions): Promise<CaptureResult> {
  const t0 = Date.now();
  const deadline = opts.deadlineMs ? t0 + opts.deadlineMs : Infinity;
  const maxLabels = opts.maxLabels ?? JOKER_LABELS_PER_RUN;
  const until = opts.until ?? new Date(t0 - JOKER_SETTLE_SECONDS * 1000).toISOString();
  const since = opts.since ?? new Date(t0 - JOKER_LOOKBACK_HOURS * HOUR).toISOString();
  const decideFrom = ms(since);
  const say = (s: string) => opts.onProgress?.(s);
  const result: CaptureResult = { jokerIds: 0, fetched: 0, decided: 0, openings: 0, undecided: 0, unlinked: 0, decisions: [], labels: [], calls: { made: 0, failed: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 }, errors: [] };

  // 1. The jokers and their messages; a week further back too, only to spot re-sends (reminders).
  const jokers = await resolveJokerIds();
  result.jokerIds = jokers.size;
  const jokerIds = [...jokers.keys()];
  const readFrom = new Date(decideFrom - JOKER_REPEAT_DAYS * DAY).toISOString();
  const rows = (await jokerMessages(jokerIds, readFrom, until)).filter(usable);
  say(`${rows.length} joker messages read (from ${readFrom.slice(0, 10)})`);

  // 2. Their groups. Only member groups count: linked ones are decided, unlinked ones wait.
  const groups = await groupsFor([...new Set(rows.map((r) => r.chat_jid))]);
  const inMemberGroup = rows.filter((r) => groups.get(r.chat_jid)?.group_kind === "member");

  // What earlier runs decided. An `unlinked` message whose group is now linked is decided again.
  const decided = new Map<string, Decided>();
  const touched = new Set<string>();
  const set = (key: string, d: Decided) => { decided.set(key, d); touched.add(key); };
  const relinked = new Set<string>();
  if (opts.apply) {
    for (const [key, d] of await knownSince(jokerIds, readFrom)) decided.set(key, d);
    // Linked since: an `unlinked` message in a group that now has a member is decided like new.
    for (const [key, d] of decided) if (d.decision === "unlinked" && groups.get(split(key)[0])?.member_id) { decided.delete(key); relinked.add(key); }
    // Older ones than this read: look only in groups that are linked now (one read of ~500 groups).
    const linkedChats = (await pageAll<{ group_jid: string }>((a, b) => sia().from("wag_groups").select("group_jid").eq("group_kind", "member").not("member_id", "is", null).order("group_jid").range(a, b))).map((g) => g.group_jid);
    const waiting: { chat_jid: string; wa_message_id: string }[] = [];
    for (const part of chunks(linkedChats)) {
      const { data } = await sia().from("joker_messages").select("chat_jid, wa_message_id").eq("decision", "unlinked").lt("sent_at", readFrom).in("chat_jid", part).limit(1000);
      waiting.push(...((data ?? []) as { chat_jid: string; wa_message_id: string }[]));
    }
    if (waiting.length) {
      for (const [c, g] of await groupsFor([...new Set(waiting.map((w) => w.chat_jid))].filter((c) => !groups.has(c)))) groups.set(c, g);
      for (const [chat, list] of byGroup(waiting, (w) => w.chat_jid)) {
        for (const part of chunks(list.map((w) => w.wa_message_id))) {
          const { data } = await sia().from("wag_messages").select(MSG_COLS).eq("chat_jid", chat).in("wa_message_id", part);
          for (const r of (data ?? []) as Row[]) if (usable(r)) { inMemberGroup.push(r); relinked.add(k(r.chat_jid, r.wa_message_id)); }
        }
      }
      say(`${waiting.length} messages in newly linked groups to decide`);
    }
  }
  result.fetched = inMemberGroup.length;

  // 3. Units: an album is one unit with its photos; a photo whose album the mirror never got stands alone.
  const rowByKey = new Map(inMemberGroup.map((r) => [k(r.chat_jid, r.wa_message_id), r]));
  const childrenOf = new Map<string, Row[]>();
  for (const r of inMemberGroup) {
    if (!r.parent || !rowByKey.has(k(r.chat_jid, r.parent))) continue;
    const l = childrenOf.get(k(r.chat_jid, r.parent)); if (l) l.push(r); else childrenOf.set(k(r.chat_jid, r.parent), [r]);
  }
  const sends = new Map<string, { chat: string; at: number }[]>();
  for (const r of rows) { const t = templateKey(r.text); if (!t) continue; const l = sends.get(t); const s = { chat: r.chat_jid, at: ms(r.wa_timestamp) }; if (l) l.push(s); else sends.set(t, [s]); }
  const units: Unit[] = [];
  for (const r of inMemberGroup) {
    if (r.parent && rowByKey.has(k(r.chat_jid, r.parent))) continue; // decided with its album
    const kids = (childrenOf.get(k(r.chat_jid, r.wa_message_id)) ?? []).sort((a, b) => a.wa_timestamp.localeCompare(b.wa_timestamp) || a.wa_message_id.localeCompare(b.wa_message_id));
    const text = r.text?.trim() || kids.find((c) => c.text?.trim())?.text?.trim() || "";
    const at = ms(r.wa_timestamp);
    const template_key = templateKey(text);
    // Broadcast reach: chats that got the same text from any joker within a day either side.
    const reach = template_key ? new Set((sends.get(template_key) ?? []).filter((s) => Math.abs(s.at - at) <= JOKER_BROADCAST_WINDOW_HOURS * HOUR).map((s) => s.chat)).size || 1 : 1;
    units.push({ row: r, joker: jokers.get(r.sender_jid)!, group: groups.get(r.chat_jid)!, text, at, template_key, reach, children: kids });
  }
  units.sort((a, b) => a.at - b.at || a.row.wa_message_id.localeCompare(b.row.wa_message_id));

  const unitsByChat = byGroup(units, (u) => u.row.chat_jid);
  const due = units.filter((u) => {
    const key = k(u.row.chat_jid, u.row.wa_message_id);
    const d = decided.get(key);
    if (d) return d.decision === "undecided" && d.attempts < JOKER_MAX_ATTEMPTS;
    // The week before `since` is read only to spot re-sends; it is decided only when its group was just linked.
    return u.at >= decideFrom || relinked.has(key);
  });
  // An album whose captioned photo has not landed yet waits (up to an hour) rather than read as captionless.
  const ready = due.filter((u) => !(u.row.type === "album" && !u.text && t0 - u.at < HOUR));
  say(`${units.length} sends, ${ready.length} to decide`);

  // 4. The chat before each unit to decide, and who everyone in it is.
  const linked = ready.filter((u) => u.group.member_id);
  const context = new Map<string, Row[]>();
  await mapWithConcurrency([...byGroup(linked, (u) => u.row.chat_jid)], 4, async ([chat, mine]) => {
    const from = new Date(Math.min(...mine.map((u) => u.at)) - JOKER_CONTEXT_HOURS * HOUR).toISOString();
    const to = new Date(Math.max(...mine.map((u) => u.at)) + 1000).toISOString();
    const got = await pageAll<Row>((a, b) => sia().from("wag_messages").select(CTX_COLS).eq("chat_jid", chat).gte("wa_timestamp", from).lt("wa_timestamp", to)
      .order("wa_timestamp", { ascending: true }).order("wa_message_id", { ascending: true }).range(a, b));
    context.set(chat, got.filter(usable));
  });

  // Quoted messages: when were they sent, and by whom (those older than the context too).
  const quoted = new Map<string, { at: number; sender: string }>();
  for (const [chat, list] of context) for (const m of list) quoted.set(k(chat, m.wa_message_id), { at: ms(m.wa_timestamp), sender: m.sender_jid });
  for (const [chat, list] of byGroup(linked.filter((u) => u.row.quoted_wa_message_id && !quoted.has(k(u.row.chat_jid, u.row.quoted_wa_message_id))), (u) => u.row.chat_jid)) {
    const { data } = await sia().from("wag_messages").select("wa_message_id, sender_jid, wa_timestamp").eq("chat_jid", chat).in("wa_message_id", list.map((u) => u.row.quoted_wa_message_id!));
    for (const m of (data ?? []) as { wa_message_id: string; sender_jid: string; wa_timestamp: string }[]) quoted.set(k(chat, m.wa_message_id), { at: ms(m.wa_timestamp), sender: m.sender_jid });
  }
  const everyone = new Set<string>();
  for (const list of context.values()) for (const m of list) everyone.add(m.sender_jid);
  for (const u of linked) { if (u.row.quoted_sender_jid) everyone.add(u.row.quoted_sender_jid); for (const m of mentionsOf(u.row)) everyone.add(m); }
  const [contacts, broad] = await Promise.all([contactsFor([...everyone]), getBroadSenders()]);

  // 5. The rules, oldest first, so a piece always finds its send already decided.
  const needsModel: { unit: Unit; why: string; prior: Row[] }[] = [];
  const lookup = async (chat: string, id: string): Promise<Decided | undefined> => {
    const key = k(chat, id);
    if (!decided.has(key) && opts.apply) { const d = await knownOne(chat, id); if (d) decided.set(key, d); }
    return decided.get(key);
  };
  /** What a message is when it belongs to `target`'s send. A photo of an album stands for its album. */
  const pieceOf = async (chat: string, target: string): Promise<Pick<Decided, "decision" | "anchor" | "opening_id">> => {
    const tr = rowByKey.get(k(chat, target));
    if (tr?.parent && rowByKey.has(k(chat, tr.parent))) target = tr.parent;
    const d = await lookup(chat, target);
    if (!d) return { decision: "follow_up", anchor: null, opening_id: null }; // part of something never seen
    if (d.decision === "opening") return { decision: "piece", anchor: target, opening_id: d.opening_id };
    if (d.decision === "piece") return { decision: "piece", anchor: d.anchor, opening_id: d.opening_id };
    if (d.decision === "undecided") return { decision: "piece", anchor: target, opening_id: null };
    return { decision: "follow_up", anchor: null, opening_id: null };
  };

  for (const u of ready) {
    const chat = u.row.chat_jid;
    const key = k(chat, u.row.wa_message_id);
    const attempts = decided.get(key)?.attempts ?? 0;
    if (!u.group.member_id) { set(key, { decision: "unlinked", reason: "the group has no member linked yet", decided_by: "rule", anchor: null, opening_id: null, attempts: 0 }); continue; }

    const own = new Set([u.row.wa_message_id, ...u.children.map((c) => c.wa_message_id)]);
    const prior = (context.get(chat) ?? []).filter((m) => {
      if (own.has(m.wa_message_id) || m.parent === u.row.wa_message_id) return false;
      const at = ms(m.wa_timestamp);
      return at >= u.at - JOKER_CONTEXT_HOURS * HOUR && (at < u.at || (at === u.at && m.wa_message_id < u.row.wa_message_id));
    }).slice(-JOKER_CONTEXT_MESSAGES);
    const q = u.row.quoted_wa_message_id ? quoted.get(k(chat, u.row.quoted_wa_message_id)) : undefined;
    const quotedSender = u.row.quoted_sender_jid ?? q?.sender ?? null;
    const facts: UnitFacts = {
      wa_message_id: u.row.wa_message_id, joker_phone: u.joker.phone, type: u.row.type, text: u.text, at: u.at, template_key: u.template_key, reach: u.reach,
      quoted: u.row.quoted_wa_message_id && quotedSender ? { wa_message_id: u.row.quoted_wa_message_id, side: sideFor(quotedSender, u.group, jokers, contacts, broad), at: q?.at ?? null } : null,
      mentions_staff: mentionsOf(u.row).some((m) => sideFor(m, u.group, jokers, contacts, broad) !== "client"),
      prior: prior.map((m): PriorMsg => ({
        wa_message_id: m.wa_message_id, side: sideFor(m.sender_jid, u.group, jokers, contacts, broad),
        joker_phone: jokers.get(m.sender_jid)?.phone ?? null, at: ms(m.wa_timestamp), template_key: jokers.has(m.sender_jid) ? templateKey(m.text) : "",
      })),
      earlier_same_text: null,
    };
    // A reminder: the same text already sent to this chat within the week (read now, or recorded before).
    if (u.template_key) {
      const hit = (unitsByChat.get(chat) ?? []).filter((x) => x.template_key === u.template_key && x.at < u.at - JOKER_DUPLICATE_MINUTES * MIN && x.at >= u.at - JOKER_REPEAT_DAYS * DAY).pop();
      if (hit) facts.earlier_same_text = { wa_message_id: hit.row.wa_message_id, at: hit.at };
      else if (opts.apply) {
        const { data } = await sia().from("joker_openings").select("anchor_wa_message_id, sent_at").eq("chat_jid", chat).eq("template_key", u.template_key)
          .lt("sent_at", new Date(u.at - JOKER_DUPLICATE_MINUTES * MIN).toISOString()).gte("sent_at", new Date(u.at - JOKER_REPEAT_DAYS * DAY).toISOString())
          .order("sent_at", { ascending: false }).limit(1);
        const o = ((data ?? []) as { anchor_wa_message_id: string; sent_at: string }[])[0];
        if (o) facts.earlier_same_text = { wa_message_id: o.anchor_wa_message_id, at: ms(o.sent_at) };
      }
    }

    const v = decideJokerMessage(facts);
    if (v.decision === "piece") {
      const p = await pieceOf(chat, v.piece_of);
      set(key, { ...p, reason: p.decision === "piece" ? v.reason : `${v.reason}, of a follow-up`, decided_by: "rule", attempts });
    } else if (v.decision === "undecided") {
      set(key, { decision: "undecided", reason: v.reason, decided_by: "rule", anchor: null, opening_id: null, attempts });
      needsModel.push({ unit: u, why: v.reason, prior });
    } else {
      set(key, { decision: v.decision, reason: v.reason, decided_by: "rule", anchor: null, opening_id: null, attempts });
    }
    // Photos sent a moment BEFORE the text that opens (media first, then the caption as a text)
    // belong to it: they were settled as captionless follow-ups a step ago.
    if (v.decision === "opening") joinLeadingMedia(u, prior);
  }

  function joinLeadingMedia(u: Unit, prior: Row[]): void {
    let next = u.at;
    for (let i = prior.length - 1; i >= 0; i--) {
      const m = prior[i];
      if (jokers.get(m.sender_jid)?.phone !== u.joker.phone || next - ms(m.wa_timestamp) > JOKER_PIECE_SECONDS * 1000) break;
      next = ms(m.wa_timestamp);
      const id = m.parent && rowByKey.has(k(m.chat_jid, m.parent)) ? m.parent : m.wa_message_id;
      const d = decided.get(k(m.chat_jid, id));
      if (d && touched.has(k(m.chat_jid, id)) && d.decision === "follow_up" && d.reason === "too short to open anything") {
        set(k(m.chat_jid, id), { ...d, decision: "piece", anchor: u.row.wa_message_id, reason: "media sent just before the opening" });
      }
    }
  }

  // Album photos go with their album: decided with it now, or (a late photo) joining one decided before.
  // Runs after the model too (below), so it is a function.
  const settleAlbumPhotos = () => {
    for (const u of units) {
      if (u.children.length === 0) continue;
      const albumKey = k(u.row.chat_jid, u.row.wa_message_id);
      const a = decided.get(albumKey);
      if (!a) continue; // the album itself is not decided yet (waiting for its caption)
      for (const c of u.children) {
        const ck = k(c.chat_jid, c.wa_message_id);
        if (!touched.has(albumKey) && decided.has(ck)) continue; // both settled in an earlier run
        const p = a.decision === "opening" || a.decision === "undecided" ? { decision: "piece" as const, anchor: u.row.wa_message_id, opening_id: a.opening_id }
          : a.decision === "piece" ? { decision: "piece" as const, anchor: a.anchor, opening_id: a.opening_id }
          : { decision: a.decision, anchor: null, opening_id: null };
        const cur = decided.get(ck);
        if (cur && cur.decision === p.decision && cur.anchor === p.anchor) continue;
        set(ck, { ...p, reason: "a photo of the album", decided_by: "rule", attempts: 0 });
      }
    }
  };
  settleAlbumPhotos();

  // 6. The model: first the messages the rules could not settle, then new texts to label.
  // One item, one title (owner, 2026-09-28): the recommendation titles already in use, most recent
  // first; a new text that repeats one of those items takes its title (and its category).
  const recent: { title: string; category: JokerCategory | null }[] = [];
  {
    const { data } = await sia().from("joker_texts").select("title, category, first_seen_at").eq("kind", "recommendation").eq("label_state", "labelled")
      .gte("first_seen_at", new Date(decideFrom - JOKER_TITLE_REUSE_DAYS * DAY).toISOString()).order("first_seen_at", { ascending: false }).limit(2000);
    const seen = new Set<string>();
    for (const r of (data ?? []) as { title: string | null; category: JokerCategory | null }[]) if (r.title && !seen.has(r.title)) { seen.add(r.title); recent.push({ title: r.title, category: r.category }); }
  }
  const shortlist = (text: string) => titleShortlist(text, recent.map((r) => r.title), JOKER_TITLE_SHORTLIST);
  const texts = new Map<string, TextLabel | "pending">();
  if (opts.apply) {
    for (const part of chunks([...new Set(ready.map((u) => u.template_key).filter(Boolean))])) {
      const { data } = await sia().from("joker_texts").select("template_key, label_state, kind, category, title").in("template_key", part);
      for (const t of (data ?? []) as { template_key: string; label_state: string; kind: JokerOpeningKind | null; category: JokerCategory | null; title: string | null }[]) {
        texts.set(t.template_key, t.label_state === "labelled" && t.kind ? { template_key: t.template_key, kind: t.kind, category: t.category, title: t.title ?? "" } : "pending");
      }
    }
  }
  let calls = 0; let streak = 0; let anyOk = false;
  const thrownNow: string[] = [];
  const textFailures = new Map<string, { error: string; count: boolean }>();
  const canCall = () => calls < maxLabels && Date.now() < deadline && streak < JOKER_OUTAGE_STOP;
  const count = (o: CallOutcome) => {
    calls += 1; result.calls.made += 1;
    if (o.tokens) { result.calls.tokens_in += o.tokens.in; result.calls.tokens_out += o.tokens.out; result.calls.cost_usd += (o.tokens.in * JOKER_COST_PER_MTOK.input + o.tokens.out * JOKER_COST_PER_MTOK.output) / 1_000_000; }
    if (o.ok) { streak = 0; anyOk = true; } else { streak += o.thrown ? 1 : 0; result.calls.failed += 1; result.errors.push(o.error); }
  };
  const remember = (tk: string, o: Extract<CallOutcome, { ok: true }>) => {
    let title = o.title; let category = o.label.category;
    if (o.label.kind === "recommendation") {
      const same = o.reused ? o.title : sameItemTitle(o.title, recent.map((r) => r.title));
      const known = same ? recent.find((r) => r.title === same) : null;
      if (known) { title = known.title; category = known.category ?? category; recent.splice(recent.indexOf(known), 1); }
      recent.unshift({ title, category });
    }
    const label: TextLabel = { template_key: tk, kind: o.label.kind, category, title };
    texts.set(tk, label); result.labels.push(label);
  };
  const target = (u: Unit): CallTarget => ({ chat_jid: u.row.chat_jid, wa_message_id: u.row.wa_message_id, text: u.text, template_key: u.template_key, member_id: u.group.member_id! });

  for (const { unit: u, why, prior } of needsModel) {
    if (!canCall()) break;
    const key = k(u.row.chat_jid, u.row.wa_message_id);
    const d = decided.get(key)!;
    const vault = await openVault(u.row.chat_jid, u.group.member_id!, [u.row.sender_jid, ...prior.map((m) => m.sender_jid)], broad, { persist: opts.apply });
    if (!vault) { set(key, { ...d, attempts: d.attempts + 1 }); result.errors.push("member not found"); continue; }
    // A context line that still shows a known name after masking is left out (and says so); the
    // message itself is never sent with one (callLabel's own check).
    const all = prior.slice(-12).map((m) => `[${m.wa_timestamp.slice(11, 16)}] ${vault.codeOf(m.sender_jid)}: ${vault.mask(clipText(m.text?.trim() || `(${m.type})`, 400))}`);
    const lines = all.map((l) => (vault.leaks(l).length ? `${l.slice(0, l.indexOf(": ") + 2)}(line withheld)` : l));
    const o = await callLabel(target(u), vault, { lines, why }, opts.apply, shortlist(u.text));
    count(o);
    if (!o.ok) { if (o.thrown) thrownNow.push(key); else set(key, { ...d, attempts: d.attempts + 1 }); continue; }
    set(key, { ...d, decision: o.label.is_opening ? "opening" : "follow_up", reason: clipText(`model: ${o.label.reason || why}`, 300), decided_by: "model" });
    if (o.label.is_opening && u.template_key && !(texts.get(u.template_key) && texts.get(u.template_key) !== "pending")) remember(u.template_key, o);
  }
  // A thrown call counts toward giving up only when another call in this run succeeded.
  if (anyOk) for (const key of thrownNow) { const d = decided.get(key)!; set(key, { ...d, attempts: d.attempts + 1 }); }

  // Pieces follow their send once it is decided.
  for (const key of [...touched]) {
    const d = decided.get(key)!;
    if (d.decision !== "piece" || !d.anchor) continue;
    const a = decided.get(k(split(key)[0], d.anchor));
    if (a && a.decision === "follow_up") set(key, { ...d, decision: "follow_up", anchor: null, reason: `${d.reason}, of a follow-up` });
  }
  settleAlbumPhotos();

  // New texts of openings get their label (one call per distinct text).
  const asked = new Set<string>();
  for (const u of ready) {
    if (decided.get(k(u.row.chat_jid, u.row.wa_message_id))?.decision !== "opening" || !u.template_key || asked.has(u.template_key)) continue;
    const have = texts.get(u.template_key);
    if (have && have !== "pending") continue;
    asked.add(u.template_key);
    if (!canCall()) continue;
    const vault = await openVault(u.row.chat_jid, u.group.member_id!, [u.row.sender_jid], broad, { persist: opts.apply });
    if (!vault) { textFailures.set(u.template_key, { error: "member not found", count: true }); continue; }
    const o = await callLabel(target(u), vault, null, opts.apply, shortlist(u.text));
    count(o);
    if (o.ok) remember(u.template_key, o); else textFailures.set(u.template_key, { error: o.error, count: !o.thrown });
  }
  if (anyOk) for (const f of textFailures.values()) f.count = true;

  // Texts that failed in earlier runs, retried from their stored body.
  if (opts.apply && canCall()) {
    const { data } = await sia().from("joker_texts").select("template_key, sample_chat_jid, sample_wa_message_id, body").eq("label_state", "pending").order("first_seen_at", { ascending: true }).limit(maxLabels);
    for (const t of (data ?? []) as { template_key: string; sample_chat_jid: string; sample_wa_message_id: string; body: string }[]) {
      if (!canCall()) break;
      if (asked.has(t.template_key) || (texts.get(t.template_key) && texts.get(t.template_key) !== "pending")) continue;
      asked.add(t.template_key);
      const g = groups.get(t.sample_chat_jid) ?? (await groupsFor([t.sample_chat_jid])).get(t.sample_chat_jid);
      const vault = g?.member_id ? await openVault(t.sample_chat_jid, g.member_id, [], broad, { persist: true }) : null;
      if (!vault || !g?.member_id) { textFailures.set(t.template_key, { error: "member not found", count: true }); continue; }
      const o = await callLabel({ chat_jid: t.sample_chat_jid, wa_message_id: t.sample_wa_message_id, text: t.body, template_key: t.template_key, member_id: g.member_id }, vault, null, true, shortlist(t.body));
      count(o);
      if (o.ok) remember(t.template_key, o); else textFailures.set(t.template_key, { error: o.error, count: anyOk || !o.thrown });
    }
  }

  // 7. The record (apply only).
  const unitOf = new Map(units.map((u) => [k(u.row.chat_jid, u.row.wa_message_id), u]));
  if (opts.apply) await persist({ touched, decided, texts, textFailures, unitOf, rowByKey, jokers });

  for (const key of touched) {
    const d = decided.get(key)!;
    const r = rowByKey.get(key); if (!r) continue;
    const u = unitOf.get(key);
    const g = groups.get(r.chat_jid);
    result.decisions.push({
      chat_jid: r.chat_jid, wa_message_id: r.wa_message_id, joker_phone: jokers.get(r.sender_jid)?.phone ?? "", joker_name: jokers.get(r.sender_jid)?.name ?? "",
      sent_at: r.wa_timestamp, type: r.type, decision: d.decision, reason: d.reason, decided_by: d.decided_by, anchor: d.anchor,
      template_key: u?.template_key ?? templateKey(r.text), reach: u?.reach ?? 1, member_id: g?.member_id ?? null, queendom_id: g?.queendom_id ?? null,
      text: u?.text ?? r.text ?? "",
    });
  }
  result.decided = result.decisions.length;
  result.openings = result.decisions.filter((d) => d.decision === "opening").length;
  result.undecided = result.decisions.filter((d) => d.decision === "undecided").length;
  result.unlinked = result.decisions.filter((d) => d.decision === "unlinked").length;
  return result;
}

// ─── The record ──────────────────────────────────────────────────────────────

type PersistInput = {
  touched: Set<string>; decided: Map<string, Decided>; texts: Map<string, TextLabel | "pending">;
  textFailures: Map<string, { error: string; count: boolean }>; unitOf: Map<string, Unit>; rowByKey: Map<string, Row>; jokers: Map<string, Joker>;
};

/** Write the run: texts, then openings (for their ids), then every message decided now. */
async function persist(p: PersistInput): Promise<void> {
  const now = new Date().toISOString();
  const openings = [...p.touched].filter((key) => p.decided.get(key)?.decision === "opening").map((key) => p.unitOf.get(key)).filter((u): u is Unit => !!u && !!u.template_key);

  // Texts: one row per distinct text of an opening. A label lands on it; a counted failure adds an attempt.
  const textRows = new Map<string, Record<string, unknown>>();
  for (const u of openings) if (!textRows.has(u.template_key)) textRows.set(u.template_key, {
    template_key: u.template_key, sample_chat_jid: u.row.chat_jid, sample_wa_message_id: u.row.wa_message_id, body: stripGreeting(u.text), first_seen_at: u.row.wa_timestamp,
  });
  for (const part of chunks([...textRows.values()], 300)) {
    const { error } = await sia().from("joker_texts").upsert(part, { onConflict: "template_key", ignoreDuplicates: true });
    if (error) throw new Error(`${LOG} texts write failed: ${error.message}`);
  }
  for (const [tk, t] of p.texts) {
    if (t === "pending") continue;
    await sia().from("joker_texts").update({ label_state: "labelled", kind: t.kind, category: t.category, title: t.title, prompt_version: JOKER_PROMPT_VERSION, labelled_at: now, last_error: null })
      .eq("template_key", tk).neq("label_state", "labelled");
  }
  for (const [tk, f] of p.textFailures) {
    const { data: cur } = await sia().from("joker_texts").select("attempts").eq("template_key", tk).maybeSingle();
    const attempts = Number((cur as { attempts: number } | null)?.attempts ?? 0) + (f.count ? 1 : 0);
    await sia().from("joker_texts").update({ attempts, last_error: clipText(f.error, 300), ...(attempts >= JOKER_MAX_ATTEMPTS ? { label_state: "failed" } : {}) })
      .eq("template_key", tk).eq("label_state", "pending");
  }

  // Openings. The unique (chat, anchor) makes a re-run insert nothing.
  const rows = openings.map((u) => {
    const d = p.decided.get(k(u.row.chat_jid, u.row.wa_message_id))!;
    return {
      chat_jid: u.row.chat_jid, anchor_wa_message_id: u.row.wa_message_id, member_id: u.group.member_id, queendom_id: u.group.queendom_id,
      joker_phone: u.joker.phone, joker_profile_id: u.joker.profileId, sender_jid: u.row.sender_jid, sent_at: u.row.wa_timestamp, template_key: u.template_key,
      broadcast_reach: u.reach, decided_by: d.decided_by, reason: clipText(d.reason, 300), rule_version: JOKER_RULE_VERSION,
    };
  });
  const ids = new Map<string, string>();
  for (const part of chunks(rows, 300)) {
    const { data, error } = await sia().from("joker_openings").upsert(part, { onConflict: "chat_jid,anchor_wa_message_id", ignoreDuplicates: true }).select("id, chat_jid, anchor_wa_message_id");
    if (error) throw new Error(`${LOG} openings write failed: ${error.message}`);
    for (const o of (data ?? []) as { id: string; chat_jid: string; anchor_wa_message_id: string }[]) ids.set(k(o.chat_jid, o.anchor_wa_message_id), o.id);
  }
  for (const [chat, list] of byGroup(rows.filter((r) => !ids.has(k(r.chat_jid, r.anchor_wa_message_id))), (r) => r.chat_jid)) {
    for (const part of chunks(list.map((r) => r.anchor_wa_message_id))) {
      const { data } = await sia().from("joker_openings").select("id, anchor_wa_message_id").eq("chat_jid", chat).in("anchor_wa_message_id", part);
      for (const o of (data ?? []) as { id: string; anchor_wa_message_id: string }[]) ids.set(k(chat, o.anchor_wa_message_id), o.id);
    }
  }

  // Every message decided now, with its opening (its own, or its send's).
  const msgRows: Record<string, unknown>[] = [];
  for (const key of p.touched) {
    const d = p.decided.get(key)!;
    const r = p.rowByKey.get(key); if (!r) continue;
    const [chat, id] = split(key);
    const openingId = d.decision === "opening" ? ids.get(key) ?? null : d.decision === "piece" && d.anchor ? ids.get(k(chat, d.anchor)) ?? d.opening_id : null;
    msgRows.push({
      chat_jid: chat, wa_message_id: id, sender_jid: r.sender_jid, joker_phone: p.jokers.get(r.sender_jid)?.phone ?? "", sent_at: r.wa_timestamp,
      decision: d.decision, reason: clipText(d.reason, 300), anchor_wa_message_id: d.decision === "piece" ? d.anchor : null,
      opening_id: openingId, attempts: d.attempts, rule_version: JOKER_RULE_VERSION, decided_at: now,
    });
  }
  for (const part of chunks(msgRows, 500)) {
    const { error } = await sia().from("joker_messages").upsert(part, { onConflict: "chat_jid,wa_message_id" });
    if (error) throw new Error(`${LOG} decisions write failed: ${error.message}`);
  }

  // Pieces recorded in earlier runs against a send decided only now.
  for (const key of p.touched) {
    const d = p.decided.get(key)!;
    const [chat, id] = split(key);
    if (d.decision === "opening" && ids.has(key)) {
      await sia().from("joker_messages").update({ opening_id: ids.get(key) }).eq("chat_jid", chat).eq("anchor_wa_message_id", id).is("opening_id", null);
    } else if (d.decision === "follow_up") {
      await sia().from("joker_messages").update({ decision: "follow_up", anchor_wa_message_id: null, reason: "part of a send that was a follow-up" })
        .eq("chat_jid", chat).eq("anchor_wa_message_id", id).eq("decision", "piece");
    }
  }
}
