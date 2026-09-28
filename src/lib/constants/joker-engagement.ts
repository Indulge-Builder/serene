// constants/joker-engagement.ts — THE vocabulary and numbers of the Jokers' "Recommendations &
// Engagement" module (migration 0248; step 1 = capture). Pure data: the rules live in
// services/joker-capture-rules.ts, the sweep and the label prompt in services/joker-capture.ts.
//
// What it tracks (owner, 2026-09-23/24): every OPENING a joker makes in a linked client
// WhatsApp group, never her follow-ups. One system, two tags: an opening is either a
// Recommendation or an Engagement (a wish, a check-in, an intro), decided by the joker's first
// message and never changed afterwards.

import { defineEnum } from "@/lib/constants/define-enum";

/** The elaya_settings row that switches the capture job on. Seeded false. */
export const JOKER_CAPTURE_SETTING_KEY = "joker_capture_enabled";

/** Bump on ANY change to the rules: every decision records it, so a re-run is comparable. */
export const JOKER_RULE_VERSION = "joker-rules-v1";
/** Bump on ANY change to the label prompt or its answer shape. */
/**
 * v2 (2026-09-28): the label call sees the recent titles its words touch and may say the message repeats one (same_as).
 * v3 (2026-09-28): the jokers' own categories, from their sheet (experience, event, restaurant, retail, travel, news_info).
 */
export const JOKER_PROMPT_VERSION = "joker-label-v3";
/** sia.extraction_runs.kind for a label call. */
export const JOKER_RUN_KIND = "joker_label";

// The Jokers are found by their Serene accounts (2026-09-28): whoever holds a joker or joker_head
// seat (JOKER_SEATS in constants/sia-roles.ts), through the WhatsApp ids sia-staff-link linked to
// that account by phone. There is no phone list in code (the testing roster is gone).

/** What an opening is. `recommendation` makes it a Recommendation; every other kind is an Engagement. */
const KIND_DEF = defineEnum([
  { id: "recommendation", label: "Recommendation" },
  { id: "wish", label: "Wish" },
  { id: "check_in", label: "Check-in" },
  { id: "intro", label: "Intro" },
  { id: "other", label: "Other" },
] as const);
export const JOKER_OPENING_KINDS = KIND_DEF.values;
export const JOKER_OPENING_KIND_LABELS = KIND_DEF.labels;
export type JokerOpeningKind = (typeof KIND_DEF.values)[number];

const TAG_DEF = defineEnum([
  { id: "recommendation", label: "Recommendation" },
  { id: "engagement", label: "Engagement" },
] as const);
export const JOKER_TAGS = TAG_DEF.values;
export const JOKER_TAG_LABELS = TAG_DEF.labels;
export type JokerTag = (typeof TAG_DEF.values)[number];

/** The tag a kind carries. The SQL generated column (0248) says the same thing. */
export const tagForKind = (kind: JokerOpeningKind): JokerTag => (kind === "recommendation" ? "recommendation" : "engagement");

/**
 * The categories of a Recommendation: the jokers' own, from the "Type" column of their sheet (owner,
 * 2026-09-28: "take the categories from Lilian's sheet, not from Freshdesk"). Her "Text Message" rows
 * are Engagements (wishes, check-ins), not a category, and her "Call" rows happen off WhatsApp.
 * The SQL CHECK in 0248 mirrors it; a new category is one entry here plus a CHECK migration.
 */
const CATEGORY_DEF = defineEnum([
  { id: "experience", label: "Experience" },
  { id: "event", label: "Event" },
  { id: "restaurant", label: "Restaurant" },
  { id: "retail", label: "Retail" },
  { id: "travel", label: "Travel" },
  { id: "news_info", label: "News/Info" },
] as const);
export const JOKER_CATEGORIES = CATEGORY_DEF.values;
export const JOKER_CATEGORY_LABELS = CATEGORY_DEF.labels;
export type JokerCategory = (typeof CATEGORY_DEF.values)[number];

/** What the job decided about one joker message (sia.joker_messages.decision). */
export const JOKER_DECISIONS = ["opening", "piece", "follow_up", "undecided", "unlinked"] as const;
export type JokerDecision = (typeof JOKER_DECISIONS)[number];

// ─── The job ─────────────────────────────────────────────────────────────────

