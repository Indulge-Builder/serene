// WhatsApp webhook — inbound messages and delivery receipts.
// GET  — Meta hub challenge verification (Gupshup also uses this for URL verification).
// POST — Dual-format: Gupshup v2 (active BSP) or Meta v3 (dormant, kept for future use).

import { NextRequest, NextResponse, after } from 'next/server';
import { WEBHOOK_VERIFY_TOKEN, verifyMetaSignature } from '@/lib/services/whatsapp-api';
import { createRateLimiter, getClientIp, parseJsonBody, safeSecretCompare } from '@/lib/utils/webhook';
import { parseWebhookPayload, processInboundMessage, processStatusUpdate } from '@/lib/services/whatsapp-ingestion';
import { tryHandleElayaWhatsAppMessage } from '@/lib/services/elaya-whatsapp';
import type { MetaInboundMessage, MetaMediaObject, MetaWebhookPayload } from '@/lib/types/whatsapp';

// ─────────────────────────────────────────────
// Gupshup secret — resolved once at module load
// ─────────────────────────────────────────────

const GUPSHUP_WEBHOOK_SECRET = process.env.GUPSHUP_WEBHOOK_SECRET ?? '';

// processInboundMessage runs inside after() and now awaits notifyLeadAssigned's
// Gupshup sends. Give the lambda headroom (default Vercel timeout can be 10–15s)
// so a new-number lead's agent + founder notifications complete before freeze.
// The Elaya staff branch also runs its full brain turn (model + tools) inside
// the same after() — 60s matches the /api/elaya/chat budget.
export const maxDuration = 60;

// Rate limiting (security-audit F-4) — in-memory, per worker (shared factory in
// utils/webhook.ts). Cap is 3× the leads route's: legitimate Gupshup traffic is
// burstier — every outbound message can produce up to 3 delivery-receipt POSTs
// (sent/delivered/read) on top of inbound messages and billing pings, all from
// Gupshup's egress IPs. A 429 only triggers a BSP retry, but headroom means
// real traffic is never throttled.
const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 300 });

// ─────────────────────────────────────────────
// buildGupshupMessage — Gupshup inner payload → MetaInboundMessage
//
// Gupshup media (image/video/document/audio) arrives as a direct CDN url on
// `inner.url` (+ inner.contentType / inner.caption / inner.name) — NOT a Meta
// media-id, so the media object carries `url` and the ingestion path skips the
// Meta getMediaDownloadUrl fetch. Gupshup names the document type `file`; Meta
// names it `document`. text/audio are preserved exactly as before. Anything we
// can't render (sticker/location/contact/reaction/button/list reply) becomes a
// labelled text message so it is never stored blank.
// ─────────────────────────────────────────────

function buildGupshupMessage(
  innerType: string,
  inner:     Record<string, unknown>,
  messageId: string,
  waId:      string,
): MetaInboundMessage {
  const timestamp = String(Date.now());
  const url       = typeof inner.url === 'string' ? inner.url : null;
  const caption   = typeof inner.caption === 'string' ? inner.caption : undefined;
  const filename  = typeof inner.name === 'string' ? inner.name : undefined;
  const mimeType  = typeof inner.contentType === 'string' ? inner.contentType : '';

  const media = (fallbackMime: string): MetaMediaObject => ({
    id:        messageId,
    url:       url ?? '',
    mime_type: mimeType || fallbackMime,
    sha256:    '',
    ...(caption ? { caption } : {}),
    ...(filename ? { filename } : {}),
  });

  // Media types only map to a media message when a url is actually present;
  // otherwise they fall through to the labelled-text fallback below.
  if (url) {
    if (innerType === 'image') return { type: 'image',    id: messageId, from: waId, timestamp, image:    media('image/jpeg') };
    if (innerType === 'video') return { type: 'video',    id: messageId, from: waId, timestamp, video:    media('video/mp4') };
    if (innerType === 'audio') return { type: 'audio',    id: messageId, from: waId, timestamp, audio:    media('audio/ogg') };
    if (innerType === 'file' || innerType === 'document')
      return { type: 'document', id: messageId, from: waId, timestamp, document: media('application/octet-stream') };
  }

  if (innerType === 'text') {
    return { type: 'text', id: messageId, from: waId, timestamp, text: { body: typeof inner.text === 'string' ? inner.text : '' } };
  }

  // Un-renderable type (sticker/location/contact/reaction/button/list reply) or a
  // media type that arrived without a url: store a human label so the bubble is
  // never blank and Elaya's empty-content guard isn't hit accidentally.
  return {
    type:      'text',
    id:        messageId,
    from:      waId,
    timestamp,
    text:      { body: GUPSHUP_TYPE_LABELS[innerType] ?? '[Unsupported message]' },
  };
}

