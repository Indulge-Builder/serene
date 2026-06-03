import { sanitizeText } from '@/lib/utils/sanitize';
import { normalizeToE164 } from '@/lib/utils/phone';

export type NormalizedLeadPayload = {
  first_name:   string;
  last_name:    string | null;
  email:        string | null;
  phone:        string;
  /** `utm_medium` column — fb|ig|msg|an for Meta; null for other platforms */
  medium:       string | null;
  utm_campaign: string | null;
  domain:       string | null;
  /** Platform-specific ad metadata — stored in leads.attribution JSONB */
  attribution:  Record<string, unknown> | null;
  form_data:    Record<string, unknown>;
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizePhone(raw: string): string {
  if (!raw) return '';
  try {
    return normalizeToE164(raw, 'IN');
  } catch {
    console.warn(`[adapters] Phone not E.164-normalizable, storing raw: "${raw}"`);
    return raw;
  }
}

function splitName(full: string): [string, string | null] {
  const t = full.trim();
  const i = t.indexOf(' ');
  return i < 0 ? [t, null] : [t.slice(0, i), t.slice(i + 1)];
}

// ─────────────────────────────────────────────
// Meta adapter — source=meta
//
// Pabbly sends the full Meta Lead Ads payload wrapped in raw_data:
//   raw_data.res3.field_data  — JSON string containing all form answers
//   raw_data.res3             — campaign envelope: campaign_id, ad_name, campaign_name
//   raw_data.res2             — page access token: STRIPPED, never stored
//   raw_data.res1, res4, __multistep_http_codes — ignored
//
// Standard fields (full_name, phone_number, email) are extracted into typed columns.
// Every other question in field_data goes into form_data automatically.
// No config needed per campaign — new forms just work.
// ─────────────────────────────────────────────

// These field_data names map to typed columns — not repeated in form_data
const META_COLUMN_KEYS = new Set([
  'first_name', 'last_name', 'full_name',
  'email', 'email_address',
  'phone', 'phone_number', 'mobile_number',
]);

function parseFieldDataString(raw: unknown): Array<{ name: string; values: string[] }> {
  if (Array.isArray(raw)) return raw as Array<{ name: string; values: string[] }>;
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Array<{ name: string; values: string[] }>;
    } catch {
      console.warn('[adaptMeta] field_data JSON parse failed');
    }
  }
  return [];
}

export function adaptMeta(raw: unknown): NormalizedLeadPayload {
  const top = (raw ?? {}) as Record<string, unknown>;

  // Unwrap raw_data if Pabbly wrapped the envelope (which it does)
  const envelope = (
    top.raw_data && typeof top.raw_data === 'object' && !Array.isArray(top.raw_data)
      ? top.raw_data
      : top
  ) as Record<string, unknown>;

  const res3 = (envelope.res3 && typeof envelope.res3 === 'object'
    ? envelope.res3
    : {}) as Record<string, unknown>;

  // Parse field_data — this is where all form answers live
  const fieldItems = parseFieldDataString(res3.field_data);

  // Flatten field_data into a map: { name → first value }
  const fields: Record<string, string> = {};
  for (const item of fieldItems) {
    if (typeof item.name === 'string') {
      fields[item.name] = str(item.values?.[0]);
    }
  }

  // Resolve standard contact fields from the fields map
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      if (fields[k]) return fields[k];
    }
    return '';
  };

  // Name
  let firstName = get('first_name');
  let lastName: string | null = get('last_name') || null;
  if (!firstName) {
    const [fn, ln] = splitName(get('full_name'));
    firstName = fn;
    lastName = lastName ?? ln;
  }

  // form_data: every field_data answer that isn't a standard column key
  // This is where all custom campaign questions land automatically
  const formData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!META_COLUMN_KEYS.has(key) && value) {
      formData[key] = value;
    }
  }

  // attribution: platform-specific ad metadata
  const campaignId = str(res3.campaign_id) || null;
  const adName     = str(res3.ad_name) ? sanitizeText(str(res3.ad_name)) : null;
  const adsetName  = str(res3.adset_name) ? sanitizeText(str(res3.adset_name)) : null;

  const attributionObj: Record<string, unknown> = { platform: 'meta' };
  if (campaignId)  attributionObj.campaign_id = campaignId;
  if (adName)      attributionObj.ad_name = adName;
  if (adsetName)   attributionObj.adset_name = adsetName;

  return {
    first_name:   sanitizeText(firstName) || 'Unknown',
    last_name:    lastName ? sanitizeText(lastName) : null,
    email:        get('email', 'email_address') || null,
    phone:        normalizePhone(get('phone', 'phone_number', 'mobile_number')),
    medium:       res3?.platform ? sanitizeText(str(res3.platform)) : null,
    utm_campaign: str(res3.campaign_name) || null,
    domain:       null,  // resolved from utm_campaign in ingestion
    attribution:  attributionObj,
    form_data:    formData,
  };
}

