// WhatsApp webhook — inbound messages and delivery receipts.
// GET  — Meta hub challenge verification (Gupshup also uses this for URL verification).
// POST — Dual-format: Gupshup v2 (active BSP) or Meta v3 (dormant, kept for future use).

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { WEBHOOK_VERIFY_TOKEN, verifyMetaSignature } from '@/lib/services/whatsapp-api';
import { parseWebhookPayload, processInboundMessage, processStatusUpdate } from '@/lib/services/whatsapp-ingestion';
import type { MetaInboundMessage, MetaWebhookPayload } from '@/lib/types/whatsapp';

// ─────────────────────────────────────────────
// Gupshup secret — resolved once at module load
// ─────────────────────────────────────────────

const GUPSHUP_WEBHOOK_SECRET = process.env.GUPSHUP_WEBHOOK_SECRET ?? '';

// ─────────────────────────────────────────────
// Timing-safe Gupshup secret check
// ─────────────────────────────────────────────

function verifyGupshupSecret(incoming: string): boolean {
  if (!GUPSHUP_WEBHOOK_SECRET || !incoming) return false;
  const a = Buffer.from(incoming,              'utf8');
  const b = Buffer.from(GUPSHUP_WEBHOOK_SECRET, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─────────────────────────────────────────────
// GET — Meta hub challenge (unchanged for both BSPs)
// ─────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('OK', { status: 200 });
}

// ─────────────────────────────────────────────
// POST — inbound events (BSP-branched)
// ─────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  // ── Gupshup v2 path ──────────────────────────
  const gupshupSecret = req.headers.get('x-gupshup-secret');
  if (gupshupSecret !== null) {
    if (!verifyGupshupSecret(gupshupSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Delivery receipts and billing pings — acknowledge, no processing
    if (body.type === 'message-event' || body.type === 'billing-event') {
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    if (body.type === 'message') {
      const response = NextResponse.json({ status: 'ok' }, { status: 200 });

      void (async () => {
        try {
          const payload  = body.payload as Record<string, unknown>;
          const inner    = payload.payload as Record<string, unknown>;
          const messageId = payload.id as string;
          const phone     = `+${payload.source as string}`;
          const waId      = payload.source as string;

          const message: MetaInboundMessage = {
            type:      'text',
            id:        messageId,
            from:      waId,
            timestamp: String(Date.now()),
            text:      { body: inner.text as string },
          };

          await processInboundMessage(waId, phone, message);
        } catch (err) {
          console.error('[whatsapp/webhook] Gupshup processing error:', err);
        }
      })();

      return response;
    }

    // Unknown Gupshup event type — acknowledge
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  // ── Meta v3 path (dormant — kept for when Meta credentials arrive) ──
  const signature = req.headers.get('x-hub-signature-256');
  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: MetaWebhookPayload;
  try {
    body = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Respond immediately — Meta requires a 200 within 5s
  const response = NextResponse.json({ status: 'ok' }, { status: 200 });

  void (async () => {
    try {
      const events = parseWebhookPayload(body);

      for (const event of events) {
        if (event.type === 'message') {
          await processInboundMessage(event.waId, event.phone, event.data);
        } else if (event.type === 'status') {
          await processStatusUpdate(event.data.id, event.data.status);
        }
      }
    } catch (err) {
      console.error('[whatsapp/webhook] Meta processing error:', err);
    }
  })();

  return response;
}
