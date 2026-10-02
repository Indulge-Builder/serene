// THE public bot's guards (0252, docs/architecture/indulge-bot-plan.md section 10). Pure functions,
// benchable without a database or a model: what the model may see of an inbound message, and
// whether a reply may leave. Each guard assumes the layer before it failed.
//
// They compose the checks that already exist and add only what a public bot needs on top:
// redactSensitiveShapes (media-reader.ts) for cards and IDs, leakCheck (hands-draft.ts) for phone
// and email shapes. Names are matched as FULL names here, never as name parts: a member called
// "Grace" must not stop every reply that says "grace".

import { redactSensitiveShapes } from '@/lib/services/media-reader';
import { leakCheck } from '@/lib/services/hands-draft';
import { maskPii } from '@/lib/elaya/pii';
import {
  PUBLIC_BOT_FOREIGN_CURRENCY_RE,
  PUBLIC_BOT_FORBIDDEN_WORDS,
  PUBLIC_BOT_LIMITS,
  PUBLIC_BOT_OPT_OUT_WORDS,
} from '@/lib/constants/public-bot';

// ─── Input ────────────────────────────────────────────────────────────────────

/**
 * What the model may see of one inbound message: card, Aadhaar, PAN and passport shapes removed,
 * phones and emails masked, cut to a sane length. The person's words, never instructions; the
 * persona says so, and this is the part code can enforce.
 */
export function guardInbound(text: string): { text: string; found: string[] } {
  const redacted = redactSensitiveShapes(text);
  const masked = maskPii(redacted.text, 'light');
  const cut = masked.length > PUBLIC_BOT_LIMITS.maxInboundChars ? `${masked.slice(0, PUBLIC_BOT_LIMITS.maxInboundChars)}…` : masked;
  return { text: cut, found: redacted.found };
}

/** A whole-message opt-out ("stop", "unsubscribe", "band karo"). */
export function isOptOut(text: string): boolean {
  const t = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  return (PUBLIC_BOT_OPT_OUT_WORDS as readonly string[]).includes(t);
}

// ─── Money ────────────────────────────────────────────────────────────────────

// Three shapes of an amount: with a rupee mark ("₹4,72,000", "Rs 4 lakh"), with an Indian unit
// ("4.72 lakh"), and a bare comma-grouped number ("4,72,000", "3,00,000"), which in a sales reply
// is a price. A year or a short count has no comma, and phones are the contact check's.
const MONEY_RE =
  /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|lac|crores?|cr|k|l)?\b|(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|lac|crores?)\b|(?<![\d₹.])(\d{1,3}(?:,\d{2,3})+)(?![\d,])/giu;

const UNIT: Record<string, number> = { lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, crore: 1e7, crores: 1e7, cr: 1e7, k: 1e3 };

/** Every rupee amount written in a text, as a number of rupees ("₹4 lakh" and "4,00,000" are both 400000). */
export function rupeeAmountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const raw = (m[1] ?? m[3] ?? m[5] ?? '').replace(/,/g, '');
    const unit = (m[2] ?? m[4] ?? '').toLowerCase();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.push(Math.round(n * (UNIT[unit] ?? 1)));
  }
  return out;
}

// ─── Names ────────────────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Full names (two words or more) found in a text, in any script, as whole phrases. */
export function fullNameHits(text: string, names: readonly string[], allow: readonly string[] = []): string[] {
  const allowed = new Set(allow.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const hits = new Set<string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name.split(' ').length < 2 || name.length < 5) continue;
    if (allowed.has(name.toLowerCase())) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(text)) hits.add(name);
  }
  return [...hits];
}

// ─── Output ───────────────────────────────────────────────────────────────────

export type GuardHit = { kind: 'name' | 'forbidden' | 'contact' | 'currency' | 'price' | 'link'; value: string };

export type OutputGuardContext = {
  /** The published pack's text: numbers, links, phones and emails in it are allowed. */
  packText: string;
  /** URLs of library items (they may be written into a reply). */
  libraryUrls: readonly string[];
  /** Staff and member full names, and the pack's forbidden phrases (client names among them). */
  names: readonly string[];
  forbiddenPhrases: readonly string[];
  /** The person's own words this conversation: an amount or a name they wrote may be repeated. */
  conversationText: string;
  /** The person's own name, never a hit. */
  personName?: string | null;
};

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/gi;

/**
 * Whether a reply may leave. Any hit holds it back; the orchestrator then sends a safe line and
 * hands the chat to a person (plan section 10, layer 5).
 */
export function guardOutbound(reply: string, ctx: OutputGuardContext): { ok: boolean; hits: GuardHit[] } {
  const hits: GuardHit[] = [];
  const lower = reply.toLowerCase();

  for (const n of fullNameHits(reply, ctx.names, ctx.personName ? [ctx.personName] : [])) hits.push({ kind: 'name', value: n });

  for (const phrase of [...PUBLIC_BOT_FORBIDDEN_WORDS, ...ctx.forbiddenPhrases]) {
    const p = phrase.trim().toLowerCase();
    if (p.length < 3) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p)}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(lower)) hits.push({ kind: 'forbidden', value: phrase });
  }

  const packDigits = ctx.packText.replace(/\D/g, ' ');
  const packLower = ctx.packText.toLowerCase();
  for (const c of leakCheck(reply, [])) {
    const digits = c.replace(/\D/g, '');
    const allowed = digits.length >= 7 ? packDigits.includes(digits.slice(-10)) || ctx.packText.replace(/\D/g, '').includes(digits.slice(-10)) : packLower.includes(c.toLowerCase());
    if (!allowed) hits.push({ kind: 'contact', value: c });
  }

  if (PUBLIC_BOT_FOREIGN_CURRENCY_RE.test(reply)) hits.push({ kind: 'currency', value: 'a currency other than ₹' });

  const allowedAmounts = new Set([...rupeeAmountsIn(ctx.packText), ...rupeeAmountsIn(ctx.conversationText)]);
  for (const a of rupeeAmountsIn(reply)) {
    if (!allowedAmounts.has(a)) hits.push({ kind: 'price', value: `₹${a.toLocaleString('en-IN')}` });
  }

  const allowedUrls = new Set([...(ctx.packText.match(URL_RE) ?? []), ...ctx.libraryUrls].map((u) => u.replace(/[.,;:!?]+$/, '').toLowerCase()));
  for (const u of reply.match(URL_RE) ?? []) {
    const clean = u.replace(/[.,;:!?]+$/, '').toLowerCase();
    if (!allowedUrls.has(clean)) hits.push({ kind: 'link', value: u });
  }

  return { ok: hits.length === 0, hits };
}
