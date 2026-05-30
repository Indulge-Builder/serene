// WhatsApp webhook — inbound messages and delivery receipts.
// GET  — Meta hub challenge verification (used when switching to Meta Cloud API direct).
// POST — BSP-branched: Gupshup (current) or Meta Cloud API direct (future).

import { NextRequest, NextResponse } from 'next/server';
import { WHATSAPP_BSP } from '@/lib/constants/whatsapp';
import { WEBHOOK_VERIFY_TOKEN, verifyMetaSignature } from '@/lib/services/whatsapp-api';
import { parseWebhookPayload, processInboundMessage, processStatusUpdate } from '@/lib/services/whatsapp-ingestion';
import { parseGupshupPayload, adaptGupshupMessage, adaptGupshupStatus } from '@/lib/services/whatsapp-gupshup-adapter';
import type { MetaWebhookPayload } from '@/lib/types/whatsapp';
import type { GupshupWebhookPayload } from '@/lib/types/whatsapp';

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

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ─────────────────────────────────────────────
// POST — inbound events (BSP-branched)
// ─────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bsp = WHATSAPP_BSP;

  // ── Gupshup path ──────────────────────────────────────────────────────────
  if (bsp === 'gupshup') {
    const token = req.headers.get('authorization');
    if (!token || token !== process.env.GUPSHUP_WEBHOOK_TOKEN) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const rawBody = await req.text();

    let body: GupshupWebhookPayload;
    try {
      body = JSON.parse(rawBody) as GupshupWebhookPayload;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate minimum required shape
    if (
      typeof body.app !== 'string' ||
      typeof body.type !== 'string' ||
      body.payload === null ||
      typeof body.payload !== 'object'
    ) {
      return NextResponse.json({ error: 'Invalid payload shape' }, { status: 400 });
    }

    // Respond immediately — Gupshup does not enforce Meta's 5s rule, but fast response is correct.
    const response = NextResponse.json({ status: 'ok' }, { status: 200 });

    // Process asynchronously after returning — do not await
    void (async () => {
      try {
        const events = parseGupshupPayload(body);

        for (const event of events) {
          if (event.type === 'message') {
            const adapted = adaptGupshupMessage(event.data);
            if (!adapted) continue; // malformed payload — logged in adapter, skip silently
            await processInboundMessage(adapted.waId, adapted.phone, adapted.message);
          } else if (event.type === 'status') {
            const { waMessageId, status } = adaptGupshupStatus(event.data);
            await processStatusUpdate(waMessageId, status);
          }
        }
      } catch (err) {
        console.error('[whatsapp/webhook] Gupshup processing error:', err);
      }
    })();

    return response;
  }

  // ── Meta Cloud API direct path ────────────────────────────────────────────
  const rawBody = await req.text();
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
