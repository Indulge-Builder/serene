// THE Elaya SSE frame vocabulary + reader (R-01 — one parser, never forked).
//
// Both Elaya brains speak the same wire: `data: {json}\n\n` frames of type
// meta / delta / tool / done / error. This module owns the frame types and the
// byte-stream → event loop. Two consumers pump it:
//   • the browser transport (components/elaya/elaya-stream.ts) reading
//     POST /api/elaya/chat, and
//   • the server-side Python-brain client (lib/elaya/python-brain.ts) reading
//     the FastAPI brain's /v1/elaya/chat on behalf of the WhatsApp gate.
// It is runtime-neutral (web streams + TextDecoder only — no React, no Node
// APIs), so it is safe in a 'use client' module and in a server action alike.

export type ElayaSseEvent =
  | {
      type: 'meta';
      conversationId: string;
      remainingToday: number;
      /** This message's ordinal today (Python brain only; absent on the Node route). */
      messagesToday?: number;
    }
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; messageId: string | null; specialist?: string | null; toolsUsed?: string[]; playbook?: { id: string; title: string } | null }
  | { type: 'error'; message: string };

/**
 * Pump a `text/event-stream` body to completion, dispatching one callback per
 * well-formed `data:` frame. Malformed frames are skipped (never thrown);
 * unknown event types are passed through untouched so a newer brain can add
 * fields without breaking an older reader. A network-level read failure DOES
 * reject — the caller owns that recovery.
 */
export async function readElayaSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ElayaSseEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      if (!frame.startsWith('data: ')) continue;
      let event: ElayaSseEvent;
      try {
        event = JSON.parse(frame.slice(6)) as ElayaSseEvent;
      } catch {
        continue;
      }
      if (!event || typeof event !== 'object' || typeof event.type !== 'string') continue;
      onEvent(event);
    }
  }
}
