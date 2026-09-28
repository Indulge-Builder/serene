// media-reader.ts — THE model read of ONE file (Elaya's eyes, 0246,
// docs/architecture/media-understanding-plan.md section 4). No `server-only`: the sweep on
// Trigger.dev and a laptop bench call it.
//
// One image or PDF = one routing-tier call through the Elaya provider's file part (R-01: the same
// path the vendor extractor uses), answered in PLAIN-TEXT FIELDS, never JSON (the lesson-writer
// rule). A voice note = Deepgram (transcribeAudio, THE call site) and no model at all unless the
// transcript is long. Video is step 3 (frames + transcript) and is skipped here.
//
// The privacy law lives in this file and is enforced twice: the prompt says a card, an ID or a
// statement is DESCRIBED and never transcribed, and the parser nulls the text again when it finds
// a card-shaped, PAN-shaped or Aadhaar-shaped run anyway. Phones and emails in the words that are
// kept pass maskPii before they are stored. Names of members never reach the model: the caption
// is masked by the caller with the profiler's vault when there is one.

import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import type { LlmFilePart } from "@/lib/elaya/provider";
import type { PiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { transcribeAudio } from "@/lib/services/transcription-service";
import {
  MEDIA_CALL_TIMEOUT_MS, MEDIA_CLASSES, MEDIA_COST_PER_MTOK, MEDIA_IMAGE_MIMES, MEDIA_MAX_OUTPUT_TOKENS, MEDIA_PDF_MIME,
  MEDIA_READER_PROMPT_VERSION, MEDIA_SENSITIVE_CLASSES, type MediaClass, type MediaKind,
} from "@/lib/constants/media";
import type { MediaReadingFields } from "@/lib/types/media";

const LOG = "[media-reader]";

export type MediaReadInput = {
  kind: MediaKind;
  mime: string | null;
  bytes: Buffer;
  /** The caption or note text sent with the file, ALREADY masked by the caller (names, phones). */
  caption?: string | null;
  /** Where it came from, for the model's footing: "a member's WhatsApp group with the concierge" / "a Freshdesk ticket note". */
  setting: string;
  /** Voice notes: the message's own duration when known. */
  durationSeconds?: number | null;
};

export type MediaReading = {
  class: MediaClass;
  sensitive: boolean;
  summary: string;
  description: string | null;
  extracted_text: string | null;
  fields: MediaReadingFields;
  language: string | null;
  confidence: number;
  model: string;
  prompt_version: string;
  tokens: { in: number; out: number };
  cost_usd: number;
  tier: "routing" | "reasoning" | "deepgram";
  /** The raw answer, for the run ledger. */
  raw: string;
};

export type MediaReadOutcome =
  | { ok: true; reading: MediaReading }
  | { ok: false; error: string; skip?: boolean };

// ─── The prompt ──────────────────────────────────────────────────────────────

const CLASS_LINES = [
  "bill_receipt: a bill, invoice or receipt",
  "booking_confirm: a booking or reservation confirmation (hotel, table, car, flight, event)",
  "ticket_pass: a boarding pass, an event or travel ticket",
  "itinerary: a multi-leg travel or event plan",
  "menu_catalog: a menu, a brochure, a price list",
  "product_photo: a thing someone might want to buy or already bought",
  "place_photo: a venue, room, view, street, building",
  "person_photo: people (describe, NEVER identify or guess who they are)",
  "screenshot_chat: a screenshot of a chat, email or message thread",
  "screenshot_app: a screenshot of an app or a website",
  "form_document: a filled form, a letter, a certificate, any other document",
  "id_document: Aadhaar, PAN, passport, driving licence, any identity card  (SENSITIVE)",
  "payment_card: a credit or debit card, front or back  (SENSITIVE)",
  "bank_statement: a bank statement, cheque, account details  (SENSITIVE)",
  "qr_payment: a UPI or payment QR code",
  "sticker_meme: a sticker, meme, greeting image, forwarded joke",
  "other",
].join("\n");

const SYSTEM_PROMPT = `You are the eyes of Indulge, a luxury concierge in India. You look at ONE file a member or a teammate sent and write down what it is, so the team's text-only tools can use it. You write for a colleague who cannot see the file.

THE FIRST RULE, before anything else: if the file shows an identity document, a payment card or a bank statement, it is SENSITIVE. For a sensitive file you give the class, SENSITIVE: yes, and a one-line summary that names the kind of document only ("a payment card, front side"). NO numbers, NO names, NO dates, NO text from it, no fields. Nothing else.

For every other file:
- Never identify a person. Describe ("two adults and a child at a beach"), never name or guess who.
- Copy text as written, in the language written. Do not translate; you may add the language.
- Amounts: write the number as digits; INR unless the file clearly shows another currency (then set currency).
- people_count is the number of guests as ONE whole number: "2 adults, 0 children" is 2, never 20.
- Dates as YYYY-MM-DD when the file shows the year. NEVER invent a year: when only a day and month are visible, write --MM-DD (for example --08-21); when the date is unclear, leave the field out.
- If you are unsure of the class, pick the closest and lower the confidence.

Classes (use the id before the colon):
${CLASS_LINES}

Answer in EXACTLY this shape, plain text, every heading on its own line, in this order. No JSON, no markdown, no commentary outside the shape.

CLASS: <one id>
SENSITIVE: yes|no
CONFIDENCE: <0.00 to 1.00>
LANGUAGE: <en|hi|hinglish|other|none>
SUMMARY: <one line a teammate would say, at most 160 characters: what it is, the key amount/date/name of a place or merchant when present>
DESCRIPTION: <two to four plain sentences: what is shown and what matters for a concierge>
FIELDS:
<key: value, one per line; only keys you can read: amount_inr, currency, date, merchant, booking_ref, from, to, people_count, check_in, check_out, seat, flight, pnr, items (a short comma list). Leave the section empty when nothing applies>
TEXT:
<every word visible in the file, as written, in reading order. For a photo of a place or people, write "none". For a long document, everything on the first pages up to about 3000 characters>`;

// ─── Reading ─────────────────────────────────────────────────────────────────

const READABLE_IMAGE = new Set(MEDIA_IMAGE_MIMES);

/** The one place a file becomes a reading. Never throws: a failure is a result. */
export async function readMediaFile(input: MediaReadInput, opts: { tier?: "routing" | "reasoning"; piiDepth: PiiMaskingDepth }): Promise<MediaReadOutcome> {
  if (input.kind === "audio") return readAudio(input, opts.piiDepth);
  if (input.kind === "video") return { ok: false, error: "video: step 3 (frames + transcript) not built yet", skip: true };
  if (input.kind === "document") return { ok: false, error: `document type ${input.mime ?? "unknown"} not readable yet`, skip: true };

  const mime = normaliseMime(input.mime, input.bytes);
  if (input.kind === "image" && !READABLE_IMAGE.has(mime)) return { ok: false, error: `image type ${mime} is not one the model reads`, skip: true };
  if (input.kind === "pdf" && mime !== MEDIA_PDF_MIME) return { ok: false, error: `pdf with mime ${mime}`, skip: true };

  const file: LlmFilePart = { mediaType: mime, dataBase64: input.bytes.toString("base64") };
  const caption = (input.caption ?? "").trim();
  const userText = [
    `Setting: ${input.setting}.`,
    caption ? `The message that carried this file said: "${caption.slice(0, 500)}"` : "The file came with no caption.",
    "Read the file and answer in the shape.",
  ].join("\n");

  const tier = opts.tier ?? "routing";
  const started = Date.now();
  try {
    const llm = await resolveLlmForJob(tier);
    const result = await llm.adapter.complete({
      model: llm.model, maxTokens: MEDIA_MAX_OUTPUT_TOKENS, timeoutMs: MEDIA_CALL_TIMEOUT_MS, cachePrefix: true,
      system: SYSTEM_PROMPT, messages: [{ role: "user", content: userText, files: [file] }],
    });
    const tokens = { in: result.usage.inputTokens, out: result.usage.outputTokens };
    const price = MEDIA_COST_PER_MTOK[tier];
    const cost = (tokens.in * price.input + tokens.out * price.output) / 1_000_000;
    if (result.stopReason === "max_tokens" && !/^TEXT:/m.test(result.text)) return { ok: false, error: "answer cut off before the shape was complete" };
    const parsed = parseReading(result.text, opts.piiDepth);
    if (!parsed) return { ok: false, error: "answer not in the shape" };
    void started;
    return { ok: true, reading: { ...parsed, model: llm.model, prompt_version: MEDIA_READER_PROMPT_VERSION, tokens, cost_usd: cost, tier, raw: result.text.slice(0, 6000) } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`${LOG} read failed:`, msg.slice(0, 200));
    return { ok: false, error: msg.slice(0, 500) };
  }
}

async function readAudio(input: MediaReadInput, piiDepth: PiiMaskingDepth): Promise<MediaReadOutcome> {
  const mime = input.mime ?? "audio/ogg";
  try {
    const ab = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
    const transcript = (await transcribeAudio(ab, mime)).trim();
    if (!transcript) return { ok: true, reading: silentAudio(input) };
    const text = maskPii(transcript, piiDepth);
    const minutes = Math.max(0.1, (input.durationSeconds ?? Math.round(input.bytes.byteLength / 2000)) / 60);
    const summary = `voice note: "${text.replace(/\s+/g, " ").slice(0, 140)}${text.length > 140 ? "…" : ""}"`;
    return {
      ok: true,
      reading: {
        class: "voice_note", sensitive: false, summary, description: null, extracted_text: text, fields: {}, language: null, confidence: 0.8,
        model: "deepgram/nova-2", prompt_version: MEDIA_READER_PROMPT_VERSION, tokens: { in: 0, out: 0 }, cost_usd: Math.round(minutes * 0.0043 * 1e5) / 1e5, tier: "deepgram", raw: transcript.slice(0, 6000),
      },
    };
  } catch (e) {
    return { ok: false, error: `transcription failed: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}` };
  }
}

function silentAudio(input: MediaReadInput): MediaReading {
  return { class: "voice_note", sensitive: false, summary: "voice note with no clear speech", description: null, extracted_text: null, fields: {}, language: "none", confidence: 0.5, model: "deepgram/nova-2", prompt_version: MEDIA_READER_PROMPT_VERSION, tokens: { in: 0, out: 0 }, cost_usd: 0, tier: "deepgram", raw: `(${input.durationSeconds ?? "?"}s, no speech)` };
}

// ─── The parser: the shape in, a reading out; the privacy law applied a second time ──

const SECTION = /^(CLASS|SENSITIVE|CONFIDENCE|LANGUAGE|SUMMARY|DESCRIPTION|FIELDS|TEXT):[ \t]*/m;

function splitShape(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.replace(/\r/g, "").split("\n");
  let cur: string | null = null;
  for (const line of lines) {
    const m = line.match(/^(CLASS|SENSITIVE|CONFIDENCE|LANGUAGE|SUMMARY|DESCRIPTION|FIELDS|TEXT):[ \t]*(.*)$/);
    if (m) { cur = m[1]; out[cur] = m[2] ?? ""; continue; }
    if (cur) out[cur] = (out[cur] ? out[cur] + "\n" : "") + line;
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

/** Luhn: does a digit run look like a real card number, not a booking reference or a phone with its country code? */
function luhnOk(digits: string): boolean {
  let sum = 0; let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

/**
 * The shapes that must never be kept, wherever the model put them: a Luhn-valid 13 to 19 digit card
 * number, an Aadhaar written 4-4-4, a PAN, a passport number beside the word, a CVV beside an
 * expiry. A plain 12-digit booking reference or a bank account on a vendor's bill is NOT one of
 * these: the first bench (2026-09-27) lost a car-transfer bill and a hotel booking to a rule that
 * fired on any long digit run.
 */
export function redactSensitiveShapes(text: string): { text: string; found: string[] } {
  const found: string[] = [];
  let out = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const digits = m.replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) { found.push("card"); return "[card number removed]"; }
    return m;
  });
  out = out.replace(/\b\d{4}[ -]\d{4}[ -]\d{4}\b/g, () => { found.push("aadhaar"); return "[aadhaar removed]"; });
  out = out.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, () => { found.push("pan"); return "[pan removed]"; });
  if (/passport/i.test(out)) out = out.replace(/\b[A-Z]\d{7}\b/g, () => { found.push("passport"); return "[passport number removed]"; });
  if (/\bcvv\b/i.test(out)) out = out.replace(/\bcvv\b\s*:?\s*\d{3,4}/gi, () => { found.push("cvv"); return "cvv [removed]"; });
  return { text: out, found };
}

