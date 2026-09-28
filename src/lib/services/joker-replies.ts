// joker-replies.ts — THE jokers' threads and replies (migration 0249): step 2 of Recommendations
// & Engagement. Step 1 (joker-capture.ts) records every opening. This ties what follows to it:
//
//   a joker FOLLOW-UP ─► the opening it continues: what it quotes, else the thread that spoke last
//                        in the chat (within a day)
//   a MEMBER message  ─► the opening it answers:
//        quotes anything in a thread       certain; the model reads only the stance
//        typed words                       read per CONVERSATION (a quiet gap ends one: the ticket
//                                          watcher's own cut) once the member goes quiet, days or
//                                          weeks after the item (JOKER_REPLY_WINDOW_DAYS). The model
//                                          sees the joker's latest items plus older ones the words
//                                          name, and says which one (or none) and how they feel
//        only "ok thanks" or an emoji      the free thanks rule: the newest item, when nobody spoke
//                                          since it; never the model
//   a MEMBER emoji    ─► on anything in a thread: certain, read without a model
//   the outcome       ─► Not replied, then Interested / Undecided / Not interested (Replied for a
//                        wish or check-in that offered nothing). Text beats emoji; the latest text wins.
//
// Its own read, never inside the ticket watcher's (owner, 2026-09-26): asking the watcher this
// question moved its ticket answers on 28 of 220 conversations (a plain re-read moves about 1 in 20),
// and the watcher does not read Expired members' groups, where the jokers write too.
//
// Posture: names never reach a model (the profiler's vault); fails closed (a failed read is
// `pending` and never counts); a dry run writes nothing. No `server-only` chain.

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { getBroadSenders, openVault, type Vault } from "@/lib/services/member-profiler";
import { boldPhrases, stripGreeting } from "@/lib/services/joker-capture-rules";
import { clipText } from "@/lib/utils/strings";
import { buildBursts, isOnlyAcknowledgement } from "@/lib/services/ticket-intake";
import {
  byGroup, chunks, contactsFor, groupsFor, pageAll, resolveJokerIds, sideFor, usable,
  type Contact, type Group, type Joker,
} from "@/lib/services/joker-capture";
import {
  JOKER_CLEAR_NO, JOKER_CORRECTION_EXAMPLES, JOKER_COST_PER_MTOK, JOKER_ITEMS_LATEST, JOKER_ITEMS_NAMED,
  JOKER_LOOKBACK_HOURS, JOKER_MAX_ATTEMPTS, JOKER_MESSAGE_CHAR_CAP, JOKER_NAMED_STOPWORDS, JOKER_NEGATIVE_EMOJI,
  JOKER_OPENING_KIND_LABELS, JOKER_OUTAGE_STOP, JOKER_REPLIES_PER_RUN, JOKER_REPLY_PROMPT_VERSION, JOKER_REPLY_RULE_VERSION,
  JOKER_REPLY_CONTEXT_HOURS, JOKER_REPLY_RUN_KIND, JOKER_REPLY_WINDOW_DAYS, JOKER_TEXT_KEY_MAX_CHARS, JOKER_THANKS_TEAM_GAP_MINUTES, JOKER_THANKS_WORDS,
  JOKER_THREAD_GAP_HOURS,
  type JokerOpeningKind, type JokerReplyStatus, type JokerReplyTier, type JokerStance, type JokerTag,
} from "@/lib/constants/joker-engagement";

const LOG = "[joker-replies]";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };
const sia = (): Loose => createAdminClient().schema("sia") as unknown as Loose;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const k = (chat: string, id: string) => `${chat}|${id}`;
const ms = (iso: string) => new Date(iso).getTime();

// ─── Shapes ──────────────────────────────────────────────────────────────────

type Opening = {
  id: string; chat_jid: string; anchor: string; sent_at: number; member_id: string; joker_phone: string;
  kind: JokerOpeningKind | null; tag: JokerTag | null; title: string | null; body: string;
};

type Msg = {
  chat_jid: string; wa_message_id: string; sender_jid: string; type: string; text: string | null;
  quoted_wa_message_id: string | null; wa_timestamp: string; is_revoked: boolean; edit_of_wa_message_id: string | null;
};

export type ReplyJudgement = {
  chat_jid: string; source: "message" | "reaction"; wa_message_id: string; sender_jid: string; emoji: string | null; sent_at: string;
  opening_id: string | null; tier: JokerReplyTier; stance: JokerStance | null; counted: boolean;
  decided_by: "rule" | "model" | "pending" | "person"; reason: string; attempts: number; last_error: string | null; withdrawn_at: string | null;
  /** A short reply's normalised words: how a team correction finds the same words again. */
  text_key?: string | null;
  /** The member's words (a message), in memory only for the pilot's report. */
  text: string;
};

export type ThreadLink = { chat_jid: string; wa_message_id: string; opening_id: string | null; reason: string };

export type OpeningOutcome = { opening_id: string; reply_status: JokerReplyStatus; first_reply_at: string | null; last_reply_at: string | null; replies: number; status_reply_key: string | null };

export type ReplyOptions = {
  apply: boolean;
  /** Back-fill: read member messages from here instead of the last JOKER_LOOKBACK_HOURS. */
  since?: string;
  until?: string;
  maxCalls?: number;
  deadlineMs?: number;
  onProgress?: (line: string) => void;
  /** Trial only (a dry run): judge just these chats. */
  onlyChats?: string[];
  /** Trial only (a dry run): ignore every earlier reading and judge the window again from scratch. */
  fresh?: boolean;
};

export type ReplyResult = {
  openings: number; chats: number; links: ThreadLink[]; judged: ReplyJudgement[]; outcomes: OpeningOutcome[];
  /** made = paid model calls; reused = readings taken from the run ledger, not bought again. */
  calls: { made: number; reused: number; failed: number; tokens_in: number; tokens_out: number; cost_usd: number };
  /** Readings the window needed (a quote with words, or a conversation of typed words); what the calls cap left is read next run. */
  wanted: number;
  errors: string[];
};

// ─── Pure pieces ─────────────────────────────────────────────────────────────

/**
 * The owner's rule, enforced on the words and not left to the model: Not interested only when
 * the member's reply holds a clear no. A model "not interested" without one is Undecided.
 */
export const enforceClearNo = (stance: JokerStance, text: string): JokerStance => (stance === "not_interested" && !JOKER_CLEAR_NO.test(text) ? "undecided" : stance);

/** A short reply's words, normalised ("Maybe later 🙂" → "maybe later"); null for a long message, which is never the same twice. */
export function replyTextKey(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t || t.length > JOKER_TEXT_KEY_MAX_CHARS) return null;
  const key = t.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  return key || null;
}

/** An emoji without its skin tone or presentation mark, so 👍🏻 and 👍 read the same. */
export const bareEmoji = (e: string) => e.replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0F}]/gu, "");

/** An emoji's stance: a small list reads Not interested; anything else on a thread is warm. */
export const emojiStance = (e: string): JokerStance => (JOKER_NEGATIVE_EMOJI.has(bareEmoji(e)) ? "not_interested" : "interested");

