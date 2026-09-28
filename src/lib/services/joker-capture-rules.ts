// joker-capture-rules.ts — THE rules that decide whether a joker's message OPENS something
// (a Recommendation or an Engagement) or only continues one (migration 0248, step 1).
//
// Pure: no database, no model. The sweep (joker-capture.ts) gathers the facts about a message
// (the chat before it, who each sender is, how many chats got the same text) and asks here.
// Every verdict carries a reason, so a wrong one can be traced to the rule that made it.
//
// The rules were measured on 30 days of real chat (2026-09-23: about 99% right on hand-read
// samples, 98% of Lilian's logged items kept) and then bent to the owner's decisions of
// 2026-09-24:
//   * a joker continuing a conversation SHE started is a follow-up, even when she offers
//     something new in it (a birthday wish, then "shall we send a cake?" = one Engagement);
//   * a pick prompted by something the client said on their own is a NEW Recommendation;
//   * during onboarding only the "I'm your Joker" intro counts.
// Telling those two apart needs reading, so a pick inside a live conversation goes to the model.

import { createHash } from "crypto";
import {
  JOKER_BROADCAST_MIN_CHATS, JOKER_DUPLICATE_MINUTES, JOKER_LIVE_CLIENT_MINUTES, JOKER_MIN_TEXT_CHARS,
  JOKER_PIECE_SECONDS, JOKER_QUOTE_FRESH_MINUTES, JOKER_QUOTE_MAX_HOURS, JOKER_RULE_D_CAPTION_CHARS,
  JOKER_RULE_D_TEXT_CHARS, JOKER_TEMPLATE_KEY_CHARS, JOKER_TITLE_GENERIC_WORDS, JOKER_TITLE_STOPWORDS,
} from "@/lib/constants/joker-engagement";

// ─── Words ───────────────────────────────────────────────────────────────────

const GREETING = /^\s*(?:hey+|hi+|hello|helo|dear|namaste|good\s+(?:morning|afternoon|evening))\b/i;
const BOLD = /\*[^*\n]{2,}\*/;
// WhatsApp formatting (*bold*, _italic_) can sit inside the phrase: "I'm *the Joker at Indulge*".
const INTRO = /\b(?:i['’]?m|i am)[\s*_]+(?:the[\s*_]+|your[\s*_]+)?joker\b|\bi['’]?ll be your[\s*_]+joker\b|\byour[\s*_]+(?:new[\s*_]+|dedicated[\s*_]+)?joker\b/i;
const WISH = /\b(?:happy|happiest|wishing|many happy returns|congratulations|congrats|birthday|anniversary|diwali|ganpati|ganesh|navratri|dussehra|durga puja|eid|christmas|new year|janmashtami|raksha ?bandhan|rakhi|holi|onam|pongal|shubh)\b/i;
const CHECK_IN = /\b(?:how (?:are|was|is|did|have)|hope (?:you|all|the|your|this)|how['’]?s (?:the|your|it)|checking in|just checking|trust (?:you|all|the)|hope you['’]?re)\b/i;
/** Onboarding and call logistics: only the intro itself opens anything (owner, 2026-09-24). */
const ONBOARDING = /\b(?:introductory call|intro call|call link|meet\.google|zoom\.us|teams\.microsoft|ready when you are|looking forward to (?:our|the) call|thank you for (?:your time|the call|taking the time)|(?:on|join|ended|for) the call|(?:schedule|set up|book) (?:the|a|our) call|download the (?:indulge )?app|persona form|master profile|app link|play\.google|apps\.apple)\b/i;
/** A chase on something already sent, or the logistics once a member said yes: follow-ups. */
const CHASE = /\b(?:kindly confirm|please confirm|gentle reminder|just a reminder|circling back|tried calling|tried reaching|as discussed|here are the details|did you get a chance|following up on|awaiting your|kindly (?:fill|share|let us know)|how many (?:tickets|people|guests|pax)|preferred (?:time|date|slot)|time slot|appointment slot|booking (?:is )?confirmed|here is your|we have initiated|allow us (?:some )?time|give me until|reconfirming)\b/i;
/** Maybe arranging a call or a time: the model decides. */
const WEAK_CALL = /\b(?:what time works|reschedule|hop on a (?:quick )?call|quick call|a call (?:today|tomorrow))\b/i;
/** An offer made in reply to something the member said: a new pick, unless it answers their request. */
const OFFER = /\b(?:should we|shall we|would you like|would you want|want me to|want us to|how about we|(?:can|could) we (?:send|arrange|book|get|organise|organize)|we can (?:send|arrange|book|get)|let us (?:send|arrange|book))\b/i;

// ─── Text ────────────────────────────────────────────────────────────────────

const MEDIA_TYPES = new Set(["image", "video", "document", "album"]);

/**
 * The text without its personal greeting: a short first line that is only a greeting ("Hey R,")
 * goes; a first line that starts with one ("Hey R, found this…") loses the greeting phrase. The
 * rest is what a broadcast has in common across every group, and what a model is shown.
 */
export function stripGreeting(text: string): string {
  const t = text.trim();
  const nl = t.indexOf("\n");
  const first = nl === -1 ? t : t.slice(0, nl);
  if (!GREETING.test(first)) return t;
  if (first.length <= 60 && nl !== -1) return t.slice(nl + 1).trim();
  // "Hey R, found this…": drop the greeting phrase up to its comma or exclamation mark (a title's
  // full stop, "Mr. Shah", is not the end of a greeting); failing those, a full stop or a dash.
  const head = first.slice(0, 60);
  let cut = head.search(/[,!]/);
  if (cut === -1) cut = head.search(/(?<!\b(?:mr|mrs|ms|dr))[.–—-]\s/i);
  const rest = cut === -1 ? first.replace(GREETING, "") : first.slice(cut + 1);
  return (rest.trim() + (nl === -1 ? "" : `\n${t.slice(nl + 1)}`)).trim();
}

/** Letters and digits only, lower case, greeting and @mentions removed, first N characters. */
export function normaliseForKey(text: string): string {
  return stripGreeting(text).replace(/@\d{6,}/g, " ").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, JOKER_TEMPLATE_KEY_CHARS);
}

