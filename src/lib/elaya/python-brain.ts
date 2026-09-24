// SERVER ONLY — THE Node → Python-brain transport (Step 3, channel tranche 2026-08-31).
//
// The Python brain (backend/app, the Fargate `api` service) exposes the SAME SSE
// wire as /api/elaya/chat. This module is the one place Node speaks to it:
// bearer auth with the shared BRAIN_API_SECRET, the request shape, the frame
// pump (lib/elaya/sse.ts — the browser transport's own parser), and the
// mapping of its rejections onto a small, typed outcome the caller can act on
// without ever seeing HTTP. Two callers: the WhatsApp staff gate
// (services/elaya-whatsapp.ts) pumps a whole turn via runPythonBrainTurn; the
// in-app route (/api/elaya/chat) opens the raw stream via openPythonBrainStream
// and proxies the frames to the browser. Never a second client.
//
// Trust posture: the bearer is a server secret (S-11) and the brain
// re-verifies the user id against public.profiles before any model runs, so
// this client passes ONLY an id it has already resolved from a verified source
// (the phone-matched active profile). Never a request-supplied user id.
//
// Transport security: ELAYA_BRAIN_URL must be an https:// origin in production
// (the CloudFront front on the brain's load balancer) — the bearer and staff
// message text cross the public internet on this hop. A plain http:// URL is
// refused outside development, by construction.

import { readElayaSseStream, type ElayaSseEvent } from '@/lib/elaya/sse';
import type { ElayaChannel } from '@/lib/types/elaya';

/** Whole-turn budget. The WhatsApp webhook lambda has 180s; voice transcription
 *  (≤15s) and the reply send must still fit after this. */
const DEFAULT_TIMEOUT_MS = 120_000;

export type PythonBrainTurnInput = {
  /** A VERIFIED profile id (phone-matched / session-resolved) — never request input. */
  userId: string;
  /** Already sanitised text (the caller runs sanitizeText + its length bound). */
  message: string;
  channel: ElayaChannel;
  /** WhatsApp only — the Gupshup message id (the brain's dedup key). */
  waMessageId?: string;
  /** WhatsApp only — the message was a voice note, transcribed (stored in the row's meta). */
  voice?: boolean;
  /** Continue a specific owned conversation; omitted → the active 24h session. */
  conversationId?: string;
};

export type PythonBrainTurnResult =
  | {
      ok: true;
      /** The full assistant text (resolver line + model prose), raw markdown. */
      text: string;
      conversationId: string | null;
      /** The persisted assistant row id (null if the brain could not save it). */
      messageId: string | null;
      toolsUsed: string[];
      /** This message's ordinal today — for the learned-memory throttle; 0 when unknown. */
      messagesToday: number;
    }
  | {
      ok: false;
      reason:
        | 'unconfigured' // ELAYA_BRAIN_URL / BRAIN_API_SECRET missing (or http:// in prod)
        | 'cap' // 429 — the shared daily cap; nothing persisted
        | 'duplicate' // 409 — the wa_message_id already ran (BSP redelivery)
        | 'unauthorized' // 401/403 — secret drift or an unknown/inactive user
        | 'unavailable'; // network / 5xx / timeout / mid-stream error frame
      /** Text collected BEFORE a mid-stream error frame (may confirm an executed action). */
      partialText?: string;
      status?: number;
    };

/** A pre-flight rejection — the brain refused the turn before any frame streamed. */
export type PythonBrainRejection = {
  ok: false;
  reason:
    | 'unconfigured' // ELAYA_BRAIN_URL / BRAIN_API_SECRET missing (or http:// in prod)
    | 'cap' // 429 — the shared daily cap; nothing persisted
    | 'duplicate' // 409 — the wa_message_id already ran (BSP redelivery)
    | 'unauthorized' // 401/403 — secret drift or an unknown/inactive user
    | 'not_found' // 404 — a supplied conversation id that isn't the caller's (S-06)
    | 'unavailable'; // network / 5xx — the fetch itself failed
  status?: number;
};

export type PythonBrainOpenStream = {
  ok: true;
  /** The brain's live SSE bytes — pump with readElayaSseStream (sse.ts). */
  stream: ReadableStream<Uint8Array>;
  /** Clears the whole-turn abort timer — call in `finally` once the pump ends. */
  release: () => void;
};

