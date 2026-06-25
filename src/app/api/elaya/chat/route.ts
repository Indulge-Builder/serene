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
import { resolveStaffPrincipal } from '@/lib/elaya/principal';
import { runElayaTurn } from '@/lib/elaya/brain';
import { maybeUpdateLearnedMemory } from '@/lib/elaya/memory';
import {
  countUserMessagesToday,
  getOrCreateActiveConversation,
  getOwnedConversation,
  insertAssistantMessage,
  insertUserMessage,
  touchConversation,
} from '@/lib/services/elaya-service';
import { getDailyMessageCap, getSessionExpiryHours } from '@/lib/services/llm-providers-service';
import { ElayaChatRequestSchema } from '@/lib/validations/elaya-schema';
import { formErrors } from '@/lib/validations/form-errors';
import { sanitizeText } from '@/lib/utils/sanitize';
import { createRateLimiter, getClientIp, readJsonBody } from '@/lib/utils/webhook';

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

type SseEvent =
  | { type: 'meta'; conversationId: string; remainingToday: number }
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; messageId: string | null }
  | { type: 'error'; message: string };

function sse(event: SseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: formErrors.unauthorized }, { status: 401 });
  }

  if (isRateLimited(getClientIp(request))) {
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
        await maybeUpdateLearnedMemory({
          principal,
          conversationId,
          userMessagesToday: sentToday + 1,
        });
      } catch (e) {
        // D-05: log the failure, never the prompt/message contents.
        console.error('[elaya-chat] turn failed:', e instanceof Error ? e.message : e);
        controller.enqueue(sse({ type: 'error', message: formErrors.elayaUnavailable }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