/** The words that name an item: from its title and bold phrases, long and uncommon enough to mean it. */
export function namingWords(o: Pick<Opening, "title" | "body">): string[] {
  const src = [o.title ?? "", ...boldPhrases(o.body)].join(" ").toLowerCase();
  return [...new Set(src.normalize("NFKD").replace(/[^\p{L}\p{N} ]+/gu, " ").split(" ").filter((w) => w.length >= 5 && !JOKER_NAMED_STOPWORDS.has(w) && !/^\d+$/.test(w)))];
}

/**
 * THE outcome of an opening from its counted replies (owner, 2026-09-24): text beats emoji, the
 * latest text with a stance (Interested, Undecided, Not interested) wins, and a reply with no
 * stance (a thank-you to a wish) makes it Replied.
 */
export function outcomeOf(replies: Pick<ReplyJudgement, "source" | "stance" | "sent_at" | "counted" | "withdrawn_at">[]): { status: JokerReplyStatus; index: number | null } {
  const live = replies.map((r, i) => ({ r, i })).filter(({ r }) => r.counted && !r.withdrawn_at).sort((a, b) => a.r.sent_at.localeCompare(b.r.sent_at));
  if (live.length === 0) return { status: "not_replied", index: null };
  const withStance = (src: "message" | "reaction") => live.filter(({ r }) => r.source === src && (r.stance === "interested" || r.stance === "undecided" || r.stance === "not_interested"));
  const pick = withStance("message").pop() ?? withStance("reaction").pop();
  if (pick) return { status: pick.r.stance as JokerReplyStatus, index: pick.i };
  return { status: "replied", index: live[live.length - 1].i };
}

// ─── What the team taught (their corrections) ────────────────────────────────

type TeamReadings = { exact: Map<string, JokerStance>; examples: string };

/**
 * The team's corrections, two ways (owner, 2026-09-24): the SAME words get the team's reading
 * directly, without a model; the most recent ones are shown to the model as examples, so similar
 * words follow the team too. The latest correction of the same words wins.
 */
export async function loadTeamReadings(): Promise<TeamReadings> {
  const { data } = await sia().from("joker_reply_corrections").select("tag, text_key, masked_text, new_stance, created_at").order("created_at", { ascending: false }).limit(2000);
  const rows = (data ?? []) as { tag: JokerTag | null; text_key: string | null; masked_text: string; new_stance: JokerStance; created_at: string }[];
  const exact = new Map<string, JokerStance>();
  for (const r of rows) { const key = `${r.tag ?? "recommendation"}|${r.text_key}`; if (r.text_key && !exact.has(key)) exact.set(key, r.new_stance); }
  const lines: string[] = [];
  for (const tag of ["recommendation", "engagement"] as const) {
    const seen = new Set<string>();
    for (const r of rows.filter((x) => (x.tag ?? "recommendation") === tag)) {
      if (seen.size >= JOKER_CORRECTION_EXAMPLES) break;
      const key = r.text_key ?? r.masked_text;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`- (${tag === "engagement" ? "a wish or check-in" : "a pick"}) "${clipText(r.masked_text.replace(/\s+/g, " "), 160)}" → ${r.new_stance}`);
    }
  }
  return { exact, examples: lines.length ? `\n\nHOW OUR TEAM READS REPLIES (their own corrections; follow them for the same or similar words):\n${lines.join("\n")}` : "" };
}

/** The team's reading of these exact words for this kind of item, if they ever corrected it. */
const teamStance = (team: TeamReadings, tag: JokerTag | null, text: string | null | undefined): JokerStance | null => {
  const key = replyTextKey(text);
  return key ? team.exact.get(`${tag ?? "recommendation"}|${key}`) ?? null : null;
};

// ─── The reply reader ────────────────────────────────────────────────────────

/**
 * THE stance rules (owner, 2026-09-24): how a member's answer to a joker's item reads.
 */
export const JOKER_STANCE_RULES = `stance, about the item it answers (the owner's rule: only a clear no is Not interested):
- interested: a yes or a step towards it: yes; order, book or get it; "I'll let you know" or "will check and revert"; a question about it (price, dates, details); asking for another date or time; please wait or hold it; sharing something similar; tagging family; a warm reaction ("wow", "lovely").
- undecided: neither a yes nor a clear no: a reason with no refusal ("I'll be in Delhi then", "we're travelling", "it's expensive", "already have one"), or unsure ("hmm", "let's see", "maybe", "not sure").
- not_interested: ONLY a clear no to it: "no", "no thanks", "not for me", "not interested", "pass", "skip it", "don't want it", "not required", "not possible".
- none: ONLY for a wish, check-in or intro that offered nothing, when the member just thanks, greets back or shares news. Never "none" for a pick.`;

const SYSTEM = `You read what a member just wrote in their WhatsApp group at a luxury concierge: their NEW messages in one conversation (marked ">>"), with the team's replies between them. Earlier the concierge's "joker" sent them the items listed as R1, R2… (a pick, or a wish, check-in or intro), with what she wrote after each. Say which item the member's new messages answer, if any, and how they feel about it. Return ONLY one JSON object, no prose, no code fence:
{
  "about": "R1" | "R2" | … | "none",
  "stance": "interested" | "undecided" | "not_interested" | "none",
  "reason": at most 15 words
}

about:
- The item the new messages answer, even days or weeks after it was sent. Messages about something else are "none": a request for the team, a question about another booking, news, chatter with the team.
- A yes that also asks the team to book, buy or arrange it still answers the item.
- If they answer more than one item, give the one they say the most about.
- When the input says the message QUOTES an item, it answers that item.

${JOKER_STANCE_RULES}
Names are replaced by codes (MEMBER_1 is the member or their household, STAFF_… the concierge team). Use codes exactly as written.`;

function parseJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"); const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

type Candidate = { ref: string; opening: Opening; followUps: string[] };
type ReadOutcome =
  | { ok: true; opening: Opening | null; stance: JokerStance; reason: string; tokens: { in: number; out: number } | null }
  | { ok: false; error: string; thrown: boolean; tokens: { in: number; out: number } | null };

/** The model's answer, checked: only an offered item is believed, and a pick never ends up "none". */
export function validateReply(raw: Record<string, unknown>, cands: Candidate[], quoted: boolean): { opening: Opening | null; stance: JokerStance; reason: string } {
  const about = String(raw.about ?? "none").trim().toUpperCase();
  let opening = cands.find((c) => c.ref === about)?.opening ?? null;
  if (quoted && cands.length === 1) opening = cands[0].opening; // a quote is certain; the model only reads the stance
  let stance: JokerStance = raw.stance === "interested" || raw.stance === "undecided" || raw.stance === "not_interested" || raw.stance === "none" ? raw.stance : "undecided";
  if (opening && stance === "none" && opening.tag !== "engagement") stance = "interested";
  return { opening, stance, reason: typeof raw.reason === "string" ? clipText(raw.reason.replace(/\s+/g, " ").trim(), 160) : "" };
}

