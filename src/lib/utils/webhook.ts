// Webhook route helpers — SERVER ONLY (imports next/server).
//
// THE JSON parse guard for api/webhooks/* routes (dry-audit M-8). Every webhook
// body parse goes through one of these two functions — never hand-roll the
// try/catch-400 block in a route:
//
//   const parsed = await readJsonBody(request);        // when the raw text isn't needed
//   if (!parsed.ok) return parsed.response;
//
//   const parsed = parseJsonBody<MetaWebhookPayload>(rawBody);  // when the route reads
//   if (!parsed.ok) return parsed.response;                     // req.text() first (HMAC)
//
// Also home to the two other shared ingress guards (security-audit F-4 + polish):
//
//   const isRateLimited = createRateLimiter({ windowMs, max });  // module scope, per route
//   if (isRateLimited(getClientIp(request))) return 429;         // BEFORE reading the body
//
//   safeSecretCompare(incoming, expected)   // timing-safe — never `===` a webhook secret
//
// The other half of the webhook contract is NOT wrapped here by design: every
// route whose after() carries outward network sends must export `maxDuration`
// and use `after()` per the root CLAUDE.md Pattern Note — the two routes have
// genuinely different auth/branching structures, so that stays per-route.

import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

export type JsonBodyResult<T> =
  | { ok: true; body: T }
  | { ok: false; response: NextResponse };

/** Parse an already-read raw body (routes that need the raw text for signature checks). */
export function parseJsonBody<T = unknown>(raw: string): JsonBodyResult<T> {
  try {
    return { ok: true, body: JSON.parse(raw) as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
}

/** Read and parse a request body in one step (routes that don't need the raw text). */
export async function readJsonBody<T = unknown>(request: Request): Promise<JsonBodyResult<T>> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
  return parseJsonBody<T>(raw);
}

// ─────────────────────────────────────────────
// Rate limiting (S-17) — in-memory fixed window, per worker
// ─────────────────────────────────────────────

/**
 * Each route creates its own instance at module scope so the windows are
 * isolated — a burst on one webhook can never starve another. Call the
 * returned check BEFORE reading the request body (drop before amplification).
 */
export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > max;
  };
}

/** First hop of x-forwarded-for (the client, per Vercel's proxy ordering). */
export function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

// ─────────────────────────────────────────────
// Timing-safe secret comparison
// ─────────────────────────────────────────────

/**
 * Constant-time string compare for webhook secrets/tokens — never use `===`.
 * The length pre-check is required (timingSafeEqual throws on unequal lengths);
 * leaking the secret's length is the standard accepted trade-off.
 */
export function safeSecretCompare(
  incoming: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!incoming || !expected) return false;
  const a = Buffer.from(incoming, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
