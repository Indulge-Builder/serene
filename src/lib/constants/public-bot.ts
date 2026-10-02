// THE public bot vocabulary (0252, docs/architecture/indulge-bot-plan.md).
//
// The numbers every part of the public bot reads: the settings keys, the ceilings, the settle
// time, the opt-out words, the hand-over reasons, the lines she says when she cannot answer, the
// guard words, and the price table the ledger costs a turn with. The SQL CHECKs in 0252 mirror
// the outcome and state lists.

export const PUBLIC_BOT_SETTING_KEYS = {
  enabled: 'public_bot_enabled',
  dailyCapUsd: 'public_bot_daily_cap_usd',
  testPhones: 'public_bot_test_phones',
} as const;

/** Used when the cap row is missing or malformed. */
export const PUBLIC_BOT_DAILY_CAP_USD_DEFAULT = 5;

/** The ceilings (plan section 11). Per phone: what reaches the model, counted in Upstash Redis. */
export const PUBLIC_BOT_LIMITS = {
  perPhonePerHour: 20,
  perPhonePerDay: 60,
  /** Wait this long after an inbound message; a newer one in the meantime takes over the turn. */
  settleMs: 5_000,
  /** The per-conversation lock, so two turns never run at once. */
  lockSeconds: 90,
  /** How long a turn waits for another turn's lock before giving up (the later turn answers). */
  lockWaitMs: 30_000,
  /** Characters of one inbound message the model sees. */
  maxInboundChars: 2_000,
  /** The longest reply sent as one WhatsApp message. */
  maxReplyChars: 1_500,
  /** Messages of the conversation the model sees (both directions). */
  historyMessages: 24,
  /** Library items sent in one turn, and the gap between sends so they arrive in order. */
  maxSendsPerTurn: 2,
  sendGapMs: 2_000,
  /** Model calls in one turn (tool round trips). */
  maxModelCalls: 4,
  /** One model call's wall clock. */
  callTimeoutMs: 25_000,
} as const;

/** Whole-message opt-outs (lowercased, trimmed, punctuation stripped). */
export const PUBLIC_BOT_OPT_OUT_WORDS = [
  'stop', 'unsubscribe', 'opt out', 'optout', 'stop messaging', 'stop messages',
  'band karo', 'bandh karo', 'mat bhejo', 'message mat karo', 'बंद करो', 'मत भेजो',
] as const;

export const PUBLIC_BOT_STATES = ['active', 'handed_over', 'opted_out'] as const;
export type PublicBotState = (typeof PUBLIC_BOT_STATES)[number];

export const PUBLIC_BOT_TURN_OUTCOMES = ['replied', 'handed_over', 'blocked', 'capped', 'opted_out', 'error'] as const;
export type PublicBotTurnOutcome = (typeof PUBLIC_BOT_TURN_OUTCOMES)[number];

/** Why a conversation went to a person. The model picks from these; code adds the last four. */
export const HANDOVER_REASONS = {
  call_requested: 'Asked for a call',
  wants_to_buy: 'Ready to buy',
  beyond_pack: 'Asked something she does not know',
  money_question: 'A money question for the team',
  complaint: 'Unhappy or a complaint',
  payment: 'About a payment',
  press_or_partner: 'Press or partnership',
  vendor: 'A supplier or vendor',
  job: 'Looking for a job',
  unsure: 'She was unsure',
  asked_for_human: 'Asked for a person',
  existing_member: 'Already a member',
  image_without_caption: 'Sent an image',
  capped: 'A limit was reached',
  guard_blocked: 'A reply was held back',
} as const;
export type HandoverReason = keyof typeof HANDOVER_REASONS;

/** The reasons the model may choose (the code-only ones are left out of the tool schema). */
export const MODEL_HANDOVER_REASONS = [
  'call_requested', 'wants_to_buy', 'beyond_pack', 'money_question', 'complaint', 'payment',
  'press_or_partner', 'vendor', 'job', 'unsure', 'asked_for_human',
] as const satisfies readonly HandoverReason[];

/** Press, partnership, vendor and job enquiries: answered politely, no agent alert (plan Decide 5). */
export const HANDOVER_REASONS_WITHOUT_ALERT: readonly HandoverReason[] = ['press_or_partner', 'vendor', 'job'];