/** THE template key: one per distinct text. A broadcast to 400 groups shares one key. Empty text = "". */
export function templateKey(text: string | null | undefined): string {
  const norm = normaliseForKey(text ?? "");
  return norm ? createHash("sha256").update(norm).digest("hex").slice(0, 32) : "";
}

/** The *bold* phrases of a WhatsApp text, in order, asterisks removed. The title is picked from these. */
export function boldPhrases(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\*([^*\n]{2,80})\*/g)) {
    const p = m[1].replace(/\s+/g, " ").trim();
    if (p && !out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
  }
  return out;
}

/** Rule D, the shape of a recommendation: a long caption with bold or a greeting, or a long text with both. */
export function isRuleD(type: string, text: string): boolean {
  const t = text.trim();
  if (MEDIA_TYPES.has(type)) return t.length >= JOKER_RULE_D_CAPTION_CHARS && (BOLD.test(t) || GREETING.test(t));
  return t.length >= JOKER_RULE_D_TEXT_CHARS && BOLD.test(t) && GREETING.test(t);
}

// ─── The decision ────────────────────────────────────────────────────────────

export type Side = "joker" | "staff" | "client";

/** A message in the chat before the one being decided, oldest first. */
export type PriorMsg = { wa_message_id: string; side: Side; joker_phone: string | null; at: number; template_key: string };

export type UnitFacts = {
  wa_message_id: string;
  joker_phone: string;
  type: string;
  /** The caption for media, the body for text; an album's is its first captioned photo's. */
  text: string;
  at: number;
  template_key: string;
  /** Chats the jokers sent this same text to within a day (1 = only this one). */
  reach: number;
  /** What it quotes, if the quoted message is known. `at` is null when the mirror never saw it. */
  quoted: { wa_message_id: string; side: Side; at: number | null } | null;
  mentions_staff: boolean;
  /** The chat before it (the last hours), oldest first. */
  prior: PriorMsg[];
  /** An earlier send of the same text to this chat within the repeat window, if any (a reminder). */
  earlier_same_text: { wa_message_id: string; at: number } | null;
};

