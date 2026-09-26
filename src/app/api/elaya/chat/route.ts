// POST /api/elaya/chat — THE Elaya streaming endpoint (SSE).
//
// Sanctioned P-02 exception (Decision Log 2026-06-12): Server Actions cannot
// stream; Elaya chat requires token-level streaming, so this one route exists.
// It is session-authenticated (getCurrentProfile — A-01), not a webhook: the
// auth gate replaces a secret compare; createRateLimiter guards bursts (S-17).
//
// Server-enforced gates, in order, all before any model call:
//   1. session + active profile        → 401
//   2. per-IP burst rate limit         → 429
//   3. Zod validation (S-01)           → 400 (formErrors copy, never raw Zod)
//   4. daily message cap (config row)  → 429 — message N where N > cap never
//      reaches the model and is never persisted. Client UI state is cosmetic.

import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { hasElayaAccess } from '@/lib/utils/route-access';
import { resolveStaffPrincipal } from '@/lib/elaya/principal';
import { runElayaTurn } from '@/lib/elaya/brain';
import { learnFromTurn } from '@/lib/elaya/memory';
import {
  countUserMessagesToday,
  getOrCreateActiveConversation,
  getOwnedConversation,
  insertAssistantMessage,
  insertUserMessage,
  touchConversation,
} from '@/lib/services/elaya-service';
import {
  getDailyMessageCap,
  getElayaBrainForChannel,
  getSessionExpiryHours,
} from '@/lib/services/llm-providers-service';
import { isPythonBrainConfigured, openPythonBrainStream } from '@/lib/elaya/python-brain';
import { readElayaSseStream, type ElayaSseEvent } from '@/lib/elaya/sse';
import { ElayaChatRequestSchema } from '@/lib/validations/elaya-schema';
import { formErrors } from '@/lib/validations/form-errors';
import { sanitizeText } from '@/lib/utils/sanitize';
import { createRateLimiter, readJsonBody } from '@/lib/utils/webhook';

// The lambda must outlive the full stream (model turn + tool round-trips). Set to
// 180s so a genuinely long, multi-step turn (several tool look-ups over larger data)
// has room to finish instead of being killed mid-stream at 60s. This is a Vercel
// wall-clock budget only — it does NOT change Claude billing (Anthropic bills tokens,
// not time) and does NOT make Elaya do more work; it just lets a turn that was
// already going to use those tokens actually complete. The per-call 30s timeout +
// 1 retry in the Anthropic adapter still catches a single stalled call underneath.
export const maxDuration = 180;

const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 20 });

const encoder = new TextEncoder();

