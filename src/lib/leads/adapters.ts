import { sanitizeText } from '@/lib/utils/sanitize';
import { normalizeToE164 } from '@/lib/utils/phone';

export type NormalizedLeadPayload = {
  first_name:   string;
  last_name:    string | null;
  email:        string | null;
  phone:        string;
  platform:     'meta' | 'google' | 'website' | 'whatsapp';
  campaign_id:  string | null;
  ad_name:      string | null;
  domain:       string | null;
  utm_source:   string | null;
  utm_medium:   string | null;
  utm_campaign: string | null;
  utm_content:  string | null;
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
// Pabbly wraps the Meta Lead Ads payload in a multi-step envelope:
//   res4 → flattened form fields (full_name, email, phone_number, custom Q&A)
//   res3 → Meta lead envelope (field_data JSON string, campaign_id, ad_name,
//           campaign_name, adset_id, adset_name, created_time, form_id, ad_id)
//   res2 → page access token  ← NEVER stored; stripped before any persistence
//   res1 → lead gen metadata (leadgen_id, page_id, form_id, entry_id)
//
// Field resolution priority (first non-empty value wins):
//   1. res3.field_data parsed array   — Meta's canonical field values
//   2. res4 flat keys                 — Pabbly's convenience flattening (same data)
//   3. top-level keys                 — direct/manual sends without Pabbly wrapper
//
// All non-structural answer fields go into form_data (custom Q&A, city, etc.)
// res2 (access_token) is silently dropped — never logged, never stored.
// ─────────────────────────────────────────────

// Keys that are extracted into typed columns — not repeated in form_data
const META_KNOWN_KEYS = new Set([
  'first_name', 'last_name', 'full_name', 'email', 'email_address',
  'phone', 'phone_number', 'mobile_number',
  'campaign_id', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
  'form_id', 'leadgen_id', 'page_id', 'created_time',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
  'campaign_name', 'domain', 'message',
]);

// Top-level Pabbly envelope keys — never go into form_data
const PABBLY_ENVELOPE_KEYS = new Set([
  'res1', 'res2', 'res3', 'res4', '__multistep_http_codes',
]);

function parseFieldData(raw: unknown): Array<{ name: string; values: string[] }> {
  // field_data arrives as a JSON string from Pabbly, or as a real array from direct Meta webhooks
  if (Array.isArray(raw)) return raw as Array<{ name: string; values: string[] }>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Array<{ name: string; values: string[] }>;
    } catch {
      console.warn('[adaptMeta] field_data is not valid JSON:', raw.slice(0, 80));
    }
  }
  return [];
}

export function adaptMeta(raw: unknown): NormalizedLeadPayload {
  const top = (raw ?? {}) as Record<string, unknown>;

  // Pabbly sometimes wraps the full envelope in a "raw_data" key.
  // Unwrap it so the rest of the adapter sees res1/res3/res4 at the top level.
  const r = (
    top.raw_data && typeof top.raw_data === 'object' && !Array.isArray(top.raw_data)
      ? top.raw_data
      : top
  ) as Record<string, unknown>;

  // Unwrap Pabbly envelope keys
  const res3 = (r.res3 ?? {}) as Record<string, unknown>;
  const res4 = (r.res4 ?? {}) as Record<string, unknown>;
  // res2 intentionally ignored — contains access_token, never touched

  // Build a flat field map from res3.field_data (canonical Meta values)
  const fields: Record<string, string> = {};
  for (const item of parseFieldData(res3.field_data)) {
    if (typeof item.name === 'string') {
      fields[item.name] = item.values?.[0] ?? '';
    }
  }

  // Resolve a value — field_data first, then res4 flat keys, then top-level
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const v = fields[k] || str(res4[k]) || str(r[k]);
      if (v) return v;
    }
    return '';
  };

  // Meta envelope convenience getters (res3 top-level, not inside field_data)
  const meta = (...keys: string[]): string => {
    for (const k of keys) {
      const v = str(res3[k]);
      if (v) return v;
    }
    return '';
  };

  // Name — Meta forms use full_name as a single field
  let firstName = get('first_name');
  let lastName: string | null = get('last_name') || null;
  if (!firstName) {
    const [fn, ln] = splitName(get('full_name'));
    firstName = fn;
    lastName = lastName ?? ln;
  }

  // form_data: every field answer that isn't a structural key
  // This captures all custom Q&A (city, budget, intent questions, etc.)
  const formData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (!META_KNOWN_KEYS.has(key)) formData[key] = value;
  }

  // Also capture any extra res4 keys not already in fields and not structural
  for (const [key, value] of Object.entries(res4)) {
    if (!META_KNOWN_KEYS.has(key) && !(key in formData)) {
      formData[key] = value;
    }
  }

  // campaign_name lives in res3, not field_data — use it as utm_campaign fallback
  const campaignName = meta('campaign_name');

  return {
    first_name:   sanitizeText(firstName) || 'Unknown',
    last_name:    lastName ? sanitizeText(lastName) : null,
    email:        get('email', 'email_address') || null,
    phone:        normalizePhone(get('phone', 'phone_number', 'mobile_number')),
    platform:     'meta',
    campaign_id:  meta('campaign_id', 'ad_id') || null,
    ad_name:      meta('ad_name') ? sanitizeText(meta('ad_name')) : null,
    domain:       get('domain') || null,
    utm_source:   get('utm_source') || 'meta',
    utm_medium:   get('utm_medium') || null,
    utm_campaign: get('utm_campaign') || campaignName || null,
    utm_content:  get('utm_content') || null,
    form_data:    formData,
  };
}