export type RuleVerdict =
  | { decision: "opening"; reason: string }
  | { decision: "follow_up"; reason: string }
  | { decision: "piece"; reason: string; piece_of: string }
  | { decision: "undecided"; reason: string };

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Decide one joker message. Order matters: the first rule that fires wins. */
export function decideJokerMessage(u: UnitFacts): RuleVerdict {
  const text = u.text.trim();
  const ruleD = isRuleD(u.type, text);
  const greeting = GREETING.test(text);

  // Her previous message in this chat, and whether anyone else spoke since.
  let ownPrevIdx = -1;
  for (let i = u.prior.length - 1; i >= 0; i--) if (u.prior[i].joker_phone === u.joker_phone) { ownPrevIdx = i; break; }
  const ownPrev = ownPrevIdx >= 0 ? u.prior[ownPrevIdx] : null;
  const othersSince = ownPrevIdx >= 0 ? u.prior.slice(ownPrevIdx + 1).length : 0;

  // 1. The same text again within minutes: a duplicate of that send.
  if (ownPrev && u.template_key && ownPrev.template_key === u.template_key && u.at - ownPrev.at <= JOKER_DUPLICATE_MINUTES * MIN) {
    return { decision: "piece", reason: "the same text again within minutes", piece_of: ownPrev.wa_message_id };
  }
  // 2. Part of the same send: her previous message moments ago and nobody else spoke. A second,
  //    different pick sent right after the first is its own send.
  if (ownPrev && othersSince === 0 && u.at - ownPrev.at <= JOKER_PIECE_SECONDS * 1000 && !(ruleD && u.template_key !== ownPrev.template_key)) {
    return { decision: "piece", reason: "part of the same send", piece_of: ownPrev.wa_message_id };
  }
  // 3. The same text re-sent to this chat days later: a reminder of the first send.
  if (u.earlier_same_text) return { decision: "piece", reason: "a repeat of an earlier send", piece_of: u.earlier_same_text.wa_message_id };

  // 4. Replying to the team, or talking to the team.
  if (u.quoted && (u.quoted.side === "staff" || u.quoted.side === "joker")) return { decision: "follow_up", reason: "quotes a team message" };
  if (u.mentions_staff) return { decision: "follow_up", reason: "addressed to the team" };

  // 5. Logistics and chases, before anything else can call them an opening: a chase sent to
  //    forty groups is still a chase ("Kindly confirm, we submit the list today").
  if (ONBOARDING.test(text) && !INTRO.test(text)) return { decision: "follow_up", reason: "call or onboarding logistics" };
  if (CHASE.test(text) && !ruleD) return { decision: "follow_up", reason: "a chase or logistics" };

  // 6. Quoting the client.
  if (u.quoted && u.quoted.side === "client") {
    if (u.quoted.at === null) return { decision: "undecided", reason: "quotes a client message the mirror never saw" };
    const age = u.at - u.quoted.at;
    if (age <= JOKER_QUOTE_FRESH_MINUTES * MIN) {
      // An answer to the client, unless it offers something their words prompted (owner rule 5).
      return ruleD || OFFER.test(text) ? { decision: "undecided", reason: "an offer quoting the client" } : { decision: "follow_up", reason: "answers the client" };
    }
    if (age <= JOKER_QUOTE_MAX_HOURS * HOUR) return { decision: "undecided", reason: "quotes an older client message" };
    // Older than that: the quote is only a pointer; decide on the message itself.
  }

  // 7. Too short to open anything (a thanks, a link, a photo with no caption).
  if (text.length < JOKER_MIN_TEXT_CHARS) return { decision: "follow_up", reason: "too short to open anything" };

  // 8. A broadcast is always an opening: nobody follows up with the same text in many groups.
  if (u.template_key && u.reach >= JOKER_BROADCAST_MIN_CHATS) return { decision: "opening", reason: `a broadcast to ${u.reach} chats` };

  // 9. Inside a live conversation.
  const lastClient = [...u.prior].reverse().find((p) => p.side === "client") ?? null;
  const clientMin = lastClient ? (u.at - lastClient.at) / MIN : Infinity;
  const last = u.prior[u.prior.length - 1] ?? null;
  const clientSpokeLast = !!last && last.side === "client" && clientMin <= 15;
  const clientAfterHer = !!ownPrev && !!lastClient && lastClient.at > ownPrev.at && u.at - ownPrev.at <= 6 * HOUR && clientMin <= JOKER_LIVE_CLIENT_MINUTES;
  const herLiveThread = !!ownPrev && u.at - ownPrev.at <= 30 * MIN && clientMin <= JOKER_LIVE_CLIENT_MINUTES;
  if (clientSpokeLast || clientAfterHer || herLiveThread) {
    // Continuing her own conversation is a follow-up; a pick prompted by the client's own words is
    // a new opening. Which one it is needs reading.
    if (ruleD || OFFER.test(text) || (greeting && WISH.test(text))) return { decision: "undecided", reason: "a pick inside a live conversation" };
    return { decision: "follow_up", reason: "inside a live conversation" };
  }

  // 10. The shapes of an opening.
  if (ruleD) return { decision: "opening", reason: "the shape of a recommendation" };
  if (INTRO.test(text)) return { decision: "opening", reason: "the joker's intro" };
  if (WISH.test(text) && text.length >= 40) return { decision: "opening", reason: "a wish" };
  if (greeting && CHECK_IN.test(text) && text.length >= 30) return { decision: "opening", reason: "a check-in" };
  if (greeting && text.length >= 60 && (!ownPrev || u.at - ownPrev.at >= 12 * HOUR) && clientMin >= JOKER_LIVE_CLIENT_MINUTES) {
    return { decision: "opening", reason: "a greeting after a quiet spell" };
  }

  // 12. What the rules cannot settle goes to the model; the rest is a follow-up.
  if (WEAK_CALL.test(text)) return { decision: "undecided", reason: "maybe arranging a call" };
  if (text.length >= 60) return { decision: "undecided", reason: "a longer message the rules cannot settle" };
  return { decision: "follow_up", reason: "no sign of an opening" };
}

