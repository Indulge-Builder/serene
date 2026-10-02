import { NextRequest, NextResponse, after } from 'next/server';
import { giaDb } from '@/lib/supabase/schemas';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createRateLimiter,
  getClientIp,
  parseJsonBody,
  safeSecretCompare,
  verifyFramerSignature,
} from '@/lib/utils/webhook';
import { ingestLead, sanitizeRawPayload } from '@/lib/services/lead-ingestion';
import { notifyLeadAssigned } from '@/lib/services/lead-assignment-notify';
import { LEAD_SOURCES, type LeadSource } from '@/lib/constants/lead-sources';
import { isGiaDomain } from '@/lib/constants/domains';
import type { JsonValue } from '@/lib/types/database';

const LEAD_SOURCES_SET = new Set<string>(LEAD_SOURCES);

// after() keeps the lambda alive for the WhatsApp notification work AFTER the 201
// is flushed, but only up to maxDuration. The default Vercel timeout can be as low
// as 10–15s; 60s gives ample headroom for the agent + founder Gupshup sends and
// their log inserts without risking the lambda being killed mid-send.
export const maxDuration = 60;

// Rate limiting — in-memory, per worker (shared factory in utils/webhook.ts)
const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 100 });

// Logs the raw payload immediately, before any auth or processing.
// Returns the raw log row id so ingestLead can backfill lead_id or mark an error.
// Never throws — logging must never block the request.
async function logRawPayload(
  payload: unknown,
  source: string,
): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await giaDb(supabase)
      .from('lead_raw_payloads')
      .insert({
        source,
        payload: sanitizeRawPayload(payload) as JsonValue,
        lead_id: null,
        ingestion_error: null,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[webhook/leads] Failed to log raw payload:', error?.message);
      return null;
    }
    return data.id;
  } catch (err) {
    console.error('[webhook/leads] Unexpected error logging raw payload:', err);
    return null;
  }
}

// ─────────────────────────────────────────────
// GET /api/webhooks/leads — health probe
// ─────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'ok' });
}