/** One reading: the member's new words in one conversation (or one message quoting an item). */
type ReadInput = {
  /** The member's last new message: the reading is recorded on it and keyed by it. */
  key: Msg;
  /** Their new words joined: the clear-no rule and the team's corrections read these. */
  memberText: string;
  /** The conversation from their first new message to their last, masked; theirs start with ">>". */
  lines: string[];
  quoted: boolean;
};

async function readReply(input: ReadInput, cands: Candidate[], before: string[], vault: Vault, apply: boolean, examples: string): Promise<ReadOutcome> {
  const { key, memberText, lines, quoted } = input;
  const candText = cands.map((c) => {
    const body = vault.mask(clipText(stripGreeting(c.opening.body), 600));
    const safe = vault.leaks(body).length ? "(text withheld)" : body;
    const kind = c.opening.kind ? JOKER_OPENING_KIND_LABELS[c.opening.kind] : "Opening";
    const after = c.followUps.map((f) => vault.mask(clipText(f, 200))).filter((f) => !vault.leaks(f).length).map((f) => `   then the joker wrote: ${f}`);
    return [`${c.ref} [${new Date(c.opening.sent_at).toISOString().slice(0, 16).replace("T", " ")}] ${kind}: ${safe}`, ...after].join("\n");
  });
  const userContent = [
    `ITEMS (oldest first):\n${candText.join("\n")}`,
    `CONVERSATION BEFORE (oldest first):\n${before.join("\n") || "- nothing in the last hours"}`,
    quoted ? `THE MEMBER'S MESSAGE (it QUOTES ${cands[0]?.ref}):\n${lines.join("\n")}` : `THE MEMBER'S NEW MESSAGES (">>"), with the team's replies between them (oldest first):\n${lines.join("\n")}`,
  ].join("\n\n");

  const admin = createAdminClient();
  // A reading already paid for (a run whose save failed afterwards) is used again, not bought twice:
  // the same last message, the same prompt, the same openings offered.
  if (apply) {
    const { data: prev } = await admin.schema("sia").from("extraction_runs").select("input_ref, output").eq("kind", JOKER_REPLY_RUN_KIND).eq("ok", true)
      .eq("prompt_version", JOKER_REPLY_PROMPT_VERSION).eq("input_ref->>wa_message_id", key.wa_message_id).eq("input_ref->>chat_jid", key.chat_jid)
      .order("started_at", { ascending: false }).limit(1);
    const p = ((prev ?? []) as { input_ref: { candidates?: string[] } | null; output: { about?: string | null; stance?: JokerStance; reason?: string } | null }[])[0];
    if (p?.output && JSON.stringify(p.input_ref?.candidates ?? []) === JSON.stringify(cands.map((c) => c.opening.id))) {
      const opening = p.output.about ? cands.find((c) => c.opening.id === p.output!.about)?.opening ?? null : null;
      return { ok: true, opening, stance: enforceClearNo(p.output.stance ?? "undecided", memberText), reason: p.output.reason ?? "", tokens: null };
    }
  }
  let runId: string | null = null;
  if (apply) {
    const { data } = await admin.schema("sia").from("extraction_runs").insert({
      kind: JOKER_REPLY_RUN_KIND, member_id: cands[0]?.opening.member_id ?? null, prompt_version: JOKER_REPLY_PROMPT_VERSION, started_at: new Date().toISOString(),
      input_ref: { chat_jid: key.chat_jid, wa_message_id: key.wa_message_id, member_messages: lines.filter((l) => l.startsWith(">>")).length, candidates: cands.map((c) => c.opening.id), quoted, masked_input: clipText(userContent, 8_000) },
    }).select("id").single();
    runId = (data as { id: string } | null)?.id ?? null;
  }
  const finish = async (ok: boolean, patch: Record<string, unknown>) => { if (runId) await admin.schema("sia").from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", runId); };

  try {
    const llm = await resolveLlmForJob("routing");
    const result = await llm.adapter.complete({ model: llm.model, maxTokens: 300, effort: "low", timeoutMs: 30_000, cachePrefix: true, system: SYSTEM + examples, messages: [{ role: "user", content: userContent }] });
    const tokens = { in: result.usage.inputTokens, out: result.usage.outputTokens };
    const usage = { model: llm.model, tokens_in: tokens.in, tokens_out: tokens.out, cost_usd: (tokens.in * JOKER_COST_PER_MTOK.input + tokens.out * JOKER_COST_PER_MTOK.output) / 1_000_000 };
    const raw = result.stopReason === "max_tokens" ? null : parseJson(result.text);
    if (!raw) { await finish(false, { ...usage, error: "no usable json", output: { text: clipText(result.text, 800) } }); return { ok: false, error: "no usable json", thrown: false, tokens }; }
    const v = validateReply(raw, cands, quoted);
    v.stance = enforceClearNo(v.stance, memberText);
    await finish(true, { ...usage, output: { about: v.opening?.id ?? null, stance: v.stance, reason: v.reason } });
    return { ok: true, ...v, tokens };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await finish(false, { error: clipText(m, 500) });
    return { ok: false, error: m, thrown: true, tokens: null };
  }
}

// ─── The sweep ───────────────────────────────────────────────────────────────

type ThreadMsg = { opening_id: string; at: number; joker: boolean };

export async function runJokerReplySweep(opts: ReplyOptions): Promise<ReplyResult> {
  const t0 = Date.now();
  const deadline = opts.deadlineMs ? t0 + opts.deadlineMs : Infinity;
  const maxCalls = opts.maxCalls ?? JOKER_REPLIES_PER_RUN;
  const until = opts.until ?? new Date(t0 - MIN).toISOString();
  const since = opts.since ?? new Date(t0 - JOKER_LOOKBACK_HOURS * HOUR).toISOString();
  const windowFrom = new Date(ms(since) - JOKER_REPLY_WINDOW_DAYS * DAY).toISOString();
  if (opts.apply && (opts.onlyChats || opts.fresh)) throw new Error(`${LOG} trial options are for a dry run only`);
  const say = (s: string) => opts.onProgress?.(s);
  const result: ReplyResult = { openings: 0, chats: 0, links: [], judged: [], outcomes: [], calls: { made: 0, reused: 0, failed: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 }, wanted: 0, errors: [] };

  // 1. The openings that can still be answered, with their text's label.
  const raw = await pageAll<{ id: string; chat_jid: string; anchor_wa_message_id: string; sent_at: string; member_id: string; joker_phone: string; template_key: string }>((a, b) =>
    sia().from("joker_openings").select("id, chat_jid, anchor_wa_message_id, sent_at, member_id, joker_phone, template_key").gte("sent_at", windowFrom).lt("sent_at", until)
      .order("sent_at", { ascending: true }).order("id", { ascending: true }).range(a, b));
  const texts = new Map<string, { kind: JokerOpeningKind | null; tag: JokerTag | null; title: string | null; body: string }>();
  for (const part of chunks([...new Set(raw.map((o) => o.template_key))])) {
    const { data } = await sia().from("joker_texts").select("template_key, kind, tag, title, body").in("template_key", part);
    for (const t of (data ?? []) as { template_key: string; kind: JokerOpeningKind | null; tag: JokerTag | null; title: string | null; body: string }[]) texts.set(t.template_key, t);
  }
  const openings: Opening[] = raw.map((o) => {
    const t = texts.get(o.template_key);
    return { id: o.id, chat_jid: o.chat_jid, anchor: o.anchor_wa_message_id, sent_at: ms(o.sent_at), member_id: o.member_id, joker_phone: o.joker_phone, kind: t?.kind ?? null, tag: t?.tag ?? null, title: t?.title ?? null, body: t?.body ?? "" };
  });
  const openingById = new Map(openings.map((o) => [o.id, o]));
  const openingsByChat = byGroup(openings, (o) => o.chat_jid);
  const only = opts.onlyChats ? new Set(opts.onlyChats) : null;
  const chats = [...openingsByChat.keys()].filter((c) => !only || only.has(c));
  result.openings = openings.length; result.chats = chats.length;
  say(`${openings.length} openings in ${chats.length} chats can still be answered`);
  if (chats.length === 0) return result;

  // 2. The threads so far: every joker message tied to an opening, and every member reply judged.
  const thread = new Map<string, ThreadMsg>();
  const toLink: { chat_jid: string; wa_message_id: string }[] = [];
  const judgedBefore = new Map<string, ReplyJudgement & { id?: string }>();
  for (const part of chunks(chats)) {
    const jm = await pageAll<{ chat_jid: string; wa_message_id: string; opening_id: string | null; decision: string; sent_at: string; thread_reason: string | null }>((a, b) =>
      sia().from("joker_messages").select("chat_jid, wa_message_id, opening_id, decision, sent_at, thread_reason").in("chat_jid", part).gte("sent_at", windowFrom)
        .order("sent_at", { ascending: true }).order("wa_message_id", { ascending: true }).range(a, b));
    for (const m of jm) {
      if (m.opening_id) thread.set(k(m.chat_jid, m.wa_message_id), { opening_id: m.opening_id, at: ms(m.sent_at), joker: true });
      else if (m.decision === "follow_up" && !m.thread_reason && ms(m.sent_at) >= ms(since) && ms(m.sent_at) < ms(until)) toLink.push(m);
    }
    // A fresh trial judges everything again: earlier readings are not loaded.
    const jr = opts.fresh ? [] : await pageAll<ReplyJudgement & { id: string }>((a, b) =>
      sia().from("joker_replies").select("id, chat_jid, source, wa_message_id, sender_jid, emoji, sent_at, opening_id, tier, stance, counted, decided_by, reason, attempts, last_error, withdrawn_at")
        .in("chat_jid", part).gte("sent_at", windowFrom).order("sent_at", { ascending: true }).order("id", { ascending: true }).range(a, b));
    for (const r of jr) {
      judgedBefore.set(`${r.chat_jid}|${r.source}|${r.wa_message_id}|${r.sender_jid}`, { ...r, text: "" });
      if (r.source === "message" && r.opening_id && !r.withdrawn_at) thread.set(k(r.chat_jid, r.wa_message_id), { opening_id: r.opening_id, at: ms(r.sent_at), joker: false });
    }
  }
  const linkSet = new Set(toLink.map((m) => k(m.chat_jid, m.wa_message_id)));

  // 3. The chat itself over the window, who everyone is, and what the team taught.
  const [jokers, broad, team] = await Promise.all([resolveJokerIds(), getBroadSenders(), loadTeamReadings()]);
  const groups = await groupsFor(chats);
  const ctxFrom = new Date(ms(since) - JOKER_REPLY_CONTEXT_HOURS * HOUR).toISOString();
  const msgs: Msg[] = [];
  for (const part of chunks(chats, 60)) {
    msgs.push(...(await pageAll<Msg>((a, b) => sia().from("wag_messages")
      .select("chat_jid, wa_message_id, sender_jid, type, text, quoted_wa_message_id, wa_timestamp, is_revoked, edit_of_wa_message_id")
      .in("chat_jid", part).gte("wa_timestamp", ctxFrom).lt("wa_timestamp", until).order("wa_timestamp", { ascending: true }).order("wa_message_id", { ascending: true }).range(a, b))));
  }
  // The mirror can hold the same message twice (a redelivery); each is judged once.
  const once = new Set<string>();
  const live = msgs.filter(usable).filter((m) => { const kk = k(m.chat_jid, m.wa_message_id); if (once.has(kk)) return false; once.add(kk); return true; });
  const liveByChat = byGroup(live, (m) => m.chat_jid);
  const byKey = new Map(live.map((m) => [k(m.chat_jid, m.wa_message_id), m]));
  // Quotes of messages older than the window: who sent them, and what THEY quoted (one hop).
  const quoteInfo = new Map<string, { sender: string; quoted: string | null }>();
  for (const m of live) quoteInfo.set(k(m.chat_jid, m.wa_message_id), { sender: m.sender_jid, quoted: m.quoted_wa_message_id });
  for (const [chat, list] of byGroup(live.filter((m) => m.quoted_wa_message_id && !quoteInfo.has(k(m.chat_jid, m.quoted_wa_message_id))), (m) => m.chat_jid)) {
    for (const part of chunks([...new Set(list.map((m) => m.quoted_wa_message_id!))])) {
      const { data } = await sia().from("wag_messages").select("wa_message_id, sender_jid, quoted_wa_message_id").eq("chat_jid", chat).in("wa_message_id", part);
      for (const q of (data ?? []) as { wa_message_id: string; sender_jid: string; quoted_wa_message_id: string | null }[]) quoteInfo.set(k(chat, q.wa_message_id), { sender: q.sender_jid, quoted: q.quoted_wa_message_id });
    }
  }
  const contacts: Map<string, Contact[]> = await contactsFor([...new Set(live.map((m) => m.sender_jid))]);
  const side = (jid: string, g: Group) => sideFor(jid, g, jokers as Map<string, Joker>, contacts, broad);

  /** The opening a quoted message belongs to: directly, or through the message IT quoted (a genie quoting the pick). */
  const openingOfQuote = (chat: string, quoted: string | null): string | null => {
    if (!quoted) return null;
    const direct = thread.get(k(chat, quoted));
    if (direct) return direct.opening_id;
    const hop = quoteInfo.get(k(chat, quoted))?.quoted;
    return hop ? thread.get(k(chat, hop))?.opening_id ?? null : null;
  };
  /** The thread that spoke last in the chat before `at`, within the gap. */
  const lastThreadBefore = (chat: string, at: number): string | null => {
    let best: ThreadMsg | null = null;
    for (const [key, t] of thread) if (key.startsWith(`${chat}|`) && t.at < at && t.at >= at - JOKER_THREAD_GAP_HOURS * HOUR && (!best || t.at > best.at)) best = t;
    return best?.opening_id ?? null;
  };

  // 4. Walk each chat in order: joker follow-ups are tied to their thread, a member's quote to what it
  //    quotes; the member's typed words wait for their conversation (4b).
  type Job = { msgs: Msg[]; cands: Opening[]; tier: JokerReplyTier; quoted: boolean; why: string; attempts: number };
  const jobs: Job[] = [];
  const judged: ReplyJudgement[] = [];
  const typed = new Set<string>();
  const add = (j: ReplyJudgement) => { judged.push(j); if (j.source === "message" && j.opening_id && j.counted) thread.set(k(j.chat_jid, j.wa_message_id), { opening_id: j.opening_id, at: ms(j.sent_at), joker: false }); };
  const base = (m: Msg): Omit<ReplyJudgement, "opening_id" | "tier" | "stance" | "counted" | "decided_by" | "reason"> =>
    ({ chat_jid: m.chat_jid, source: "message", wa_message_id: m.wa_message_id, sender_jid: m.sender_jid, emoji: null, sent_at: m.wa_timestamp, attempts: 0, last_error: null, withdrawn_at: null, text: m.text ?? "", text_key: replyTextKey(m.text) });
  const judgedKey = (m: Msg) => `${m.chat_jid}|message|${m.wa_message_id}|${m.sender_jid}`;
  const answerable = (opens: Opening[], from: number, to: number) => opens.filter((o) => o.sent_at < to && o.sent_at >= from - JOKER_REPLY_WINDOW_DAYS * DAY);
  /**
   * One reading of a conversation. The tie goes on the member's LAST new message (their final word,
   * which the outcome's "latest wins" reads); their earlier messages in it are marked read with it,
   * so nothing is read twice. Returns the rows it wrote.
   */
  const record = (msgs: Msg[], words: string, r: { opening: Opening | null; stance: JokerStance | null; tier: JokerReplyTier; decided_by: ReplyJudgement["decided_by"]; reason: string; attempts: number; last_error?: string | null }): ReplyJudgement[] => {
    const last = msgs[msgs.length - 1];
    const pending = r.decided_by === "pending";
    const rows: ReplyJudgement[] = msgs.slice(0, -1).map((m) => ({ ...base(m), attempts: r.attempts, opening_id: null, tier: pending ? r.tier : "none", stance: null, counted: false, decided_by: r.decided_by,
      reason: pending ? r.reason : `read with the member's message at ${last.wa_timestamp.slice(11, 16)}`, last_error: r.last_error ?? null }));
    rows.push({ ...base(last), text: words, text_key: replyTextKey(words), attempts: r.attempts, opening_id: r.opening?.id ?? null, tier: r.opening || pending ? r.tier : "none",
      stance: r.opening ? r.stance : null, counted: !!r.opening, decided_by: r.decided_by, reason: clipText(r.reason, 300), last_error: r.last_error ?? null });
    for (const row of rows) add(row);
    return rows;
  };

  for (const chat of chats) {
    const g = groups.get(chat); if (!g?.member_id) continue;
    const opens = (openingsByChat.get(chat) ?? []).sort((a, b) => a.sent_at - b.sent_at);
    const events = (liveByChat.get(chat) ?? []).filter((m) => ms(m.wa_timestamp) >= ms(since));
    for (const m of events) {
      const key = k(chat, m.wa_message_id);
      const at = ms(m.wa_timestamp);
      if (linkSet.has(key)) {
        const viaQuote = openingOfQuote(chat, m.quoted_wa_message_id);
        const opening = viaQuote ?? lastThreadBefore(chat, at);
        result.links.push({ chat_jid: chat, wa_message_id: m.wa_message_id, opening_id: opening, reason: viaQuote ? "quotes the thread" : opening ? "continues the thread that spoke last" : "no open thread" });
        if (opening) thread.set(key, { opening_id: opening, at, joker: true });
        continue;
      }
      if (side(m.sender_jid, g) !== "client") continue;
      const before = judgedBefore.get(judgedKey(m));
      if (before && !(before.decided_by === "pending" && before.attempts < JOKER_MAX_ATTEMPTS)) continue;
      const attempts = before?.attempts ?? 0;
      const text = (m.text ?? "").trim();
      if (answerable(opens, at, at).length === 0) continue;

      // Quote: certain about the thread. Only the stance needs reading, and only when there are words.
      const q = openingOfQuote(chat, m.quoted_wa_message_id);
      if (m.quoted_wa_message_id) {
        const o = q ? openingById.get(q) : undefined;
        if (!o) continue; // quotes something else: never tied
        if (!text) {
          const stance: JokerStance = m.type === "voice" || m.type === "audio" ? "none" : o.tag === "engagement" ? "none" : "interested";
          add({ ...base(m), opening_id: o.id, tier: "quote", stance, counted: true, decided_by: "rule", reason: m.type === "voice" || m.type === "audio" ? "a voice note quoting it (no transcript)" : `a ${m.type} quoting it` });
          continue;
        }
        const taught = teamStance(team, o.tag, text);
        if (taught) add({ ...base(m), opening_id: o.id, tier: "quote", stance: taught, counted: true, decided_by: "rule", reason: "quotes it; the team's reading of these words" });
        else jobs.push({ msgs: [m], cands: [o], tier: "quote", quoted: true, why: "quotes it", attempts });
        // Certain: it joins the thread now, so a follow-up right after it finds the right opening.
        thread.set(key, { opening_id: o.id, at, joker: false });
        continue;
      }
      if (text) typed.add(key); // a photo or voice note with no quote: nothing says what it answers
    }
  }

  // 4b. The member's typed words, one conversation at a time (the ticket watcher's own cut: a quiet
  //     gap ends one, and one still moving waits). No hour rule: the model sees the joker's latest
  //     items, plus older ones the words name. An acknowledgement alone never reaches the model.
  for (const chat of chats) {
    const g = groups.get(chat); if (!g?.member_id) continue;
    const all = liveByChat.get(chat) ?? [];
    if (!all.some((m) => typed.has(k(chat, m.wa_message_id)))) continue;
    const opens = (openingsByChat.get(chat) ?? []).sort((a, b) => a.sent_at - b.sent_at);
    for (const burst of buildBursts(all, ms(until))) {
      const fresh = burst.filter((m) => typed.has(k(chat, m.wa_message_id)));
      if (fresh.length === 0) continue;
      const first = ms(fresh[0].wa_timestamp); const last = ms(fresh[fresh.length - 1].wa_timestamp);
      const recent = answerable(opens, first, last);
      if (recent.length === 0) continue;
      const words = fresh.map((m) => (m.text ?? "").trim()).join("\n");
      const attempts = Math.max(0, ...fresh.map((m) => judgedBefore.get(judgedKey(m))?.attempts ?? 0));
      if (isOnlyAcknowledgement(fresh.map((m) => m.text ?? ""))) {
        const earlier = all.filter((x) => ms(x.wa_timestamp) < first);
        const lastAt = (xs: Msg[]) => (xs.length ? ms(xs[xs.length - 1].wa_timestamp) : null);
        const t = thanksReply(recent, words, { firstMember: first, seenFrom: ms(ctxFrom), lastMemberBefore: lastAt(earlier.filter((x) => side(x.sender_jid, g) === "client")), lastOther: lastAt(earlier.filter((x) => side(x.sender_jid, g) !== "client")) });
        if (t) record(fresh, words, { opening: t.opening, stance: t.stance, tier: "thanks", decided_by: "rule", reason: "only thanks or an emoji, the member's first word since the item", attempts: 0 });
        continue;
      }
      const said = ` ${words.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]+/gu, " ")} `;
      const older = recent.slice(0, -JOKER_ITEMS_LATEST).filter((o) => o.tag !== "engagement" && namingWords(o).some((w) => said.includes(` ${w} `))).slice(-JOKER_ITEMS_NAMED);
      jobs.push({ msgs: fresh, cands: [...older, ...recent.slice(-JOKER_ITEMS_LATEST)], tier: "typed", quoted: false, why: "typed", attempts });
    }
  }
  say(`${result.links.length} follow-ups tied, ${jobs.length} readings to make: ${JSON.stringify(Object.fromEntries([...byGroup(jobs, (j) => j.tier)].map(([t, l]) => [t, l.length])))}, ${judged.filter((j) => j.tier === "thanks" && j.counted).length} settled by the thanks rule`);

  // 5. The model reads what needs reading (quotes first: certain threads, only the stance is open).
  result.wanted = jobs.length;
  const order: JokerReplyTier[] = ["quote", "typed"];
  jobs.sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || a.msgs[0].wa_timestamp.localeCompare(b.msgs[0].wa_timestamp));
  let calls = 0; let streak = 0; let anyOk = false;
  const thrown: ReplyJudgement[] = [];
  for (const j of jobs) {
    if (calls >= maxCalls || Date.now() >= deadline || streak >= JOKER_OUTAGE_STOP) break;
    const chat = j.msgs[0].chat_jid; const g = groups.get(chat)!;
    const first = ms(j.msgs[0].wa_timestamp); const lastMsg = j.msgs[j.msgs.length - 1]; const lastAt = ms(lastMsg.wa_timestamp);
    const chatMsgs = liveByChat.get(chat) ?? [];
    const prior = chatMsgs.filter((x) => ms(x.wa_timestamp) < first && ms(x.wa_timestamp) >= first - 6 * HOUR).slice(-8);
    const span = chatMsgs.filter((x) => ms(x.wa_timestamp) >= first && ms(x.wa_timestamp) <= lastAt);
    const mine = new Set(j.msgs.map((m) => m.wa_message_id));
    const vault = await openVault(chat, g.member_id!, [...prior, ...span].map((x) => x.sender_jid), broad, { persist: opts.apply });
    if (!vault) { result.errors.push("member not found"); continue; }
    const line = (x: Msg) => `[${x.wa_timestamp.slice(11, 16)}] ${vault.codeOf(x.sender_jid)}: ${vault.mask(clipText(x.text?.trim() || `(${x.type})`, mine.has(x.wa_message_id) ? JOKER_MESSAGE_CHAR_CAP : 300))}`;
    const withheld = (l: string) => (vault.leaks(l).length ? `${l.slice(0, l.indexOf(": ") + 2)}(line withheld)` : l);
    const words = j.msgs.map((m) => (m.text ?? "").trim()).filter(Boolean).join("\n");
    // The member's own words are checked (a leak stops the reading); anyone else's line is withheld.
    const leak = span.some((x) => mine.has(x.wa_message_id) && vault.leaks(line(x)).length > 0);
    const followUpsOf = (o: Opening) => [...thread].filter(([key, t]) => key.startsWith(`${chat}|`) && t.opening_id === o.id && t.joker && t.at < lastAt).map(([key]) => byKey.get(key)?.text ?? "").filter((x) => x && x.trim()).slice(-2);
    const cands: Candidate[] = j.cands.map((o, i) => ({ ref: `R${i + 1}`, opening: o, followUps: followUpsOf(o) }));
    const o: ReadOutcome = leak ? { ok: false, error: "vault leak (member message)", thrown: false, tokens: null }
      : await readReply({ key: lastMsg, memberText: words, lines: span.map((x) => (mine.has(x.wa_message_id) ? `>> ${line(x)}` : `   ${withheld(line(x))}`)), quoted: j.quoted }, cands, prior.map((x) => withheld(line(x))), vault, opts.apply, team.examples);
    if (!leak) { if (o.ok && !o.tokens) result.calls.reused += 1; else { calls += 1; result.calls.made += 1; } }
    if (o.tokens) { result.calls.tokens_in += o.tokens.in; result.calls.tokens_out += o.tokens.out; result.calls.cost_usd += (o.tokens.in * JOKER_COST_PER_MTOK.input + o.tokens.out * JOKER_COST_PER_MTOK.output) / 1_000_000; }
    if (!o.ok) {
      streak += o.thrown ? 1 : 0; result.calls.failed += 1; result.errors.push(o.error);
      const rows = record(j.msgs, words, { opening: null, stance: null, tier: j.tier, decided_by: "pending", reason: j.why, attempts: j.attempts + (o.thrown ? 0 : 1), last_error: clipText(o.error, 300) });
      if (o.thrown) thrown.push(...rows);
      continue;
    }
    streak = 0; anyOk = true;
    const taught = o.opening ? teamStance(team, o.opening.tag, words) : null;
    record(j.msgs, words, { opening: o.opening, stance: o.opening ? taught ?? o.stance : null, tier: j.tier, decided_by: "model", reason: `${j.why}: ${o.reason}`, attempts: j.attempts });
  }
  // A thrown call counts toward giving up only when another call in this run succeeded.
  if (anyOk) for (const p of thrown) p.attempts += 1;

  // 6. Emoji on anything in a thread, as they stand now: a change updates, a removal withdraws.
  const reactions: { chat_jid: string; wa_message_id: string; reactor_jid: string; emoji: string; reacted_at: string }[] = [];
  for (const part of chunks(chats)) {
    reactions.push(...(await pageAll<{ chat_jid: string; wa_message_id: string; reactor_jid: string; emoji: string; reacted_at: string }>((a, b) =>
      sia().from("wag_reactions").select("chat_jid, wa_message_id, reactor_jid, emoji, reacted_at").in("chat_jid", part)
        .order("chat_jid", { ascending: true }).order("wa_message_id", { ascending: true }).order("reactor_jid", { ascending: true }).range(a, b))));
  }
  const reactorContacts = await contactsFor([...new Set(reactions.map((r) => r.reactor_jid))]);
  for (const [kk, v] of reactorContacts) contacts.set(kk, v);
  const seen = new Set<string>();
  for (const r of reactions) {
    const t = thread.get(k(r.chat_jid, r.wa_message_id));
    const g = groups.get(r.chat_jid);
    if (!t || !t.joker || !g?.member_id || side(r.reactor_jid, g) !== "client" || ms(r.reacted_at) >= ms(until)) continue;
    const key = `${r.chat_jid}|reaction|${r.wa_message_id}|${r.reactor_jid}`;
    seen.add(key);
    const before = judgedBefore.get(key);
    if (before && before.emoji === r.emoji && !before.withdrawn_at && before.opening_id === t.opening_id) continue;
    add({ chat_jid: r.chat_jid, source: "reaction", wa_message_id: r.wa_message_id, sender_jid: r.reactor_jid, emoji: r.emoji, sent_at: r.reacted_at,
      opening_id: t.opening_id, tier: "reaction", stance: emojiStance(r.emoji), counted: true, decided_by: "rule", reason: `reacted ${r.emoji}`, attempts: 0, last_error: null, withdrawn_at: null, text: "" });
  }
  for (const [key, b] of judgedBefore) {
    if (b.source !== "reaction" || b.withdrawn_at || seen.has(key)) continue;
    add({ ...b, text: "", withdrawn_at: new Date().toISOString(), reason: `${b.reason ?? ""} (taken back)`.trim() });
  }
  result.judged = judged;

  // 7. Outcomes of every opening something new was said about.
  const touched = new Set(judged.map((j) => j.opening_id).filter((x): x is string => !!x));
  for (const b of judgedBefore.values()) if (b.withdrawn_at === null && judged.some((j) => j.source === b.source && j.wa_message_id === b.wa_message_id && j.sender_jid === b.sender_jid && b.opening_id)) touched.add(b.opening_id!);
  for (const id of touched) {
    const now = judged.filter((j) => j.opening_id === id);
    const keyOf = (j: Pick<ReplyJudgement, "chat_jid" | "source" | "wa_message_id" | "sender_jid">) => `${j.chat_jid}|${j.source}|${j.wa_message_id}|${j.sender_jid}`;
    const nowKeys = new Set(now.map(keyOf));
    const all = [...[...judgedBefore.values()].filter((b) => b.opening_id === id && !nowKeys.has(keyOf(b))), ...now];
    const { status, index } = outcomeOf(all);
    const counted = all.filter((r) => r.counted && !r.withdrawn_at).map((r) => r.sent_at).sort();
    result.outcomes.push({ opening_id: id, reply_status: status, first_reply_at: counted[0] ?? null, last_reply_at: counted[counted.length - 1] ?? null, replies: counted.length, status_reply_key: index === null ? null : keyOf(all[index]) });
  }

  if (opts.apply) await persist(result);
  return result;
}