function brainBaseUrl(): string | null {
  const raw = process.env.ELAYA_BRAIN_URL?.trim();
  if (!raw) return null;
  const url = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) return null;
  if (url.startsWith('http://') && process.env.NODE_ENV === 'production') {
    // The bearer + staff text must never cross the internet in cleartext.
    console.error('[python-brain] ELAYA_BRAIN_URL must be https:// in production — refusing');
    return null;
  }
  return url;
}

/** True when Node can reach the Python brain (URL + secret present and sane). */
export function isPythonBrainConfigured(): boolean {
  return brainBaseUrl() !== null && Boolean(process.env.BRAIN_API_SECRET?.trim());
}

/**
 * Open ONE turn on the Python brain and hand back its live SSE stream once the
 * pre-flight (HTTP status) checks pass — the in-app route proxies these frames
 * to the browser verbatim. Rejections come back typed BEFORE any frame, so the
 * caller can still answer with plain JSON (cap 429 → the capReached shape the
 * browser transport already handles). Never fetch the brain anywhere else —
 * runPythonBrainTurn composes this open + the pump.
 */
export async function openPythonBrainStream(
  input: PythonBrainTurnInput,
  opts: { timeoutMs?: number } = {},
): Promise<PythonBrainOpenStream | PythonBrainRejection> {
  const base = brainBaseUrl();
  const secret = process.env.BRAIN_API_SECRET?.trim();
  if (!base || !secret) return { ok: false, reason: 'unconfigured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${base}/v1/elaya/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        user_id: input.userId,
        message: input.message,
        channel: input.channel,
        conversation_id: input.conversationId ?? null,
        wa_message_id: input.waMessageId ?? null,
        voice: input.voice ?? false,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // D-05: the failure shape only — never the message text.
    console.error(
      '[python-brain] turn transport failed:',
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
    return { ok: false, reason: 'unavailable' };
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const status = res.status;
    if (status === 429) return { ok: false, reason: 'cap', status };
    if (status === 409) return { ok: false, reason: 'duplicate', status };
    if (status === 401 || status === 403) return { ok: false, reason: 'unauthorized', status };
    if (status === 404) return { ok: false, reason: 'not_found', status };
    return { ok: false, reason: 'unavailable', status };
  }

  return { ok: true, stream: res.body, release: () => clearTimeout(timer) };
}

/**
 * Run ONE turn on the Python brain and pump its stream to completion.
 * Never throws for server-shaped failures — every rejection maps to a typed
 * `ok: false` reason so the caller picks the user-facing copy. `onEvent`
 * receives every frame (the in-app proxy pipes them through).
 */
export async function runPythonBrainTurn(
  input: PythonBrainTurnInput,
  opts: { onEvent?: (event: ElayaSseEvent) => void; timeoutMs?: number } = {},
): Promise<PythonBrainTurnResult> {
  const opened = await openPythonBrainStream(input, { timeoutMs: opts.timeoutMs });
  if (!opened.ok) {
    if (opened.reason === 'not_found') {
      // Only reachable with a supplied conversationId — the WhatsApp caller never
      // sends one, so this collapses onto the generic failure copy.
      return { ok: false, reason: 'unavailable', status: opened.status };
    }
    return { ok: false, reason: opened.reason, status: opened.status };
  }

  let text = '';
  let conversationId: string | null = null;
  let messageId: string | null = null;
  let messagesToday = 0;
  const toolsUsed: string[] = [];
  let errorFrame: string | null = null;

  try {
    await readElayaSseStream(opened.stream, (event) => {
      opts.onEvent?.(event);
      if (event.type === 'meta') {
        conversationId = event.conversationId;
        if (typeof event.messagesToday === 'number') messagesToday = event.messagesToday;
      } else if (event.type === 'delta') {
        text += event.text;
      } else if (event.type === 'tool') {
        toolsUsed.push(event.name);
      } else if (event.type === 'done') {
        messageId = event.messageId;
      } else if (event.type === 'error') {
        errorFrame = event.message;
      }
    });
  } catch (err) {
    // D-05: the failure shape only — never the message text.
    console.error(
      '[python-brain] turn transport failed:',
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
    return { ok: false, reason: 'unavailable', partialText: text || undefined };
  } finally {
    opened.release();
  }

  if (errorFrame !== null) {
    console.error('[python-brain] brain reported a turn error:', errorFrame);
    return { ok: false, reason: 'unavailable', partialText: text || undefined };
  }

  return { ok: true, text, conversationId, messageId, toolsUsed, messagesToday };
}