// ─────────────────────────────────────────────
// Google adapter — source=google
// ─────────────────────────────────────────────
export function adaptGoogle(raw: unknown): NormalizedLeadPayload {
  const r = (raw ?? {}) as Record<string, unknown>;

  // Legacy: raw_google_fields as [{column_id, string_value}]
  const legacy: Record<string, string> = {};
  if (Array.isArray(r.raw_google_fields)) {
    for (const item of r.raw_google_fields as Array<{ column_id?: string; string_value?: string }>) {
      if (typeof item.column_id === 'string') legacy[item.column_id] = item.string_value ?? '';
    }
  }

  const get = (k: string) => str(r[k]) || legacy[k] || '';

  let firstName = get('first_name');
  let lastName: string | null = get('last_name') || null;
  if (!firstName) {
    const [fn, ln] = splitName(get('full_name'));
    firstName = fn;
    lastName = lastName ?? ln;
  }

  return {
    first_name:   sanitizeText(firstName) || 'Unknown',
    last_name:    lastName ? sanitizeText(lastName) : null,
    email:        get('email') || null,
    phone:        normalizePhone(get('phone') || get('phone_number')),
    platform:     'google',
    campaign_id:  get('campaign_id') || null,
    ad_name:      get('ad_name') ? sanitizeText(get('ad_name')) : null,
    domain:       get('domain') || null,
    utm_source:   get('utm_source') || 'google',
    utm_medium:   get('utm_medium') || null,
    utm_campaign: get('utm_campaign') || null,
    utm_content:  get('utm_content') || null,
    form_data:    {},
  };
}

// ─────────────────────────────────────────────
// Website adapter — source=website
// Accepts camelCase aliases; any non-standard key → form_data.
// ─────────────────────────────────────────────
const STANDARD_KEYS = new Set([
  'first_name', 'firstName', 'last_name', 'lastName',
  'full_name', 'fullName', 'email', 'mail',
  'phone', 'phoneNumber', 'campaign_id', 'ad_name', 'domain',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
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
    if (!STANDARD_KEYS.has(key)) formData[key] = value;
  }

  return {
    first_name:   sanitizeText(firstName) || 'Unknown',
    last_name:    lastName ? sanitizeText(lastName) : null,
    email:        pick('email', 'mail') || null,
    phone:        normalizePhone(pick('phone', 'phoneNumber')),
    platform:     'website',
    campaign_id:  pick('campaign_id') || null,
    ad_name:      pick('ad_name') ? sanitizeText(pick('ad_name')) : null,
    domain:       pick('domain') || null,
    utm_source:   pick('utm_source') || 'website',
    utm_medium:   pick('utm_medium') || null,
    utm_campaign: pick('utm_campaign') || null,
    utm_content:  pick('utm_content') || null,
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