// ─── The record ──────────────────────────────────────────────────────────────

async function persist(r: ReplyResult): Promise<void> {
  // Follow-ups: the thread they belong to (or that none was open), so they are not looked at again.
  for (const [opening, list] of byGroup(r.links, (l) => `${l.opening_id ?? ""}|${l.reason}`)) {
    const [id, reason] = [opening.slice(0, opening.indexOf("|")), opening.slice(opening.indexOf("|") + 1)];
    for (const [chat, ls] of byGroup(list, (l) => l.chat_jid)) {
      for (const part of chunks(ls.map((l) => l.wa_message_id))) {
        const { error } = await sia().from("joker_messages").update({ opening_id: id || null, thread_reason: reason }).eq("chat_jid", chat).in("wa_message_id", part).eq("decision", "follow_up");
        if (error) throw new Error(`${LOG} follow-up links failed: ${error.message}`);
      }
    }
  }
  // Replies.
  const unique = [...new Map(r.judged.map((j) => [`${j.chat_jid}|${j.source}|${j.wa_message_id}|${j.sender_jid}`, j])).values()];
  const rows = unique.map((j) => ({
    chat_jid: j.chat_jid, source: j.source, wa_message_id: j.wa_message_id, sender_jid: j.sender_jid, emoji: j.emoji, sent_at: j.sent_at,
    opening_id: j.opening_id, tier: j.tier, stance: j.stance, counted: j.counted, decided_by: j.decided_by, reason: clipText(j.reason, 300),
    withdrawn_at: j.withdrawn_at, attempts: j.attempts, last_error: j.last_error, rule_version: JOKER_REPLY_RULE_VERSION, text_key: j.text_key ?? null,
  }));
  const ids = new Map<string, string>();
  for (const part of chunks(rows, 300)) {
    const { data, error } = await sia().from("joker_replies").upsert(part, { onConflict: "chat_jid,source,wa_message_id,sender_jid" }).select("id, chat_jid, source, wa_message_id, sender_jid");
    if (error) throw new Error(`${LOG} replies write failed: ${error.message}`);
    for (const x of (data ?? []) as { id: string; chat_jid: string; source: string; wa_message_id: string; sender_jid: string }[]) ids.set(`${x.chat_jid}|${x.source}|${x.wa_message_id}|${x.sender_jid}`, x.id);
  }
  // Outcomes. The reply that set one may have been written in an earlier run.
  for (const o of r.outcomes) {
    let replyId = o.status_reply_key ? ids.get(o.status_reply_key) ?? null : null;
    if (o.status_reply_key && !replyId) {
      const [chat, source, wa, sender] = o.status_reply_key.split("|");
      const { data } = await sia().from("joker_replies").select("id").eq("chat_jid", chat).eq("source", source).eq("wa_message_id", wa).eq("sender_jid", sender).maybeSingle();
      replyId = (data as { id: string } | null)?.id ?? null;
    }
    const { error } = await sia().from("joker_openings").update({ reply_status: o.reply_status, first_reply_at: o.first_reply_at, last_reply_at: o.last_reply_at, replies: o.replies, status_reply_id: replyId }).eq("id", o.opening_id);
    if (error) throw new Error(`${LOG} outcome write failed: ${error.message}`);
  }
}