const GUPSHUP_TYPE_LABELS: Record<string, string> = {
  sticker:      '[Sticker]',
  location:     '[Location]',
  contact:      '[Contact card]',
  reaction:     '[Reaction]',
  button_reply: '[Button reply]',
  list_reply:   '[List reply]',
};

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
  // Rate limit — drop before reading body to avoid amplification (F-4)
  if (isRateLimited(getClientIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const rawBody = await req.text();

  // ── Gupshup v2 path ──────────────────────────
  const gupshupSecret = req.headers.get('x-gupshup-secret');
  if (gupshupSecret !== null) {
    if (!safeSecretCompare(gupshupSecret, GUPSHUP_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = parseJsonBody<Record<string, unknown>>(rawBody);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    // Delivery receipts and billing pings — acknowledge, no processing
    if (body.type === 'message-event' || body.type === 'billing-event') {
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    if (body.type === 'message') {
      after(async () => {
        try {
          const payload   = body.payload as Record<string, unknown>;
          const sender    = payload.sender as Record<string, unknown> | undefined;
          const inner     = payload.payload as Record<string, unknown>;
          const innerType = typeof payload.type === 'string' ? payload.type : 'text';
          const messageId = payload.id as string;
          const phone     = `+${payload.source as string}`;
          const waId      = payload.source as string;
          const senderName = (typeof sender?.name === 'string' ? sender.name.trim() : null) || null;

          // TEMP DEBUG (remove once inbound media field shapes are confirmed): log
          // the raw Gupshup inner payload for any non-text/non-audio inbound message
          // so the first real image/video/pdf reveals the exact field names
          // (inner.url / contentType / caption / name) the mapper expects. Gated on
          // WHATSAPP_DEBUG_MEDIA so it never spams prod logs unless explicitly on.
          if (
            process.env.WHATSAPP_DEBUG_MEDIA === 'true' &&
            innerType !== 'text' &&
            innerType !== 'audio'
          ) {
            console.log(
              `[whatsapp/webhook] DEBUG inbound type="${innerType}" inner=`,
              JSON.stringify(inner),
            );
          }

          // Gupshup delivers media (image/video/document/audio) as a payload with a
          // direct, time-limited CDN url (inner.url + inner.contentType + optional
          // inner.caption/inner.name) — NOT a Meta media-id token, so no
          // getMediaDownloadUrl fetch is needed (the ingestion path uses inner.url
          // directly). Build the matching MetaInboundMessage so both the Elaya gate
          // and the lead pipeline see the real type. text/audio shapes are preserved
          // byte-identically (Elaya reads body / transcribes audio unchanged). Truly
          // un-renderable types (sticker/location/contact/reaction/button replies)
          // fall through to a labelled text message so they never store as blank.
          const message: MetaInboundMessage = buildGupshupMessage(
            innerType,
            inner,
            messageId,
            waId,
          );

          // Routing gate: sender number matches an active profile → Elaya
          // (staff channel); otherwise the existing lead pipeline, unchanged.
          const handledByElaya = await tryHandleElayaWhatsAppMessage(phone, message);
          if (!handledByElaya) {
            await processInboundMessage(waId, phone, message, senderName);
          }
        } catch (err) {
          console.error('[whatsapp/webhook] Gupshup processing error:', err);
        }
      });

      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    // Unknown Gupshup event type — acknowledge
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  // ── Meta v3 path (dormant — kept for when Meta credentials arrive) ──
  const signature = req.headers.get('x-hub-signature-256');
  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsedMeta = parseJsonBody<MetaWebhookPayload>(rawBody);
  if (!parsedMeta.ok) return parsedMeta.response;
  const body = parsedMeta.body;

  after(async () => {
    try {
      // Build waId → sender name map from contacts array before flattening events
      const nameByWaId = new Map<string, string>();
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const contact of change.value.contacts ?? []) {
            const name = contact.profile?.name?.trim();
            if (name) nameByWaId.set(contact.wa_id, name);
          }
        }
      }

      const events = parseWebhookPayload(body);

      for (const event of events) {
        if (event.type === 'message') {
          // Same routing gate as the Gupshup path: staff → Elaya, else leads.
          const handledByElaya = await tryHandleElayaWhatsAppMessage(event.phone, event.data);
          if (handledByElaya) continue;
          const senderName = nameByWaId.get(event.waId) ?? null;
          await processInboundMessage(event.waId, event.phone, event.data, senderName);
        } else if (event.type === 'status') {
          await processStatusUpdate(event.data.id, event.data.status);
        }
      }
    } catch (err) {
      console.error('[whatsapp/webhook] Meta processing error:', err);
    }
  });

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
