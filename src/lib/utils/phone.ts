import { parsePhoneNumber, isValidPhoneNumber, type CountryCode } from "libphonenumber-js";

export function normalizeToE164(phone: string, defaultCountry: CountryCode = "IN"): string {
  if (!isValidPhoneNumber(phone, defaultCountry)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }
  return parsePhoneNumber(phone, defaultCountry).format("E.164");
}
