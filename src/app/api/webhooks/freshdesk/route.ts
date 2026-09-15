// Freshdesk webhook — the near-real-time path into the freshdesk.* mirror (migration 0193).
//
// Freshdesk automation rules (registered by scripts/freshdesk/register-webhooks.ts) POST a
// tiny JSON here on ticket creation and on ticket updates, with a shared secret in the
// `x-freshdesk-webhook-secret` header. The payload is treated as a NOTIFICATION, never as
// data: the route stores it in freshdesk.webhook_events, acks 200 immediately, and then
// (inside after()) re-reads the ticket from the Freshdesk API and runs the same upsert +
// thread pull the minute poll runs. A missed webhook is repaired by the poll.
//
// Route contract (api/webhooks/CLAUDE.md): rate limit before the body read, readJsonBody,
// safeSecretCompare, after() with the work awaited, maxDuration for the post-response work.

import { NextResponse, after } from 'next/server';
import { createRateLimiter, getClientIp, readJsonBody, safeSecretCompare } from '@/lib/utils/webhook';
import { freshdeskDb, processWebhookEvent } from '@/lib/services/freshdesk-sync';

export const maxDuration = 60;

// Freshdesk fires one POST per matching event; 120/min is far above the ~150 tickets a
// day this account sees, with room for a burst of status flips.
const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 120 });

const KNOWN_EVENTS = new Set(['ticket_created', 'ticket_updated', 'ticket_deleted']);

type FreshdeskWebhookPayload = {
  event?: unknown;
  ticket_id?: unknown;
  [key: string]: unknown;
};

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

export async function POST(request: Request) {
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const secret = process.env.FRESHDESK_WEBHOOK_SECRET ?? '';
  if (!secret) {
    console.error('[freshdesk-webhook] FRESHDESK_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const provided = request.headers.get('x-freshdesk-webhook-secret') ?? '';
  if (!safeSecretCompare(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await readJsonBody<FreshdeskWebhookPayload>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body ?? {};

  const ticketId = Number(body.ticket_id);
  const event = typeof body.event === 'string' && KNOWN_EVENTS.has(body.event) ? body.event : 'unknown';
  if (!Number.isFinite(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: 'ticket_id required' }, { status: 400 });
  }

  const { data, error } = await freshdeskDb()
    .from('webhook_events')
    .insert({ event, ticket_id: ticketId, payload: body as Record<string, unknown> })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[freshdesk-webhook] could not store event', error?.message);
    return NextResponse.json({ error: 'Storage failed' }, { status: 500 });
  }
  const eventId = (data as { id: number }).id;

  after(
    processWebhookEvent(eventId, ticketId, event).catch((err) =>
      console.error('[freshdesk-webhook] processing failed (non-fatal):', err),
    ),
  );

  return NextResponse.json({ status: 'accepted', id: eventId });
}