/** How often the cloud task runs (owner, 2026-09-24). */
export const JOKER_CAPTURE_CRON = "*/3 * * * *";
/** A message is decided only once it is this old, so its album photos and its next piece have landed. */
export const JOKER_SETTLE_SECONDS = 180;
/** How far back each run looks for joker messages not decided yet (a late delivery still lands). */
export const JOKER_LOOKBACK_HOURS = 48;
/** The chat before a joker message that the rules look at. */
export const JOKER_CONTEXT_HOURS = 12;
export const JOKER_CONTEXT_MESSAGES = 40;
/** Label calls per run: new texts first, then messages the rules could not settle. */
export const JOKER_LABELS_PER_RUN = 12;
export const JOKER_RUN_BUDGET_MS = 100_000;
/** A message the model could not read this many times stays `undecided` and is no longer offered. */
export const JOKER_MAX_ATTEMPTS = 3;
/** Stop a run after this many failed calls in a row: the provider is down, not the message. */
export const JOKER_OUTAGE_STOP = 3;

// ─── The rules' numbers (measured on 30 days of real chat, 2026-09-23) ──────────

/** Her next message within this long, with nobody else speaking in between, is a piece of the same send. */
export const JOKER_PIECE_SECONDS = 180;
/** The same text again in the same chat within this long is a duplicate, not a new opening. */
export const JOKER_DUPLICATE_MINUTES = 10;
/** The same text re-sent to the same chat within this long is a reminder of the first send. */
export const JOKER_REPEAT_DAYS = 7;
/** A text sent to at least this many chats within a day is a broadcast: always an opening. */
export const JOKER_BROADCAST_MIN_CHATS = 3;
export const JOKER_BROADCAST_WINDOW_HOURS = 24;
/** A client message this recent means a conversation is live. */
export const JOKER_LIVE_CLIENT_MINUTES = 60;
/** A quote of a client message this recent is an answer; older (up to the cap) the model decides; older still is ignored. */
export const JOKER_QUOTE_FRESH_MINUTES = 60;
export const JOKER_QUOTE_MAX_HOURS = 72;
/** Rule D (the recommendation shape): a captioned media message of at least this length… */
export const JOKER_RULE_D_CAPTION_CHARS = 60;
/** …or a text message of at least this length with bold AND a greeting. */
export const JOKER_RULE_D_TEXT_CHARS = 100;
/** Shorter than this and not part of a send = a reply, a thanks, a link. */
export const JOKER_MIN_TEXT_CHARS = 25;
/** The template key: the normalised text's first this-many letters and digits. */
export const JOKER_TEMPLATE_KEY_CHARS = 140;
/** One message's text is cut at this length in a model call. */
export const JOKER_MESSAGE_CHAR_CAP = 1_500;

/** Haiku 4.5 list price, USD per million tokens, for the run ledger's cost column. */
export const JOKER_COST_PER_MTOK = { input: 1, output: 5 } as const;

// ─── Step 2: threads and replies (migration 0249) ────────────────────────────

/**
 * An opening's outcome (owner, 2026-09-24): it starts Not replied and moves when the member
 * answers: Interested, Undecided (a reply that is neither a yes nor a clear no: "I'll be in Delhi
 * then", "it's expensive", "let's see") or Not interested (only a clear no). There is no
 * "waiting". Replied is only for a wish, check-in or intro that offered nothing.
 */
const REPLY_STATUS_DEF = defineEnum([
  { id: "not_replied", label: "Not replied" },
  { id: "interested", label: "Interested" },
  { id: "undecided", label: "Undecided" },
  { id: "not_interested", label: "Not interested" },
  { id: "replied", label: "Replied" },
] as const);
export const JOKER_REPLY_STATUSES = REPLY_STATUS_DEF.values;
export const JOKER_REPLY_STATUS_LABELS = REPLY_STATUS_DEF.labels;
export type JokerReplyStatus = (typeof REPLY_STATUS_DEF.values)[number];

/**
 * How a member's reply was tied (2026-09-26): a swipe-reply (quote) or an emoji is certain; a
 * conversation of typed words is read by the model (typed); an acknowledgement right after an item
 * is the free thanks rule (thanks); none = read, answers no item.
 */
export type JokerReplyTier = "quote" | "reaction" | "typed" | "thanks" | "none";
export type JokerStance = "interested" | "undecided" | "not_interested" | "none";