// ─── The team's correction ───────────────────────────────────────────────────

/** Recompute and write the outcome of these openings from every reply they have (outcomeOf). */
export async function recomputeOutcomes(openingIds: string[]): Promise<void> {
  for (const part of chunks([...new Set(openingIds)])) {
    const { data, error } = await sia().from("joker_replies").select("id, opening_id, source, stance, sent_at, counted, withdrawn_at").in("opening_id", part);
    if (error) throw new Error(`${LOG} outcome read failed: ${error.message}`);
    const rows = (data ?? []) as { id: string; opening_id: string; source: "message" | "reaction"; stance: JokerStance | null; sent_at: string; counted: boolean; withdrawn_at: string | null }[];
    for (const id of part) {
      const mine = rows.filter((r) => r.opening_id === id);
      const { status, index } = outcomeOf(mine);
      const counted = mine.filter((r) => r.counted && !r.withdrawn_at).map((r) => r.sent_at).sort();
      const { error: e2 } = await sia().from("joker_openings").update({
        reply_status: status, first_reply_at: counted[0] ?? null, last_reply_at: counted[counted.length - 1] ?? null, replies: counted.length,
        status_reply_id: index === null ? null : mine[index].id,
      }).eq("id", id);
      if (e2) throw new Error(`${LOG} outcome write failed: ${e2.message}`);
    }
  }
}