// ─────────────────────────────────────────────
// POST /api/webhooks/leads?source=meta|google|website|shop_app
//
// Two ways to authenticate, chosen by the sender:
//   - Bearer token (Pabbly: PABBLY_WEBHOOK_SECRET; shop app: SHOP_APP_WEBHOOK_SECRET)
//   - Framer form webhook (the website): a request carrying `Framer-Signature` is
//     verified against FRAMER_WEBHOOK_SECRET and is ALWAYS ingested as source
//     'website'. Framer cannot add headers or hidden fields reliably, so an optional
//     `?domain=<gia domain>` on the URL we paste into Framer pins the lead's domain
//     when the form itself sends none. Requests without the Framer header take the
//     Bearer path exactly as before.
//
// Order of operations:
//   1. Rate limit check (no body read yet)
//   2. Parse body — log raw payload immediately on success
//   3. Bearer token validation (after logging so auth failures are still recorded)
//   4. Ingest — on failure, mark ingestion_error on the raw log row
// ─────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const framerSignature = request.headers.get('framer-signature');
  const isFramer = framerSignature !== null;

  const rawSource = isFramer ? 'website' : (request.nextUrl.searchParams.get('source') ?? 'website');
  let source: LeadSource;
  if (LEAD_SOURCES_SET.has(rawSource)) {
    source = rawSource as LeadSource;
  } else {
    console.warn(`[webhook/leads] Unknown source param "${rawSource}", defaulting to "website"`);
    source = 'website';
  }

  // 1. Rate limit — drop before reading body to avoid amplification
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // 2. Parse body — log immediately so no payload is ever lost, even on auth failure
  //    The raw text is kept: the Framer signature is an HMAC over the exact bytes.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = parseJsonBody(rawBody);
  if (!parsed.ok) return parsed.response;
  const rawPayload = parsed.body;

  const rawPayloadId = await logRawPayload(rawPayload, source);

  // 3. Bearer token validation — one secret PER SENDER, not one per endpoint.
  //    The shop app is a different organisation's deployment on different
  //    infrastructure; sharing Pabbly's token would mean a leak on either side
  //    forces a rotation that breaks the other. Both are compared timing-safe.
  //    Framer signs instead of sending a token, with its own secret, so a leak on
  //    the website side never forces a Pabbly or shop rotation either.
  const webhookSecret = isFramer
    ? process.env.FRAMER_WEBHOOK_SECRET
    : source === 'shop_app'
      ? process.env.SHOP_APP_WEBHOOK_SECRET
      : process.env.PABBLY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(
      `[webhook/leads] No webhook secret configured for ${isFramer ? 'Framer' : `source "${source}"`}`,
    );
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  let authorized: boolean;
  if (isFramer) {
    authorized = verifyFramerSignature(
      rawBody,
      request.headers.get('framer-webhook-submission-id'),
      framerSignature,
      webhookSecret,
    );
  } else {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    authorized = safeSecretCompare(token, webhookSecret);
  }
  if (!authorized) {
    // Payload is already logged — mark it so it's distinguishable from a success
    if (rawPayloadId) {
      const supabase = createAdminClient();
      await giaDb(supabase)
        .from('lead_raw_payloads')
        .update({ ingestion_error: 'unauthorized' })
        .eq('id', rawPayloadId);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 4. Ingest — pass rawPayloadId so ingestLead can backfill lead_id without re-logging
  //    A Framer form with no `domain` field takes the URL's ?domain= (a Gia domain
  //    only; anything else is ignored and the usual campaign/default rule applies).
  //    The raw log above keeps the payload exactly as it arrived.
  let ingestPayload: unknown = rawPayload;
  if (isFramer && rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)) {
    const body = rawPayload as Record<string, unknown>;
    const urlDomain = request.nextUrl.searchParams.get('domain');
    if (!body.domain && urlDomain && isGiaDomain(urlDomain)) {
      ingestPayload = { ...body, domain: urlDomain };
    }
  }

  const result = await ingestLead(ingestPayload, source, rawPayloadId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // A REDELIVERY notifies nobody. The shop retries delivery 3 times automatically
  // (1s/4s/9s backoff) plus unlimited manual retries, all carrying the same lead id.
  // Without this guard one enquiry would ping the assigned agent on every attempt.
  // Nothing new happened, so nothing is announced — the 200 just tells the sender to
  // stop retrying.
  if (result.enquiry === 'duplicate') {
    return NextResponse.json({ leadId: result.leadId, duplicate: true }, { status: 200 });
  }

  // A new enquiry on a lead that already exists is a repeat enquiry: same human,
  // different product. In-app only, no WhatsApp, no SLA re-arm.
  const isRepeatEnquiry = result.is_duplicate && result.enquiry === 'new';

  // Notifications run in after(): the 201 is flushed to the sender immediately while
  // Vercel keeps the lambda alive until notifyLeadAssigned's awaited Gupshup sends
  // settle. A bare `await` here would delay the webhook response by the send time;
  // a bare `void`/fire-and-forget would be killed when the lambda freezes. after()
  // is the only construct that satisfies both. notifyLeadAssigned awaits its sends
  // internally (see lead-assignment-notify.ts header), so this captures completion.
  after(
    notifyLeadAssigned({
      leadId:      result.leadId,
      assignedTo:  result.assigned_to,
      agentName:   result.agent_name,
      leadName:    result.lead_name,
      leadPhone:   result.lead_phone,
      domain:      result.domain,
      isNew:       !result.is_duplicate,
      isDuplicate: result.is_duplicate,
      actorId:     null,
      scheduleSla: !result.is_duplicate,
      repeatEnquiry: isRepeatEnquiry
        ? { productName: result.enquiry_product_name }
        : null,
    }).catch((err) => {
      console.error('[webhooks/leads] notifyLeadAssigned failed (non-fatal):', err);
    }),
  );

  return NextResponse.json({ leadId: result.leadId }, { status: 201 });
}