/** v3 (2026-09-26): typed words are read per conversation with no hour rule; the thanks rule. */
export const JOKER_REPLY_RULE_VERSION = "joker-replies-v3";
/**
 * v4 (owner, 2026-09-24): three readings of a reply. Only a clear no ("no thanks", "pass",
 * "skip it") is Not interested; a reply that neither says yes nor no ("I'll be in Delhi then",
 * "it's expensive", "already have one", "let's see") is Undecided; everything else is Interested.
 * v5 (owner, 2026-09-26): the member's NEW messages in one conversation are read together, days or
 * weeks after the item; a yes that also asks the team to book it still answers the item.
 */
export const JOKER_REPLY_PROMPT_VERSION = "joker-reply-v5";
export const JOKER_REPLY_RUN_KIND = "joker_reply";

/** Model calls per run for reading replies. */
export const JOKER_REPLIES_PER_RUN = 20;
/**
 * An item can still be answered this long after it was sent (owner, 2026-09-25: "sometimes clients
 * reply after 2 weeks"). Every conversation of a member's typed words inside it is read (no hour rule).
 */
export const JOKER_REPLY_WINDOW_DAYS = 30;
/**
 * What a conversation is shown (owner's idea, 2026-09-26: read every message the moment the member
 * goes quiet, like the ticket watcher does, but in its own read so tickets are never touched): the
 * joker's latest items in the chat, plus older ones the member's words name.
 */
export const JOKER_ITEMS_LATEST = 5;
export const JOKER_ITEMS_NAMED = 3;

/** A reply this short or shorter keeps its words (normalised) so a team correction can find the same words again. */
export const JOKER_TEXT_KEY_MAX_CHARS = 80;
/**
 * The free thanks rule: an acknowledgement-only conversation (which the model never reads) answers
 * the joker's newest item when it is the member's first word since it and the team's last word
 * before it came within this long of the item (its pieces, not a genie's news). No hour limit.
 */
export const JOKER_THANKS_TEAM_GAP_MINUTES = 10;
/**
 * The words that make an acknowledgement an ANSWER (or any emoji). The watcher's own list also holds
 * greetings; "Good morning" after a pick answers nothing, so a greeting alone never ties.
 */
export const JOKER_THANKS_WORDS: ReadonlySet<string> = new Set([
  "ok", "okay", "okk", "k", "kk", "thanks", "thank", "thankyou", "thx", "ty", "tysm", "great", "perfect", "noted",
  "cool", "nice", "super", "awesome", "lovely", "received", "done", "sure", "fine", "alright",
]);

/** The team's most recent corrections shown to the model as examples, per tag. */
export const JOKER_CORRECTION_EXAMPLES = 20;
/**
 * How far before the sweep's window the chat is loaded: the conversation a reply sits in, the lines
 * before it, and the thanks rule's proof that nobody spoke between the item and the thanks.
 */
export const JOKER_REPLY_CONTEXT_HOURS = 72;
/** A joker's unquoted follow-up continues the last thread in the chat when that thread spoke within this long. */
export const JOKER_THREAD_GAP_HOURS = 24;

/**
 * The words of a clear no (owner, 2026-09-24: only a clear no is Not interested). The model's
 * "not interested" stands only when the member's words hold one of these; a reason without them
 * ("won't be in India then", "she already has one") is Undecided. English and Hinglish.
 */
