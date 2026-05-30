// SERVER ONLY — do not import in client components.
// Reads secret env vars at module load. Throws at startup if required vars are missing.

import { createHmac, timingSafeEqual } from 'crypto';
import { WHATSAPP_API_BASE, WHATSAPP_BSP, GUPSHUP_API_BASE } from '@/lib/constants/whatsapp';
import type { MetaApiResponse, TemplateComponent, GupshupApiResponse } from '@/lib/types/whatsapp';

// ─────────────────────────────────────────────
// Env var guard — fail fast at startup
// ─────────────────────────────────────────────

const PHONE_NUMBER_ID      = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN         = process.env.WHATSAPP_ACCESS_TOKEN;
const WEBHOOK_SECRET       = process.env.WHATSAPP_WEBHOOK_SECRET;
const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const BUSINESS_ACCOUNT_ID  = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

// Gupshup-specific env vars — required only when WHATSAPP_BSP=gupshup
const GUPSHUP_API_KEY      = process.env.GUPSHUP_API_KEY;
const GUPSHUP_APP_NAME     = process.env.GUPSHUP_APP_NAME;
const GUPSHUP_SOURCE_PHONE = process.env.GUPSHUP_SOURCE_PHONE;

if (WHATSAPP_BSP === 'gupshup') {
  if (!GUPSHUP_API_KEY || !GUPSHUP_APP_NAME || !GUPSHUP_SOURCE_PHONE) {
    throw new Error(
      '[whatsapp-api] Missing required env vars for Gupshup BSP: GUPSHUP_API_KEY, GUPSHUP_APP_NAME, and GUPSHUP_SOURCE_PHONE must be set.',
    );
  }
} else {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    throw new Error(
      '[whatsapp-api] Missing required env vars: WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set.',
    );
  }
}

// ─────────────────────────────────────────────
// Internal HTTP helper
// ─────────────────────────────────────────────

async function metaFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${WHATSAPP_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    // Never propagate raw API response to callers (S-05)
    throw new Error(`[whatsapp-api] Meta API error: ${res.status} on ${path}`);
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// Send text message
// ─────────────────────────────────────────────

export async function sendTextMessage(
  to:   string,
  text: string,
): Promise<MetaApiResponse> {
  if (WHATSAPP_BSP === 'gupshup') {
    const params = new URLSearchParams({
      channel:     'whatsapp',
      source:      GUPSHUP_SOURCE_PHONE!,
      destination: to.replace(/^\+/, ''), // Gupshup wants digits only, no + prefix
      message:     JSON.stringify({ type: 'text', text }),
      'src.name':  GUPSHUP_APP_NAME!,
    });

    const res = await fetch(`${GUPSHUP_API_BASE}/msg`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        apikey:         GUPSHUP_API_KEY!,
      },
      body: params.toString(),
    });

    if (!res.ok) {
      throw new Error(`[whatsapp-api] Gupshup API error: ${res.status}`);
    }

    const data = (await res.json()) as GupshupApiResponse;

    // Normalise to MetaApiResponse shape so callers are BSP-agnostic
    return {
      messaging_product: 'whatsapp',
      contacts:          [],
      messages:          [{ id: data.messageId ?? '' }],
    };
  }

  return metaFetch<MetaApiResponse>(`/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    }),
  });
}

// ─────────────────────────────────────────────
// Send template message
// ─────────────────────────────────────────────

export async function sendTemplateMessage(
  to:           string,
  templateName: string,
  languageCode: string,
  components:   TemplateComponent[],
): Promise<MetaApiResponse> {
  return metaFetch<MetaApiResponse>(`/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'template',
      template: {
        name:       templateName,
        language:   { code: languageCode },
        components,
      },
    }),
  });
}

// ─────────────────────────────────────────────
// Send media message (image / video / document / audio)
// ─────────────────────────────────────────────

export async function sendMediaMessage(
  to:      string,
  type:    'image' | 'video' | 'document' | 'audio',
  mediaId: string,
  caption?: string,
): Promise<MetaApiResponse> {
  const mediaObject: Record<string, string> = { id: mediaId };
  if (caption && (type === 'image' || type === 'video' || type === 'document')) {
    mediaObject.caption = caption;
  }

  return metaFetch<MetaApiResponse>(`/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type,
      [type]: mediaObject,
    }),
  });
}

// ─────────────────────────────────────────────
// Upload media — returns Meta media_id
// ─────────────────────────────────────────────

export async function uploadMedia(
  buffer:   Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

  const url = `${WHATSAPP_API_BASE}/${PHONE_NUMBER_ID}/media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`[whatsapp-api] Media upload failed: ${res.status}`);
  }

  const json = (await res.json()) as { id: string };
  return json.id;
}

// ─────────────────────────────────────────────
// Get media download URL
// ─────────────────────────────────────────────

export async function getMediaDownloadUrl(mediaId: string): Promise<string> {
  const result = await metaFetch<{ url: string }>(`/${mediaId}`);
  return result.url;
}

// ─────────────────────────────────────────────
// Verify Meta webhook signature (S-12)
// Uses HMAC-SHA256 + timing-safe comparison.
// signatureHeader format: "sha256=<hex_digest>"
// ─────────────────────────────────────────────

export function verifyMetaSignature(
  rawBody:         string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !WEBHOOK_SECRET) return false;

  const [algo, hex] = signatureHeader.split('=');
  if (algo !== 'sha256' || !hex) return false;

  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest();

  const received = Buffer.from(hex, 'hex');

  // timingSafeEqual requires same-length buffers
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

// ─────────────────────────────────────────────
// Expose verify token for GET challenge handler
// ─────────────────────────────────────────────

export { WEBHOOK_VERIFY_TOKEN, BUSINESS_ACCOUNT_ID };