/** Which Indulge business a hand-over belongs to. */
export const PUBLIC_BOT_BUSINESSES = ['membership', 'shop', 'legacy', 'house', 'events', 'other'] as const;
export type PublicBotBusiness = (typeof PUBLIC_BOT_BUSINESSES)[number];

/** What she says when she cannot answer herself. Code sends these; the model never writes them. */
export const PUBLIC_BOT_LINES = {
  /** The output guard held a reply back. */
  heldBack: 'Let me have one of the team pick this up for you. They will be in touch with you here shortly.',
  /** A ceiling was reached (per phone, per day). */
  capped: 'Thank you. Someone from the team will reply to you here shortly.',
  /** The model failed or returned nothing. */
  failed: 'Thank you for writing to Indulge. Someone from the team will be with you here shortly.',
  /** After an opt-out. Sent once. */
  optedOut: 'Understood. We will not message you again. If you ever need us, just write here.',
  /** An image or file with no words (often a screenshot of something they want). */
  imageReceived: 'Thank you. I have passed this to the team; someone will look at it and come back to you here.',
  /** An existing member wrote to the public number. */
  existingMember: 'Lovely to hear from you. Your own Indulge team will pick this up in your group shortly.',
} as const;

/** The call window she promises (plan 7a). */
export const PUBLIC_BOT_CALL_WINDOW = 'between 9 am and 7 pm IST, any day of the week';

/**
 * Words her reply may never contain (the output guard, plan section 10). Lowercased, matched as
 * whole words. A hit holds the reply back and hands the chat over.
 */
export const PUBLIC_BOT_FORBIDDEN_WORDS = [
  'serene', 'system prompt', 'my instructions', 'my prompt', 'the prompt', 'tool call',
  'send_material', 'note_interest', 'hand_over', 'knowledge pack', 'anthropic', 'claude',
  'indulge blue',
] as const;

/** Currencies other than the rupee (the reply quotes rupees only). */
export const PUBLIC_BOT_FOREIGN_CURRENCY_RE =
  /(?:[$€£¥]\s?\d)|\b(?:usd|eur|gbp|aed|sgd|chf|jpy)\b|\b\d[\d,.]*\s?(?:dollars?|euros?|dirhams?|pounds sterling)\b/i;

/**
 * Prices per million tokens, by model prefix, for the turn ledger (the anthropic pricing page,
 * 2026-09-25). Cache write is the 5-minute TTL rate. An unknown model is costed at the highest
 * row, so the daily cap errs on the side of stopping early.
 */
export const PUBLIC_BOT_COST_PER_MTOK: { prefix: string; input: number; output: number; cacheRead: number; cacheWrite: number }[] = [
  { prefix: 'claude-haiku-4-5', input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  { prefix: 'claude-sonnet-5-5', input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  { prefix: 'claude-sonnet-5', input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  { prefix: 'claude-sonnet-4-6', input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  { prefix: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
];
const HIGHEST_PRICE = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };

export function priceForModel(model: string): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  return PUBLIC_BOT_COST_PER_MTOK.find((p) => model.startsWith(p.prefix)) ?? HIGHEST_PRICE;
}

/** A turn's cost in US dollars from its token counts. `inputTokens` excludes cache reads/writes. */
export function costForTokens(
  model: string,
  t: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
): number {
  const p = priceForModel(model);
  const usd =
    (t.inputTokens * p.input + t.outputTokens * p.output + t.cacheReadTokens * p.cacheRead + t.cacheWriteTokens * p.cacheWrite) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** The env vars of the bot's own model key and its hand-over alert template. */
export const PUBLIC_BOT_ENV = {
  apiKey: 'ANTHROPIC_PUBLIC_BOT_API_KEY',
  handoverTemplateId: 'GUPSHUP_HANDOVER_TEMPLATE_ID',
} as const;

/** The Redis keys (one home, so a key is never typed twice). */
export const PUBLIC_BOT_REDIS = {
  phoneHour: (digits: string, hourBucket: string) => `pb:ph:h:${digits}:${hourBucket}`,
  phoneDay: (digits: string, dayBucket: string) => `pb:ph:d:${digits}:${dayBucket}`,
  latestInbound: (conversationId: string) => `pb:latest:${conversationId}`,
  lock: (conversationId: string) => `pb:lock:${conversationId}`,
  pack: 'pb:pack:latest',
} as const;
