// finance-note.ts — THE reader of the concierge team's reimbursement template (0250). Pure and
// client-safe: text in, fields and invoice lines out. No model, no database.
//
// The template, as the team writes it on a Freshdesk ticket:
//   Client name- …  Description- Date- Subject-Location-Pax  Cost Price- …  Selling Price- …
//   Name & Bill of vendor- …  Payment done via- Razorpay/Card/UPI/Etc  Note- …
// Read against 600 real notes (2026-09-29): the labels are almost always there, the hyphen and
// the spacing are not, the scaffold's own hint words are often left in place, and an amount
// arrives as "Rs 11,798.17", "5450", "11,793/", "800 + 215 = 1015 INR", "129 AED" or
// "32170 (7500+24670)".
//
// The invoice takes the SELLING price. An amount the reader is unsure about is never guessed
// at: it is left empty and a warning says why, so a person types it.

import { FINANCE_TEMPLATE_LABELS, type FinanceTemplateKey } from "@/lib/constants/finance";
import type { FinanceInvoiceItem, ParsedTemplateNote } from "@/lib/types/finance";

/**
 * A label's separator: a hyphen, a colon or a dash. Written as an alternation, never as a
 * bracketed character class: Tailwind scans every source file for class names and reads a
 * bracketed hyphen-colon-dash as an arbitrary CSS property, which breaks the stylesheet build
 * (2026-09-30).
 */
const SEP = "(?:-|:|–)";

/** The scaffold's own words. Left in a field, they are removed; a field holding only them was never filled. */
const SCAFFOLD_HINTS: RegExp[] = [
  new RegExp(`date\\s*${SEP}?\\s*subject\\s*${SEP}?\\s*location\\s*${SEP}?\\s*pax`, "gi"),
  /razorpay\s*\/\s*card\s*\/\s*upi\s*\/\s*etc\.?/gi,
  /please mention if the bill has to be issued in any other name\.?/gi,
  /for online payments made,?\s*invoice from vendor is mandatory\.?/gi,
];
/** A genie who treats the hint as labels writes "Date-26 Subject- Paid for the pen Location-Goa". */
const HINT_LABELS = new RegExp(`\\b(date|subject|location)\\s*${SEP}\\s*`, "gi");

const FOREIGN = /\b(aed|usd|eur|euro|euros|gbp|sgd|thb|idr|chf|jpy|aud|cad|qar|sar|omr|bhd|kwd|dhs|dirham|dirhams|dollar|dollars|pound|pounds)\b|[$€£]/i;
const RUPEE_WORDS = /\b(inr|rs\.?|rupees?)\b|₹/gi;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

function labelPattern(label: string): string {
  // "Name & Bill of vendor" is also written "Name and Bill of vendor"; spacing is free.
  return label.split(/\s+/).map((w) => (w === "&" ? "(?:&|and)" : w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("\\s*");
}

type Hit = { key: FinanceTemplateKey; start: number; end: number };

function findLabels(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const { key, label } of FINANCE_TEMPLATE_LABELS) {
    // "Note" is a plain word, so it counts as a label only with its separator.
    const re = new RegExp(`(^|[\\s,;|])(${labelPattern(label)})\\s*${key === "note" ? SEP : `${SEP}?`}`, "i");
    const m = re.exec(text);
    if (m) hits.push({ key, start: m.index + m[1].length, end: m.index + m[0].length });
  }
  return hits.sort((a, b) => a.start - b.start);
}

function clean(v: string): string {
  let t = v;
  for (const h of SCAFFOLD_HINTS) t = t.replace(h, " ");
  return t.replace(/\s+/g, " ").replace(/^[\s\-:–|,]+|[\s\-:–|,]+$/g, "").trim();
}

const toNumber = (s: string): number => Number(s.replace(/,/g, ""));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * One written piece → rupees, or null when it is not plainly rupees. "11,798.17", "Rs 5450",
 * "30642.27 INR", "₹3,000/-", "2700 paid" all read. Brackets are a breakdown and are set aside;
 * several numbers read only when the first is the sum of the rest ("32170 7500 24670").
 */
export function parseRupees(written: string): number | null {
  if (!written || FOREIGN.test(written)) return null;
  const bare = written.replace(/\([^)]*\)/g, " ").replace(RUPEE_WORDS, " ").replace(/\/-?/g, " ");
  const nums = (bare.match(NUMBER) ?? []).map(toNumber).filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  if (nums.length === 1) return round2(nums[0]);
  const rest = nums.slice(1).reduce((s, n) => s + n, 0);
  return Math.abs(nums[0] - rest) < 0.01 ? round2(nums[0]) : null;
}

