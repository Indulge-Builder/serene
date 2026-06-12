// Elaya PII gateway — in the pipeline from day one (D-01 posture for the AI layer).
//
// Every tool result passes through maskPii() before being serialized into a model
// request. Depth is configurable via the elaya_settings `pii_masking_depth` row:
//   off    — passthrough (debugging only; never the shipped default)
//   light  — DEFAULT. Phone numbers keep last 4 digits; emails keep first char +
//            domain. Names stay visible (staff persona needs them to be useful).
//   strict — light + emails fully masked. (Name pseudonymisation arrives with the
//            vault — D-01 forward contract; this gateway is its mount point.)
//
// D-05: masked-or-not, prompt contents containing client data are never logged.

import type { PiiMaskingDepth } from '@/lib/services/llm-providers-service';

// E.164-ish and local phone shapes: 8+ digits with optional +, spaces, dashes.
const PHONE_RE = /(?:\+?\d[\s-]?){8,15}\d/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return raw;
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function maskEmail(raw: string, depth: PiiMaskingDepth): string {
  if (depth === 'strict') return '•••@•••';
  const [local, domain] = raw.split('@');
  return `${local.charAt(0)}•••@${domain}`;
}

export function maskString(value: string, depth: PiiMaskingDepth): string {
  if (depth === 'off') return value;
  return value
    .replace(EMAIL_RE, (m) => maskEmail(m, depth))
    .replace(PHONE_RE, (m) => maskPhone(m));
}

/**
 * Deep-walk any JSON-serializable value, masking every string leaf.
 * Object keys are never masked (they are schema, not data).
 */
export function maskPii<T>(value: T, depth: PiiMaskingDepth): T {
  if (depth === 'off') return value;

  if (typeof value === 'string') {
    return maskString(value, depth) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskPii(item, depth)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = maskPii(inner, depth);
    }
    return out as T;
  }
  return value;
}
