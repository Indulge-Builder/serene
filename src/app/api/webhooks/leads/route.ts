import { NextRequest, NextResponse } from 'next/server';
import { ingestLead } from '@/lib/services/lead-ingestion';

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

// ─────────────────────────────────────────────
// GET /api/webhooks/leads — health probe
// ─────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'ok' });
}

// ─────────────────────────────────────────────
// POST /api/webhooks/leads?source=meta|google|website
// Rule S-12: validate Bearer token before reading payload
// Rule S-17: rate limiting applied
// ─────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // 2. Bearer token validation — BEFORE reading the body (Rule S-12)
  const webhookSecret = process.env.PABBLY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. Parse body
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 4. Resolve source adapter (defaults to website)
  const source = request.nextUrl.searchParams.get('source') ?? 'website';

  // 5. Ingest
  const result = await ingestLead(rawPayload, source);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ leadId: result.leadId }, { status: 201 });
}
