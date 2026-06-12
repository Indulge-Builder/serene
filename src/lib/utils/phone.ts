import { parsePhoneNumber, isValidPhoneNumber, type CountryCode } from "libphonenumber-js";

export function normalizeToE164(phone: string, defaultCountry: CountryCode = "IN"): string {
  if (!isValidPhoneNumber(phone, defaultCountry)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }
  return parsePhoneNumber(phone, defaultCountry).format("E.164");
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