// ─── One item, one title (owner, 2026-09-28) ─────────────────────────────────

/** A title as it is stored: no stars, underscores or stray punctuation at the ends, single spaces. */
export function cleanTitle(t: string): string {
  return t.replace(/[*_~]+/g, "").replace(/\s+/g, " ").replace(/^[\s,.;:!?'’"“”(\-–—]+|[\s,.;:!?'’"“”(\-–—]+$/g, "").trim();
}

/** A title's comparable form: lower case, no accents, apostrophes or punctuation, single spaces. */
export function titleKey(t: string): string {
  return t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const titleWords = (t: string): string[] => [...new Set(titleKey(t).split(" ").filter((w) => w.length >= 3 && !JOKER_TITLE_STOPWORDS.has(w)))];
const numbersOf = (ws: string[]): string => ws.filter((w) => /\d/.test(w)).sort().join(" ");
/** The words that name one thing (a brand, a place, a product), not a kind of thing. */
const distinctive = (ws: string[]): string[] => ws.filter((w) => !JOKER_TITLE_GENERIC_WORDS.has(w) && (w.length >= 5 || /\d/.test(w)));

/**
 * THE one-item-one-title rule, by the words alone. Returns the existing title the candidate names the
 * same item as, or null. `existing` is most recent first, so a repeat joins the item's latest title.
 *   - the same comparable form: "SILQ," is "SILQ", "the Boss Tote" is "The Boss Tote";
 *   - every word of the shorter (two or more, or one with a number) inside the longer, when the shorter still names a thing: "iPhone Duo"
 *     is "iPhone Duo available for pre-order at Indian Retail price", "Golden Temple" is "Golden
 *     Temple oil painting by artist Chetan";
 *   - nearly the same words (three in four), as when a long title was reworded.
 * Never on generic words alone ("Michelin-starred restaurant" names no one place) and never when the
 * two carry different numbers or dates ("8th September" is not "16th September"). Anything subtler
 * is the label call's to say (same_as): it sees the message itself.
 */
export function sameItemTitle(candidate: string, existing: readonly string[]): string | null {
  const key = titleKey(candidate);
  if (!key) return null;
  const exact = existing.find((e) => titleKey(e) === key);
  if (exact) return exact;
  const cw = titleWords(candidate);
  if (!cw.length) return null;
  for (const e of existing) {
    const ew = titleWords(e);
    if (!ew.length) continue;
    const cn = numbersOf(cw), en = numbersOf(ew);
    if (cn && en && cn !== en) continue;
    const [small, big] = cw.length <= ew.length ? [cw, new Set(ew)] : [ew, new Set(cw)];
    const shared = small.filter((w) => big.has(w));
    // One word alone names a thing only when it carries a number ("T201"); "The Theater" could be any theatre.
    if (shared.length === small.length && distinctive(small).length >= 1 && (small.length >= 2 || /\d/.test(small[0]))) return e;
    const union = new Set([...cw, ...ew]).size;
    if (shared.length / union >= 0.75 && distinctive(shared).length >= 1) return e;
  }
  return null;
}

/** The recent titles a message could be repeating: those sharing a distinctive word with it, best first. */
export function titleShortlist(text: string, recent: readonly string[], max: number): string[] {
  const words = new Set(titleWords(text));
  return recent.map((t, i) => ({ t, i, hit: distinctive(titleWords(t)).filter((w) => words.has(w)).length }))
    .filter((x) => x.hit > 0).sort((a, b) => b.hit - a.hit || a.i - b.i).slice(0, max).map((x) => x.t);
}
