// BSP ADAPTER — Gupshup → internal types
// SERVER ONLY — do not import in client components.
//
// Delete this file when switching to Meta Cloud API direct.
// Replace with: remove the adapter import in route.ts and switch WHATSAPP_BSP=meta

import { normalizeToE164 } from '@/lib/utils/phone';
import type {
  GupshupWebhookPayload,
  GupshupMessagePayload,
  GupshupMessageEventPayload,
  GupshupTextPayload,
  GupshupMediaPayload,
  MetaInboundMessage,
} from '@/lib/types/whatsapp';

// ─────────────────────────────────────────────
// parseGupshupPayload
// Reads body.type and returns a flat array of typed events.
// Unknown event types (user-event, billing-event, system-event) → [].
// ─────────────────────────────────────────────

export function parseGupshupPayload(
  body: GupshupWebhookPayload,
): Array<
  | { type: 'message'; data: GupshupMessagePayload }
  | { type: 'status';  data: GupshupMessageEventPayload }
> {
  if (body.type === 'message') {
    return [{ type: 'message', data: body.payload as GupshupMessagePayload }];
  }

  if (body.type === 'message-event') {
    return [{ type: 'status', data: body.payload as GupshupMessageEventPayload }];
  }

  return [];
}

// ─────────────────────────────────────────────
// adaptGupshupMessage
// Translates a Gupshup message payload into the internal MetaInboundMessage shape.
// Returns null on unexpected payload shape — the route handler skips null results.
// ─────────────────────────────────────────────

export function adaptGupshupMessage(
  payload: GupshupMessagePayload,
): { waId: string; phone: string; message: MetaInboundMessage } | null {
  try {
    // Normalize phone — Gupshup sends "919XXXXXXXXX" without + prefix
    // normalizeToE164 handles this correctly (default country IN)
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeToE164(payload.source);
    } catch {
      normalizedPhone = payload.source.startsWith('+') ? payload.source : `+${payload.source}`;
    }

    const waId  = normalizedPhone;
    const phone = normalizedPhone;

    const message = translateToMetaMessage(payload);

    return { waId, phone, message };
  } catch (err) {
    console.error('[whatsapp-gupshup-adapter] adaptGupshupMessage failed for id:', payload.id, err);
    return null;
  }
}

// ─────────────────────────────────────────────
// adaptGupshupStatus
// Maps Gupshup delivery receipt to internal status vocabulary.
// ─────────────────────────────────────────────

export function adaptGupshupStatus(
  payload: GupshupMessageEventPayload,
): { waMessageId: string; status: 'sent' | 'delivered' | 'read' | 'failed' } {
  const statusMap: Record<
    GupshupMessageEventPayload['type'],
    'sent' | 'delivered' | 'read' | 'failed'
  > = {
    enqueued:  'sent',
    sent:      'sent',
    delivered: 'delivered',
    read:      'read',
    failed:    'failed',
  };

  return {
    waMessageId: payload.id,
    status:      statusMap[payload.type] ?? 'sent',
  };
}

// ─────────────────────────────────────────────
// translateToMetaMessage — internal
// ─────────────────────────────────────────────

function translateToMetaMessage(payload: GupshupMessagePayload): MetaInboundMessage {
  const id        = payload.id;
  const from      = payload.source.startsWith('+') ? payload.source : `+${payload.source}`;
  const timestamp = String(payload.sender?.phone ?? Date.now());

  switch (payload.type) {
    case 'text': {
      const text = (payload.payload as GupshupTextPayload).text ?? '';
      return { type: 'text', id, from, timestamp, text: { body: text } };
    }

    case 'image': {
      const media = payload.payload as GupshupMediaPayload;
      return {
        type: 'image', id, from, timestamp,
        image: { id, mime_type: 'image/jpeg', sha256: '', url: media.url, caption: media.caption },
      };
    }

    case 'video': {
      const media = payload.payload as GupshupMediaPayload;
      return {
        type: 'video', id, from, timestamp,
        video: { id, mime_type: 'video/mp4', sha256: '', url: media.url },
      };
    }

    case 'file': {
      // Gupshup 'file' → our 'document' (mirrors DB CHECK constraint value)
      const media = payload.payload as GupshupMediaPayload;
      return {
        type: 'document', id, from, timestamp,
        document: {
          id,
          mime_type: 'application/octet-stream',
          sha256:    '',
          filename:  media.filename ?? 'file',
          url:       media.url,
        },
      };
    }

    case 'audio': {
      const media = payload.payload as GupshupMediaPayload;
      return {
        type: 'audio', id, from, timestamp,
        audio: { id, mime_type: 'audio/ogg', sha256: '', url: media.url },
      };
    }

    default:
      return {
        type: 'text', id, from, timestamp,
        text: { body: '[Unsupported message type]' },
      };
  }
}