export const JOKER_CLEAR_NO = /(?<![\p{L}])(?:no|nope|nop|nah|pass|skip|cancel|ignore|not interested|not for me|not required|no need|not possible|not really|don'?t want|do not want|let it be|rehne do|nahi|nahin|mat karo)(?![\p{L}])/iu;

/** Emoji read without a model. Anything else on a Recommendation counts as warm (Interested). */
export const JOKER_NEGATIVE_EMOJI: ReadonlySet<string> = new Set(["👎", "😕", "🙁", "☹", "😒", "🙅", "❌", "😞", "😔", "🤮", "😤"]);

/** Words too common to say which item a message is about ("the event", "dinner in Mumbai"). */
/**
 * One item, one title (owner, 2026-09-28: the same recommendation must never get two titles). A new
 * recommendation reuses the title of an item sent in the last JOKER_TITLE_REUSE_DAYS when it names the
 * same thing: by the words (sameItemTitle in joker-capture-rules.ts), or by the label call, which sees
 * up to JOKER_TITLE_SHORTLIST recent titles that share a distinctive word with the message.
 */
export const JOKER_TITLE_REUSE_DAYS = 45;
export const JOKER_TITLE_SHORTLIST = 10;
/** Words that carry no meaning in a title ("the", "we've got"). */
export const JOKER_TITLE_STOPWORDS: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "from", "our", "your", "you", "are", "has", "have", "now", "just", "its", "this", "that",
  "weve", "got", "new", "all", "only", "worlds", "world", "one", "out", "into", "who", "what",
]);
/** Words that name a kind of thing, never one thing: two titles never become one item on these alone. */
export const JOKER_TITLE_GENERIC_WORDS: ReadonlySet<string> = new Set([
  "restaurant", "restaurants", "michelin", "starred", "cafe", "cafes", "bar", "dinner", "lunch", "brunch", "breakfast", "menu", "chef",
  "event", "events", "party", "show", "concert", "festival", "tickets", "ticket", "experience", "experiences", "trip", "tour", "stay",
  "hotel", "villa", "spa", "wellness", "class", "session", "watch", "watches", "bag", "bags", "shoes", "sneakers", "collection",
  "edition", "limited", "launch", "available", "pre-order", "preorder", "order", "exclusive", "private", "luxury", "premium",
  "gift", "gifts", "hamper", "cake", "flowers", "birthday", "anniversary", "offer", "deal", "sale", "access", "entry", "booking",
  "live", "music", "night", "weekend", "india", "mumbai", "delhi", "bangalore", "bengaluru", "goa", "london", "dubai", "paris",
]);
export const JOKER_NAMED_STOPWORDS: ReadonlySet<string> = new Set([
  "about", "after", "again", "birthday", "check", "details", "dinner", "event", "events", "experience", "experiences",
  "gifting", "great", "happy", "india", "lunch", "mumbai", "delhi", "bangalore", "london", "dubai", "night", "party",
  "please", "share", "something", "special", "their", "there", "these", "thing", "things", "those", "today", "tomorrow",
  "weekend", "which", "while", "would", "wish", "check-in", "intro", "untitled", "recommendation", "greeting", "festival",
]);

// ─── Activity (0250): how much the client's side talks in their groups ────────
// One linked member group is one client entry. Active = a client message or reaction in the last
// CLIENT_ACTIVITY_SILENT_DAYS days; Silent = none (owner, 2026-09-28: two states, never a third).

/** The Jokers page and its two dashboards. */
export const JOKERS_PATH = "/jokers";
export const JOKERS_RE_PATH = "/jokers/recommendations";
export const JOKERS_ACTIVITY_PATH = "/jokers/activity";
/** No word from the client's side for this many days = Silent. */
export const CLIENT_ACTIVITY_SILENT_DAYS = 14;
/** How many days of daily counts the dashboard loads (the longest period it offers, and "how long silent"). */
export const CLIENT_ACTIVITY_LOAD_DAYS = 90;
/** The recount job (owner, 2026-09-28: every 5 minutes): today and yesterday each run, the last N days each night at 04:00 IST. */
export const CLIENT_ACTIVITY_CRON = "*/5 * * * *";
export const CLIENT_ACTIVITY_NIGHTLY_DAYS = 30;
/** The elaya_settings row that stops the recount; ON unless it is false (counting only, no model). */
export const CLIENT_ACTIVITY_SETTING_KEY = "client_activity_enabled";

// ─── The one-time back-fill (going live) ─────────────────────────────────────

/**
 * The back-fill task (src/trigger/jokers-backfill.ts), started by hand once after go-live so both
 * dashboards show the past weeks on the first day. `activity` recounts CLIENT_ACTIVITY_LOAD_DAYS
 * (free); `capture` records and reads the Jokers' last JOKER_BACKFILL_DAYS (AI calls), in chunks,
 * and stops at the spend cap or the time budget; a second start carries on where it stopped.
 */
export const JOKER_BACKFILL_DAYS = 30;
/** The most one capture back-fill may spend, in USD, unless its payload says otherwise. */
export const JOKER_BACKFILL_MAX_USD = 20;
/** One chunk: this many label calls, then this many reply readings, saved before the next chunk. */
export const JOKER_BACKFILL_CHUNK_LABELS = 150;
export const JOKER_BACKFILL_CHUNK_READINGS = 250;
/** The task's time budget; the chunk under way finishes, no new one starts after it. */
export const JOKER_BACKFILL_MAX_MINUTES = 50;
/** The Period choices on both Jokers dashboards (owner, 2026-09-28): Today … This month, plus Custom (the Dates panel). */
export const JOKER_PERIOD_PRESETS = ["today", "yesterday", "last_7_days", "last_14_days", "last_30_days", "this_month"] as const;
export const JOKER_DEFAULT_PERIOD = "last_7_days" as const;
