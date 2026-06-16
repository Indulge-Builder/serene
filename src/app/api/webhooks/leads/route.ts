import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRateLimiter, getClientIp, readJsonBody, safeSecretCompare } from '@/lib/utils/webhook';
import { ingestLead, sanitizeRawPayload } from '@/lib/services/lead-ingestion';
import { notifyLeadAssigned } from '@/lib/services/lead-assignment-notify';
import { LEAD_SOURCES, type LeadSource } from '@/lib/constants/lead-sources';
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
    const { data, error } = await supabase
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
// POST /api/webhooks/leads?source=meta|google|website
//
// Order of operations:
//   1. Rate limit check (no body read yet)
//   2. Parse body — log raw payload immediately on success
//   3. Bearer token validation (after logging so auth failures are still recorded)
//   4. Ingest — on failure, mark ingestion_error on the raw log row
// ─────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawSource = request.nextUrl.searchParams.get('source') ?? 'website';
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
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const rawPayload = parsed.body;

  const rawPayloadId = await logRawPayload(rawPayload, source);

  // 3. Bearer token validation
  const webhookSecret = process.env.PABBLY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!safeSecretCompare(token, webhookSecret)) {
    // Payload is already logged — mark it so it's distinguishable from a success
    if (rawPayloadId) {
      const supabase = createAdminClient();
      await supabase
        .from('lead_raw_payloads')
        .update({ ingestion_error: 'unauthorized' })
        .eq('id', rawPayloadId);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 4. Ingest — pass rawPayloadId so ingestLead can backfill lead_id without re-logging
  const result = await ingestLead(rawPayload, source, rawPayloadId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Notifications run in after(): the 201 is flushed to Pabbly immediately while
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
    }).catch((err) => {
      console.error('[webhooks/leads] notifyLeadAssigned failed (non-fatal):', err);
    }),
  );

  return NextResponse.json({ leadId: result.leadId }, { status: 201 });
}