/** `notAReply` (0251): "this message is not a reply to this item" — the reply stops counting and its words go nowhere else. */
export type CorrectReplyInput = { replyId: string; stance: JokerStance; correctedBy: string | null; note?: string | null; notAReply?: boolean };

/**
 * THE team correction of how a reply was read (owner, 2026-09-24): the core the results view's
 * action calls (the UI comes later), and the only way a person changes a reading.
 *   1. the correction is recorded, append-only, with the member's words masked (safe to show a model);
 *   2. this reply takes the team's reading;
 *   3. every other reply with the SAME words on the same kind of item takes it too, unless a person
 *      already set that one (history stays consistent);
 *   4. the outcomes of every opening touched are recomputed.
 * From then on the same words get the team's reading without a model, and the latest corrections
 * are shown to the model as examples (loadTeamReadings). Returns { data, error }, never throws.
 */
export async function correctReplyCore(input: CorrectReplyInput): Promise<{ data: { replies_changed: number; openings_updated: number } | null; error: string | null }> {
  try {
    const { data: r } = await sia().from("joker_replies").select("id, chat_jid, source, wa_message_id, sender_jid, emoji, stance, opening_id, text_key").eq("id", input.replyId).maybeSingle();
    const reply = r as { id: string; chat_jid: string; source: "message" | "reaction"; wa_message_id: string; sender_jid: string; emoji: string | null; stance: JokerStance | null; opening_id: string | null; text_key: string | null } | null;
    if (!reply) return { data: null, error: "That reply could not be found." };
    if (!reply.opening_id) return { data: null, error: "That message is not tied to any recommendation or engagement." };

    const { data: o } = await sia().from("joker_openings").select("id, member_id, template_key").eq("id", reply.opening_id).maybeSingle();
    const opening = o as { id: string; member_id: string; template_key: string } | null;
    if (!opening) return { data: null, error: "The recommendation this reply belongs to could not be found." };
    const { data: t } = await sia().from("joker_texts").select("tag").eq("template_key", opening.template_key).maybeSingle();
    const tag = ((t as { tag: JokerTag | null } | null)?.tag) ?? "recommendation";

    // The member's words, masked with their group's vault: this record is later shown to a model.
    let text = reply.emoji ?? "";
    if (reply.source === "message") {
      const { data: m } = await sia().from("wag_messages").select("text").eq("chat_jid", reply.chat_jid).eq("wa_message_id", reply.wa_message_id).limit(1);
      text = ((m ?? []) as { text: string | null }[])[0]?.text ?? "";
    }
    const vault = await openVault(reply.chat_jid, opening.member_id, [reply.sender_jid], await getBroadSenders(), { persist: true });
    const maskedText = vault ? vault.mask(clipText(text, 300)) : "";
    const safe = maskedText && vault && !vault.leaks(maskedText).length ? maskedText : "(words withheld)";
    const textKey = reply.source === "message" ? reply.text_key ?? replyTextKey(text) : null;

    const { error: e1 } = await sia().from("joker_reply_corrections").insert({
      reply_id: reply.id, opening_id: opening.id, tag, text_key: textKey, masked_text: safe,
      old_stance: reply.stance, new_stance: input.notAReply ? "none" : input.stance, not_a_reply: !!input.notAReply,
      corrected_by: input.correctedBy, note: input.note ? clipText(input.note, 300) : null,
    });
    if (e1) return { data: null, error: "The correction could not be saved." };

    const patch = input.notAReply
      ? { counted: false, decided_by: "person", reason: "not a reply to this item (the team)" }
      : { stance: input.stance, decided_by: "person", counted: true, reason: "corrected by the team" };
    const { error: e2 } = await sia().from("joker_replies").update(patch).eq("id", reply.id);
    if (e2) return { data: null, error: "The reply could not be updated." };
    const touched = new Set<string>([opening.id]);
    let changed = 1;

    // The same words elsewhere, on the same kind of item, follow the team (a person's own reading stays).
    // "Not a reply" never travels: the same words can answer another item.
    if (textKey && !input.notAReply) {
      const { data: same } = await sia().from("joker_replies").select("id, opening_id").eq("text_key", textKey).eq("source", "message").neq("decided_by", "person").not("opening_id", "is", null).neq("id", reply.id).limit(1000);
      const others = (same ?? []) as { id: string; opening_id: string }[];
      const tagOf = new Map<string, JokerTag>();
      for (const part of chunks([...new Set(others.map((x) => x.opening_id))])) {
        const { data: os } = await sia().from("joker_openings").select("id, template_key").in("id", part);
        const byTemplate = (os ?? []) as { id: string; template_key: string }[];
        const { data: ts } = await sia().from("joker_texts").select("template_key, tag").in("template_key", [...new Set(byTemplate.map((x) => x.template_key))]);
        const tags = new Map(((ts ?? []) as { template_key: string; tag: JokerTag | null }[]).map((x) => [x.template_key, x.tag ?? "recommendation"]));
        for (const x of byTemplate) tagOf.set(x.id, (tags.get(x.template_key) ?? "recommendation") as JokerTag);
      }
      const follow = others.filter((x) => tagOf.get(x.opening_id) === tag);
      for (const part of chunks(follow.map((x) => x.id))) {
        const { error: e3 } = await sia().from("joker_replies").update({ stance: input.stance, reason: "the team's reading of the same words" }).in("id", part);
        if (e3) return { data: null, error: "The same words elsewhere could not be updated." };
      }
      for (const x of follow) touched.add(x.opening_id);
      changed += follow.length;
    }

    await recomputeOutcomes([...touched]);
    return { data: { replies_changed: changed, openings_updated: touched.size }, error: null };
  } catch (e) {
    console.error(`${LOG} correction failed`, e instanceof Error ? e.message : e);
    return { data: null, error: "The correction could not be saved." };
  }
}

