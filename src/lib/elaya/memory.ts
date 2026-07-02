// Elaya memory subsystem (Jarvis Phase 3). SERVER ONLY.
//
// One job: THE LEARNED-MEMORY WRITER — after a turn, a single bounded Haiku call
// distills "what durable thing should Elaya remember about THIS user" from the prior
// learned blurb + the recent conversation, and overwrites user_context.learned.
// This is what makes Elaya "get smarter the more you use it." It reuses the Elaya
// provider + PII layer wholesale (R-01 / D-01 — exactly the revival-gate shape):
// resolveLlmForJob('routing') → adapter.complete() with NO tools, masked input.
// (The former retrieval seam, retrieveMemoryContext, was removed 2026-07-02 — the
// brain reads the learned blurb + notes directly via getUserPersona/getNotesForElaya;
// a future embeddings retrieval layer starts from those call sites. See
// docs/modules/elaya.md.)
//
// GOLDEN RULE: learned memory is CONTEXT, never permission. It is folded into the
// prompt as facts-to-recall; what the user may see/do stays code-side (toolset+scope).
// The summarizer is instructed to capture style/work-context facts ONLY — never
// identity, role, or anything that reads as an access grant.

import 'server-only';
import { resolveLlmForJob } from '@/lib/elaya/registry';
import { maskPii } from '@/lib/elaya/pii';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import {
  getUserPersona,
  getModelContextMessages,
  writeLearnedMemory,
} from '@/lib/services/elaya-service';
import type { StaffPrincipal } from '@/lib/elaya/principal';

// ── Bounds ──
// learned rides the CACHED prompt prefix every turn, so it must stay small (a big
// blurb re-bills the prefix and grows per user forever). ~900 chars ≈ a tight
// paragraph of durable facts — generous for "remember how they work" without bloat.
const LEARNED_MAX_CHARS = 900;
// How many recent messages the summarizer reads (the same window the brain replays).
const SUMMARY_CONTEXT_MESSAGES = 10;
// Throttle: run the summarizer only every Nth user message in the conversation, not
// every turn — the durable picture changes slowly and each run is a paid Haiku call.
const MEMORY_SUMMARY_EVERY_N = 4;

const SUMMARY_SYSTEM_PROMPT = `You maintain a tiny, durable memory note about ONE user of an internal sales CRM assistant (Elaya). You are given the EXISTING note plus the most recent snippet of their conversation. Return an UPDATED note.

Capture only DURABLE, useful facts about this user and how they work — things worth remembering across sessions:
- What they're working on / accounts or domains they own / recurring focuses ("owns the GMR account", "chases cold leads on Mondays").
- Stable preferences in how they want help ("prefers bullet points", "wants the number first, then context", "likes a quick morning pipeline summary").
- Names/handles they go by, recurring people or deals they mention.

Do NOT capture:
- One-off task details, transient state, or anything already obvious from a single message.
- Their role, permissions, domain-access, or ANYTHING that reads like "this user is allowed to…". This note is about style and working context — never access. Never write a sentence that asserts a permission.
- Sensitive personal data, full phone numbers, or secrets.

Rules:
- Keep it SHORT — at most ~6 terse bullet-style facts, plain sentences, ${LEARNED_MAX_CHARS} characters HARD MAX.
- MERGE: keep still-true facts from the existing note, drop anything contradicted or stale, add what's genuinely new. Do not just append.
- If there is nothing durable worth remembering, return the existing note UNCHANGED (or empty if it was empty).
- Output ONLY the note text — no preamble, no JSON, no markdown headings, no quotes around it.`;

/**
 * THE summarizer core: existing learned + recent transcript → updated learned blurb.
 * Pure of DB I/O (caller supplies inputs + masking depth) so it can be evaluated on
 * arbitrary input. Returns the trimmed, bounded note, or null when it should NOT be
 * written (model failure, or the model returned effectively-empty/unchanged). Fails
 * SOFT to null — a glitch never corrupts or clears existing memory.
 */
async function summarizeLearnedMemory(
  existingLearned: string,
  recentTranscript: string,
  maskingDepth: Parameters<typeof maskPii>[1],
): Promise<string | null> {
  try {
    const maskedTranscript = maskPii(recentTranscript, maskingDepth);
    const llm = await resolveLlmForJob('routing');
    const result = await llm.adapter.complete({
      model: llm.model,
      maxTokens: Math.min(llm.maxTokens, 400),
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            `EXISTING NOTE (may be empty):\n${existingLearned || '(empty)'}\n\n` +
            `RECENT CONVERSATION (newest last):\n${maskedTranscript}\n\n` +
            `Return the updated note text only.`,
        },
      ],
      // NO tools — single-shot summarization.
    });

    const next = result.text.trim().slice(0, LEARNED_MAX_CHARS).trim();
    if (next.length === 0) return null;
    // No meaningful change → don't bother writing (idempotent convergence).
    if (next === existingLearned.trim()) return null;
    return next;
  } catch (e) {
    console.error('[elaya-memory] summarize failed (soft-skip):', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Post-turn memory update — called by the brain's CALLERS (SSE route + WhatsApp gate)
 * AFTER the reply is persisted, inside their lambda-alive window (the after()/stream
 * lifetime). Fire-and-forget + non-fatal: a failure NEVER affects the reply the user
 * already got.
 *
 * Throttled: `userMessagesToday` (already counted by the caller for the cap) gates the
 * run to every MEMORY_SUMMARY_EVERY_N-th user message — the durable picture changes
 * slowly and each run is a paid call. Pass the count AFTER the current message is
 * included (so the very first message of a fresh user, count 1, doesn't fire).
 */
export async function maybeUpdateLearnedMemory(args: {
  principal: StaffPrincipal;
  conversationId: string;
  userMessagesToday: number;
}): Promise<void> {
  const { principal, conversationId, userMessagesToday } = args;
  try {
    // Throttle. count % N === 0 → run on the 4th, 8th, … message of the day.
    if (userMessagesToday <= 0 || userMessagesToday % MEMORY_SUMMARY_EVERY_N !== 0) return;

    const [{ learned }, history, maskingDepth] = await Promise.all([
      getUserPersona(principal.userId),
      getModelContextMessages(conversationId, SUMMARY_CONTEXT_MESSAGES),
      getPiiMaskingDepth(),
    ]);

    // Build a plain transcript of the recent window (role-prefixed, oldest→newest).
    const transcript = history
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
      .map((m) => `${m.role === 'user' ? 'User' : 'Elaya'}: ${m.content}`)
      .join('\n');
    if (transcript.trim().length === 0) return;

    const next = await summarizeLearnedMemory(learned ?? '', transcript, maskingDepth);
    if (next === null) return; // soft-skip — no change / failure

    await writeLearnedMemory(principal.userId, next);
  } catch (e) {
    // Never throws into the caller — the reply already shipped.
    console.error('[elaya-memory] post-turn update failed (non-fatal):', e instanceof Error ? e.message : e);
  }
}