/** Kept for the bench and older callers: does the text carry any shape redactSensitiveShapes would remove? */
export function looksSensitive(text: string): boolean {
  return redactSensitiveShapes(text).found.length > 0;
}

export function parseReading(raw: string, piiDepth: PiiMaskingDepth): Omit<MediaReading, "model" | "prompt_version" | "tokens" | "cost_usd" | "tier" | "raw"> | null {
  if (!SECTION.test(raw)) return null;
  const s = splitShape(raw);
  const classId = (s.CLASS ?? "").split(/\s/)[0]?.toLowerCase().replace(/[^a-z_]/g, "");
  const cls: MediaClass = (MEDIA_CLASSES.values as readonly string[]).includes(classId) ? (classId as MediaClass) : "other";
  const sensitive = /^y/i.test(s.SENSITIVE ?? "") || MEDIA_SENSITIVE_CLASSES.includes(cls);
  const confidence = Math.max(0, Math.min(1, Number.parseFloat(s.CONFIDENCE ?? "") || 0.5));
  const language = s.LANGUAGE ? s.LANGUAGE.split(/\s/)[0].toLowerCase().slice(0, 12) : null;
  let summary = (s.SUMMARY ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  let description: string | null = (s.DESCRIPTION ?? "").trim().slice(0, 1200) || null;
  let text: string | null = (s.TEXT ?? "").trim();
  if (!text || /^none\.?$/i.test(text)) text = null;
  let fields: MediaReadingFields = parseFields(s.FIELDS ?? "");

  // A non-sensitive file may still carry a card or an ID number in a corner (a bill paid by card, a
  // form with a PAN): those shapes are removed and the rest of the reading is kept. A file the model
  // itself called sensitive keeps nothing but its kind.
  if (!sensitive) {
    if (text) { const r = redactSensitiveShapes(text); text = r.text; }
    if (description) description = redactSensitiveShapes(description).text;
    summary = redactSensitiveShapes(summary).text;
    for (const k of Object.keys(fields)) if (typeof fields[k] === "string") fields[k] = redactSensitiveShapes(fields[k] as string).text;
  }
  if (sensitive) {
    // Described, never transcribed. Whatever the model wrote, only the kind of document survives.
    text = null; fields = {}; description = null;
    // The kind of document and nothing else: no amount, no date, no bank, however the model phrased it
    // (the first live hour kept "a bank transfer receipt showing a payment of ₹1,00,000" because the
    // commas hid the digit run).
    summary = `a ${MEDIA_CLASSES.labels[cls]?.toLowerCase() ?? "sensitive document"}`;
  } else {
    if (text) text = maskPii(text.slice(0, 6000), piiDepth);
    if (description) description = maskPii(description, piiDepth);
    summary = maskPii(summary, piiDepth);
  }
  if (!summary) summary = MEDIA_CLASSES.labels[cls] ?? "a file";
  return { class: cls, sensitive, summary, description, extracted_text: text, fields, language, confidence };
}

function parseFields(block: string): MediaReadingFields {
  const out: MediaReadingFields = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*([a-z_]{2,32})\s*:\s*(.+?)\s*$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (!val || /^(none|n\/a|-)$/i.test(val)) continue;
    if (key === "amount_inr" || key === "people_count") {
      const n = Number.parseFloat(val.replace(/[^\d.]/g, ""));
      if (Number.isFinite(n)) out[key] = n;
    } else {
      out[key] = val.slice(0, 200);
    }
  }
  return out;
}

/** The provider is strict about media types; sniff the bytes when the stored mime is missing or generic. */
function normaliseMime(mime: string | null, bytes: Buffer): string {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m === "image/jpg") return "image/jpeg";
  if (READABLE_IMAGE.has(m) || m === MEDIA_PDF_MIME) return m;
  if (bytes.length > 4) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
    if (bytes.subarray(0, 4).toString("ascii") === "%PDF") return MEDIA_PDF_MIME;
    if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
    if (bytes.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  }
  return m || "application/octet-stream";
}