// ─────────────────────────────────────────────
// Google adapter — source=google
// Expects flat key-value payload from Pabbly.
// ─────────────────────────────────────────────
export function adaptGoogle(raw: unknown): NormalizedLeadPayload {
  const r = (raw ?? {}) as Record<string, unknown>;

  const get = (k: string) => str(r[k]);

  let firstName = get('first_name');
  let lastName: string | null = get('last_name') || null;
  if (!firstName) {
    const [fn, ln] = splitName(get('full_name'));
    firstName = fn;
    lastName = lastName ?? ln;
  }

  const campaignId = get('campaign_id') || null;
  const adName     = get('ad_name') ? sanitizeText(get('ad_name')) : null;

  const attributionObj: Record<string, unknown> = { platform: 'google' };
  if (campaignId) attributionObj.campaign_id = campaignId;
  if (adName)     attributionObj.ad_name = adName;

  return {
    first_name:   sanitizeText(firstName) || 'Unknown',
    last_name:    lastName ? sanitizeText(lastName) : null,
    email:        get('email') || null,
    phone:        normalizePhone(get('phone') || get('phone_number')),
    medium:       get('utm_medium') || null,
    utm_campaign: get('utm_campaign') || null,
    domain:       get('domain') || null,
    attribution:  attributionObj,
    form_data:    {},
  };
}

// ─────────────────────────────────────────────
// Website adapter — source=website
// Accepts camelCase aliases; any non-standard key → form_data.
// ─────────────────────────────────────────────
const WEBSITE_STANDARD_KEYS = new Set([
  'first_name', 'firstName', 'last_name', 'lastName',
  'full_name', 'fullName', 'email', 'mail',
  'phone', 'phoneNumber', 'domain',
  'utm_medium', 'utm_campaign',
]);

export function adaptWebsite(raw: unknown): NormalizedLeadPayload {
  const r = (raw ?? {}) as Record<string, unknown>;

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = str(r[k]);
      if (v) return v;
    }
    return '';
  };

  let firstName = pick('first_name', 'firstName');
  let lastName: string | null = pick('last_name', 'lastName') || null;
  if (!firstName) {
    const [fn, ln] = splitName(pick('full_name', 'fullName'));
    firstName = fn;
    lastName = lastName ?? ln;
  }

  const formData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(r)) {
    if (!WEBSITE_STANDARD_KEYS.has(key)) formData[key] = value;
  }

  return {
    first_name:   sanitizeText(firstName) || 'Unknown',
    last_name:    lastName ? sanitizeText(lastName) : null,
    email:        pick('email', 'mail') || null,
    phone:        normalizePhone(pick('phone', 'phoneNumber')),
    medium:       pick('utm_medium') || null,
    utm_campaign: pick('utm_campaign') || null,
    domain:       pick('domain') || null,
    attribution:  { platform: 'website' },
    form_data:    formData,
  };
}

// ─────────────────────────────────────────────
// Source selector
// ─────────────────────────────────────────────
export type LeadSource = 'meta' | 'google' | 'website';

export function selectAdapter(source: string | null): (raw: unknown) => NormalizedLeadPayload {
  switch (source) {
    case 'meta':   return adaptMeta;
    case 'google': return adaptGoogle;
    default:       return adaptWebsite;
  }
}
