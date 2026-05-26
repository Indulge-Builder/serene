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
// ─────────────────────────────────────────────
export function adaptMeta(raw: unknown): NormalizedLeadPayload {
  const r = (raw ?? {}) as Record<string, unknown>;

  // Legacy: raw_meta_fields as [{name, values}]
  const legacy: Record<string, string> = {};
  if (Array.isArray(r.raw_meta_fields)) {
    for (const item of r.raw_meta_fields as Array<{ name?: string; values?: string[] }>) {
      if (typeof item.name === 'string') legacy[item.name] = item.values?.[0] ?? '';
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

  const message = get('message');
  const formData: Record<string, unknown> = {};
  if (message) formData.message = message;

  return {
    first_name:   sanitizeText(firstName) || 'Unknown',
    last_name:    lastName ? sanitizeText(lastName) : null,
    email:        get('email') || null,
    phone:        normalizePhone(get('phone')),
    platform:     'meta',
    campaign_id:  get('campaign_id') || null,
    ad_name:      get('ad_name') ? sanitizeText(get('ad_name')) : null,
    domain:       get('domain') || null,
    utm_source:   get('utm_source') || 'meta',
    utm_medium:   get('utm_medium') || null,
    utm_campaign: get('utm_campaign') || null,
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