/**
 * A written price → the amounts to bill. "800 + 215 = 1015 INR" is one amount (the total after
 * the equals sign); "400,000 INR + 248,975 INR + 100 INR" is three; a plus inside brackets is a
 * breakdown and does not split.
 */
export function readAmounts(written: string): { pieces: string[]; amounts: (number | null)[] } {
  const afterEquals = written.includes("=") ? written.slice(written.lastIndexOf("=") + 1) : written;
  const flat = afterEquals.replace(/\([^)]*\)/g, (m) => m.replace(/\+/g, "&"));
  const pieces = flat.split("+").map((p) => p.trim()).filter(Boolean);
  return { pieces, amounts: pieces.map(parseRupees) };
}

/** The line as finance writes it in Zoho today: "24.09.2026  Runner-Surat". */
export function buildLineDescription(description: string | undefined): string {
  return (description ?? "").replace(HINT_LABELS, " ").replace(/[-–\s]+pax\s*$/i, "").replace(/\s+/g, " ").trim();
}

export function parseTemplateNote(text: string | null | undefined): ParsedTemplateNote {
  const none: ParsedTemplateNote = { isTemplate: false, isEmpty: false, fields: {}, items: [], warnings: [] };
  const raw = (text ?? "").replace(/ /g, " ");
  if (!raw.trim()) return none;

  const hits = findLabels(raw);
  const keys = new Set(hits.map((h) => h.key));
  // A template is a note that carries a price label and at least one of the other labels.
  const isTemplate = (keys.has("sell") || keys.has("cost")) && (keys.has("description") || keys.has("vendor") || keys.has("client") || keys.has("mode"));
  if (!isTemplate) return none;

  const fields: Partial<Record<FinanceTemplateKey, string>> = {};
  hits.forEach((h, i) => {
    const v = clean(raw.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : raw.length));
    if (v) fields[h.key] = v;
  });

  if (!fields.description && !fields.cost && !fields.sell && !fields.vendor) {
    return { isTemplate: true, isEmpty: true, fields, items: [], warnings: [] };
  }

  const warnings: string[] = [];
  const sell = fields.sell ? readAmounts(fields.sell) : null;
  const cost = fields.cost ? readAmounts(fields.cost) : null;
  const allRead = (r: { amounts: (number | null)[] } | null) => Boolean(r && r.amounts.length && r.amounts.every((a) => a != null));
  const sum = (r: { amounts: (number | null)[] }) => r.amounts.reduce<number>((s, a) => s + (a ?? 0), 0);

  let used = sell;
  if (!allRead(sell) && allRead(cost)) {
    used = cost;
    warnings.push(fields.sell ? `The selling price ("${fields.sell}") could not be read; the cost price is used.` : "No selling price in the note; the cost price is used.");
  } else if (allRead(sell) && allRead(cost) && Math.abs(sum(sell!) - sum(cost!)) > 0.009) {
    warnings.push(`Cost price (${fields.cost}) and selling price (${fields.sell}) differ; the selling price is billed.`);
  }
  used = used ?? cost;

  if (!fields.mode) warnings.push("The note does not say how it was paid.");
  if (!fields.vendor) warnings.push("The note does not name the vendor.");

  const description = buildLineDescription(fields.description);
  if (!description) warnings.push("The note has no description. Write the invoice line.");
  const pieces = used?.pieces.length ? used.pieces : [""];
  const items: Omit<FinanceInvoiceItem, "noteId">[] = pieces.map((piece, i) => {
    const amount = used?.amounts[i] ?? null;
    if (amount == null) {
      warnings.push(!piece ? "The note carries no amount. Type it."
        : FOREIGN.test(piece) ? `"${piece}" is not in rupees. Type the rupee amount.`
        : `The amount "${piece}" could not be read. Type it.`);
    }
    return {
      description: pieces.length > 1 ? `${description} (${i + 1} of ${pieces.length})` : description,
      amount,
      vendor: fields.vendor ?? null,
      mode: fields.mode ?? null,
      amountAsWritten: amount == null && piece ? piece : null,
    };
  });

  return { isTemplate: true, isEmpty: false, fields, items, warnings: Array.from(new Set(warnings)) };
}
