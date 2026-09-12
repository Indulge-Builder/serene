// The library ships as two pieces: the logic, and a metadata file holding every
// country's numbering rules. The convenience entry point `libphonenumber-js`
// pairs them itself — but it does so with `require('./metadata.min.json')`, and
// a bare JSON require does NOT survive every runtime. Under `tsx` (how every
// script in scripts/ runs) it hands back the module wrapper instead of the JSON,
// so the logic finds no countries and throws
// `Cannot read properties of undefined (reading 'hasOwnProperty')` on EVERY
// number. That looked exactly like "this number is invalid" to callers: the
// vendor loader silently dropped all 10,683 phone numbers in the Freshdesk
// archive and reported success (2026-09-07).
//
// So the two pieces are paired here instead. `/core` is the same logic, and
// `/metadata.min` is the same `metadata.min.json` the convenience entry point
// bundles — it just resolves to a real ES module (`metadata.min.json.js`) that
// every runtime loads correctly. Verified identical over all 10,683 real
// spellings in the archive: 10,683 same, 0 different.
//
// Keep the `/core` + explicit-metadata pairing. Reverting to the bare
// `from "libphonenumber-js"` import re-breaks every script that touches a phone.
import { parsePhoneNumber, isValidPhoneNumber, type CountryCode } from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.min";

export function normalizeToE164(phone: string, defaultCountry: CountryCode = "IN"): string {
  if (!isValidPhoneNumber(phone, defaultCountry, metadata)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }
  return parsePhoneNumber(phone, defaultCountry, metadata).format("E.164");
}

/**
 * THE inbound-WhatsApp phone normalization — never throws. wa_id arrives as
 * E.164 without '+'; when normalizeToE164 rejects it, fall back to the raw
 * value with a '+' prefix. Both the lead pipeline (whatsapp-ingestion) and the
 * Elaya staff routing gate use this, so the same sender always resolves to the
 * same string on both sides of the gate.
 */
export function normalizeWaPhone(phone: string): string {
  try {
    return normalizeToE164(phone);
  } catch {
    return phone.startsWith("+") ? phone : `+${phone}`;
  }
}

/**
 * THE canonical lead-phone normalizer — never throws, never drops a lead.
 *
 * Stores phone consistently so the SAME human number ALWAYS produces the SAME
 * string across every creation path (webhook / manual / WhatsApp). This is what
 * makes dedup reliable: previously the webhook stored the raw value on E.164
 * failure while manual/WhatsApp normalized, so '98765 43210' and '+919876543210'
 * never matched (audit 2026-06-17).
 *
 *   - Valid (E.164-parseable) → E.164 (e.g. '+919876543210')
 *   - Not parseable           → digits-only fallback (strip spaces/punctuation),
 *                               so '98765 43210', '098765-43210', '9876543210'
 *                               all collapse to the same key.
 *   - Empty / no digits       → '' (the caller rejects empty phone before insert)
 *
 * The DB mirror is `lead_phone_key(text)` (migration 0137) — keep the two in
 * sync; the partial UNIQUE index + dedup lookup both key on it.
 */
export function canonicalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (!trimmed) return "";
  try {
    return normalizeToE164(trimmed, "IN");
  } catch {
    // Digits-only fallback — the same regex the DB lead_phone_key() applies and
    // generate_lead_slug() already uses, so JS and SQL agree on the key.
    return trimmed.replace(/[^0-9]/g, "");
  }
}