// One frame vocabulary for both brains — lib/elaya/sse.ts (R-01). The Node
// brain's ElayaTurnEvent (delta | tool) is a subset, so both paths encode here.
function sse(event: ElayaSseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: formErrors.unauthorized }, { status: 401 });
  }
  // Elaya is for the teams in ELAYA_DOMAINS (2026-09-26): the same predicate as the page and the nav.
  if (!hasElayaAccess(profile)) {
    return NextResponse.json({ error: formErrors.elayaNotEnabled }, { status: 403 });
  }

  // Burst limit keyed on the VERIFIED profile id (not the spoofable x-forwarded-for):
  // it's available post-auth, can't be forged, and is per-user fair. The DB daily cap
  // is the real ceiling; this only smooths bursts.
  if (isRateLimited(profile.id)) {
    return NextResponse.json({ error: formErrors.rateLimited }, { status: 429 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: formErrors.generic }, { status: 400 });
  }

  const parsed = ElayaChatRequestSchema.safeParse(body.body);
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    const message =
      code === 'message_too_long' ? formErrors.elayaMessageTooLong : formErrors.elayaMessageInvalid;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const content = sanitizeText(parsed.data.message);
  if (content.length === 0) {
    return NextResponse.json({ error: formErrors.elayaMessageInvalid }, { status: 400 });
  }

  // Two brains, one route (Step 3 in-app flip — the elaya-whatsapp.ts posture):
  // the `brain_in_app` config row picks the brain per message. On the python
  // path the FastAPI brain owns the daily cap, session resolve, both message
  // rows, the E3 resolver and the turn — so every Node-side step below is
  // skipped (running it too would double-count and double-persist). NO
  // automatic fallback between brains mid-turn; the row is the kill switch.
  if ((await getElayaBrainForChannel('in_app')) === 'python') {
    if (isPythonBrainConfigured()) {
      return respondViaPythonBrain(profile, content, parsed.data.conversationId);
    }
    console.warn(
      '[elaya-chat] brain_in_app=python but the Python transport is not configured — answered by the Node brain',
    );
  }

  // Daily cap — server-side, before the model and before persisting the message.
  const [sentToday, cap] = await Promise.all([
    countUserMessagesToday(profile.id),
    getDailyMessageCap(),
  ]);
  if (sentToday >= cap) {
    return NextResponse.json(
      { error: formErrors.elayaCapReached, capReached: true },
      { status: 429 },
    );
  }

  // Conversation: a supplied id must belong to the caller (S-06); otherwise the
  // active session window (24h, config row) is resolved server-side.
  let conversation;
  try {
    conversation = parsed.data.conversationId
      ? await getOwnedConversation(parsed.data.conversationId, profile.id)
      : await getOrCreateActiveConversation(profile.id, await getSessionExpiryHours());
  } catch (e) {
    console.error('[elaya-chat] conversation resolve failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: formErrors.elayaUnavailable }, { status: 500 });
  }
  if (!conversation) {
    return NextResponse.json({ error: formErrors.unauthorized }, { status: 404 });
  }
  const conversationId = conversation.id;

  try {
    // In-app messages carry no wa_message_id, so the dedup index never applies here
    // — duplicate is always false on this path; we just satisfy the typed result.
    await insertUserMessage({ conversationId, senderId: profile.id, content });
  } catch {
    return NextResponse.json({ error: formErrors.elayaUnavailable }, { status: 500 });
  }

  const principal = resolveStaffPrincipal(profile);
  const remainingToday = Math.max(0, cap - sentToday - 1);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sse({ type: 'meta', conversationId, remainingToday }));
      try {
        const result = await runElayaTurn({
          principal,
          conversationId,
          emit: (event) => controller.enqueue(sse(event)),
        });

        // Persist before closing the stream — the open response keeps the
        // lambda alive, so no after() is needed here (A-16 satisfied).
        const saved = await insertAssistantMessage({
          conversationId,
          content: result.text,
          toolCalls: result.toolCalls,
          meta: result.meta,
        });
        await touchConversation(conversationId);

        controller.enqueue(sse({ type: 'done', messageId: saved?.id ?? null }));

        // Post-turn learned-memory update (Jarvis Phase 3) — AFTER the reply + `done`
        // already shipped, inside the still-open stream's lambda-alive window. Throttled
        // + fire-and-forget + non-fatal (never throws). sentToday+1 = this message's
        // count. Awaited so the lambda isn't frozen mid-summary; it adds no perceived
        // latency (the user has the full reply and the done frame already).
        await learnFromTurn({ principal, conversationId });
      } catch (e) {
        // D-05: log the failure, never the prompt/message contents.
        console.error('[elaya-chat] turn failed:', e instanceof Error ? e.message : e);
        controller.enqueue(sse({ type: 'error', message: formErrors.elayaUnavailable }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * The Python-brain proxy path (Step 3 in-app flip). The FastAPI brain owns the
 * daily cap, session resolve (S-06 ownership of a supplied id — its 404), both
 * message rows, the E3 resolver and the turn; this route stays the auth/burst/
 * Zod boundary and re-emits the brain's frames verbatim (one vocabulary,
 * sse.ts). Pre-flight rejections map onto the exact JSON shapes the browser
 * transport already handles (cap → 429 + capReached). Mid-stream error frames
 * are REWRITTEN to user-safe copy — the brain's message is diagnostic (D-05),
 * never UI copy. Learned memory stays a Node concern on every channel (the
 * WhatsApp gate's posture): it runs after the stream completes, inside the
 * still-open lambda window, throttled by the meta frame's messagesToday.
 */
async function respondViaPythonBrain(
  profile: Parameters<typeof resolveStaffPrincipal>[0],
  content: string,
  conversationId: string | undefined,
): Promise<Response> {
  const opened = await openPythonBrainStream({
    userId: profile.id,
    message: content,
    channel: 'in_app',
    conversationId,
  });

  if (!opened.ok) {
    if (opened.reason === 'cap') {
      return NextResponse.json(
        { error: formErrors.elayaCapReached, capReached: true },
        { status: 429 },
      );
    }
    if (opened.reason === 'not_found') {
      // A supplied conversation id that isn't the caller's — the Node path's
      // getOwnedConversation shape (S-06).
      return NextResponse.json({ error: formErrors.unauthorized }, { status: 404 });
    }
    // unconfigured / unauthorized (secret drift) / unavailable — and 'duplicate',
    // unreachable in-app (no wa_message_id ever sent on this channel).
    console.error(
      '[elaya-chat] python brain rejected the turn:',
      opened.reason,
      opened.status ?? '',
    );
    return NextResponse.json({ error: formErrors.elayaUnavailable }, { status: 500 });
  }

  const principal = resolveStaffPrincipal(profile);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let metaConversationId: string | null = null;
      let sawError = false;
      try {
        await readElayaSseStream(opened.stream, (event) => {
          if (event.type === 'meta') {
            metaConversationId = event.conversationId;
          } else if (event.type === 'error') {
            sawError = true;
            // D-05: log the brain's diagnostic, ship only safe copy.
            console.error('[elaya-chat] python brain turn error:', event.message);
            controller.enqueue(sse({ type: 'error', message: formErrors.elayaUnavailable }));
            return;
          }
          controller.enqueue(sse(event));
        });

        // Post-turn learned-memory update — same placement as the Node path:
        // after the reply + done frame shipped, inside the open stream's
        // lambda-alive window. Throttled + non-fatal (never throws).
        if (!sawError && metaConversationId) {
          await learnFromTurn({ principal, conversationId: metaConversationId });
        }
      } catch (e) {
        // D-05: log the failure, never the prompt/message contents.
        console.error(
          '[elaya-chat] python brain stream failed:',
          e instanceof Error ? e.message : e,
        );
        controller.enqueue(sse({ type: 'error', message: formErrors.elayaUnavailable }));
      } finally {
        opened.release();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