// ─── The free thanks rule ────────────────────────────────────────────────────

/**
 * An acknowledgement-only conversation ("ok thanks", "🙏"), which the model never reads, answers the
 * joker's newest item when it is the member's first word since it and the team has said nothing
 * else since (a genie's "booked, sir" in between is what the thanks is for). No hour limit: the two
 * checks do the work, and they need the chat back to the item (seenFrom). A greeting alone answers
 * nothing. Warm on a pick, Replied on a wish or check-in, a thumbs-down is a no.
 */
export function thanksReply(items: Opening[], text: string, at: { firstMember: number; seenFrom: number; lastMemberBefore: number | null; lastOther: number | null }): { opening: Opening; stance: JokerStance } | null {
  const newest = items[items.length - 1];
  if (!newest || at.firstMember < newest.sent_at || newest.sent_at < at.seenFrom) return null;
  if (at.lastMemberBefore !== null && at.lastMemberBefore >= newest.sent_at) return null;
  if (at.lastOther !== null && at.lastOther > newest.sent_at + JOKER_THANKS_TEAM_GAP_MINUTES * MIN) return null;
  const answers = /\p{Extended_Pictographic}/u.test(text) || text.toLowerCase().split(/[^\p{L}]+/u).some((w) => JOKER_THANKS_WORDS.has(w));
  if (!answers) return null;
  const no = [...JOKER_NEGATIVE_EMOJI].some((e) => bareEmoji(text).includes(e));
  return { opening: newest, stance: no ? "not_interested" : newest.tag === "engagement" ? "none" : "interested" };
}
