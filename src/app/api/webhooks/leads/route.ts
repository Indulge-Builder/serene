import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestLead, sanitizeRawPayload } from '@/lib/services/lead-ingestion';
import { notifyLeadAssigned } from '@/lib/services/lead-assignment-notify';
import { LEAD_SOURCES, type LeadSource } from '@/lib/constants/lead-sources';

const LEAD_SOURCES_SET = new Set<string>(LEAD_SOURCES);

// ─────────────────────────────────────────────
// Rate limiting state (in-memory, per worker)
// ─────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

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
        payload: sanitizeRawPayload(payload) as Record<string, unknown>,
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
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // 2. Parse body — log immediately so no payload is ever lost, even on auth failure
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawPayloadId = await logRawPayload(rawPayload, source);

  // 3. Bearer token validation
  const webhookSecret = process.env.PABBLY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== webhookSecret) {
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

  // await so the serverless function stays alive until notifications fire.
  // void + fire-and-forget is killed when the response is sent on Vercel.
  await notifyLeadAssigned({
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
  });

  return NextResponse.json({ leadId: result.leadId }, { status: 201 });
}
