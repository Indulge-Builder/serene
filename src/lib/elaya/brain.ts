// Elaya brain — the read-only tool-calling loop. SERVER ONLY.
//
// Provider-neutral by construction: it speaks only the lib/elaya/provider.ts
// contract; the model/provider comes from the llm_providers config row resolved
// per turn (registry). Tool execution carries the resolved principal — never
// model-supplied identity.

import { resolveLlmForJob } from '@/lib/elaya/registry';
import type { LlmChatMessage } from '@/lib/elaya/provider';
import type { ElayaPrincipal } from '@/lib/elaya/principal';
import { buildElayaSystemPrompt, buildElayaTimeContext } from '@/lib/elaya/persona';
import { executeTool, getToolDefinitionsForPrincipal } from '@/lib/elaya/tools/registry';
import { executeProposedAction } from '@/lib/elaya/tools/write-registry';
import { classifyConfirmation } from '@/lib/elaya/confirmation';
import {
  getLatestProposedAction,
  markActionResolved,
} from '@/lib/services/elaya-actions-service';
import { getModelContextMessages, getUserPersona } from '@/lib/services/elaya-service';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import type { ElayaChannel, ElayaMessageRow, ElayaToolCallRecord } from '@/lib/types/elaya';

/** Hard ceiling on tool round-trips per turn — a runaway-loop backstop. */
const MAX_TOOL_ITERATIONS = 5;

/**
 * How long a state-change proposal stays confirmable. The session is 24h, but a
 * proposal must NOT linger that long: a user who proposed "move Arfan to Won" an
 * hour ago and later replies "haan" to something unrelated must not fire the stale
 * change (findings H3). 15 min comfortably covers a real back-and-forth while
 * killing the cross-context "yes". A proposal older than this is auto-dismissed and
 * the new message is handled fresh.
 */
const PROPOSAL_TTL_MS = 15 * 60 * 1000;

/** Appended when a model reply is cut off by the token cap (M4). Plain text so it
 *  renders identically in-app and over WhatsApp; leading newlines separate it. */
const TRUNCATED_SUFFIX =
  '\n\n…(I had to cut that short — ask me to continue and I’ll pick up where I left off.)';

/** Appended when the tool-iteration ceiling is hit (M3) — the turn took more steps
 *  than one reply can do. Honest close instead of a dangling "let me check…". */
const CEILING_SUFFIX =
  '\n\nThat took more steps than I can finish in one go — tell me which part you’d like me to do and I’ll get right on it.';

/** Appended when the model loop throws mid-turn (M5). Any inline writes already made
 *  stand; the partial reply is persisted so the next turn knows what was done. */
const TURN_ERROR_SUFFIX =
  '\n\nSomething went wrong on my side before I could finish that. Anything I already did above is saved — tell me what’s left and I’ll continue.';

export type ElayaTurnEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string };

export type ElayaTurnResult = {
  text: string;
  toolCalls: ElayaToolCallRecord[];
  meta: Record<string, unknown>;
};

/**
 * Run one assistant turn. The caller (chat route) has already authenticated,
 * enforced the daily cap, and inserted the user message — so the persisted
 * history ends with the new user message.
 */
export async function runElayaTurn(args: {
  principal: ElayaPrincipal;
  conversationId: string;
  emit: (event: ElayaTurnEvent) => void;
  channel?: ElayaChannel;
}): Promise<ElayaTurnResult> {
  const { principal, conversationId, emit, channel = 'in_app' } = args;

  const [llm, maskingDepth, persona, history] = await Promise.all([
    resolveLlmForJob('reasoning'),
    getPiiMaskingDepth(),
    // Per-user persona (style prefs + Elaya-learned facts) — folded into the prompt
    // as a fenced STYLE-ONLY block (Jarvis Phase 2). Admin-client read → works on
    // both channels. Empty for a user who hasn't tuned anything (zero prompt bytes).
    getUserPersona(principal.userId),
    getModelContextMessages(conversationId),
  ]);

  const system = buildElayaSystemPrompt(principal, persona, channel);
  const tools = getToolDefinitionsForPrincipal(principal);

  let fullText = '';

  // ── Confirmation resolver (Phase 2) — THE ONLY place a state-change executes ──
  // Runs before the model turn, for BOTH channels (both call this function). If a
  // state-changing write was proposed on a PRIOR turn, resolve it against the human's
  // latest reply: a clear affirmative executes it; ANYTHING else (ambiguous, negative,
  // or a new instruction) cancels it and we process the new message fresh. The verdict
  // is computed in code from the human's message ONLY — never tool/lead text — so
  // injected lead content can never be the confirmation.
  const resolverLine = await resolvePendingAction(principal, conversationId, history);
  if (resolverLine) {
    emit({ type: 'delta', text: resolverLine + '\n\n' });
    fullText = resolverLine + '\n\n';
  }

  // Persisted history replays as TEXT ONLY — tool_use blocks without their
  // paired results are rejected by providers, and tool results are not
  // persisted in this phase. The live tool loop below builds proper pairs.
  const messages: LlmChatMessage[] = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
    .map((m) =>
      m.role === 'user'
        ? { role: 'user' as const, content: m.content }
        : { role: 'assistant' as const, content: m.content },
    );

  // The per-turn "today" anchor rides on the LATEST user message — outside the
  // cached system prefix — so the prompt cache (set via cachePrefix below) stays
  // valid across this turn's 2-6 model calls. The provider contract has no
  // system role mid-conversation, and the anchor is per-turn volatile anyway, so
  // the last user turn is its correct home. Prepended so the model reads it as
  // framing, not as part of the user's question.
  const timeContext = buildElayaTimeContext();
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      messages[i] = {
        role: 'user',
        content: `${timeContext}\n\n${messages[i].content}`,
      };
      break;
    }
  }

  const toolCtx = { conversationId, channel };
  const allToolCalls: ElayaToolCallRecord[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let iterations = 0;
  let turnError = false;

  // The model loop is wrapped so a mid-turn throw (API error/timeout after one or
  // more inline writes already committed) does NOT discard the partial result (M5).
  // We append a short failure marker and fall through to RETURN the accumulated
  // text + toolCalls — the caller persists them, so the next turn's history records
  // what already happened and the model won't re-create the same note/task.
  try {
  for (;;) {
    const result = await llm.adapter.complete({
      model: llm.model,
      maxTokens: llm.maxTokens,
      system,
      messages,
      tools,
      // The system prefix is byte-stable across this turn (volatile timestamp
      // rides the user message above, not `system`), so the adapter may cache
      // tools+system — calls 2..n read it at ~0.1x. See provider.ts cachePrefix.
      cachePrefix: true,
      onTextDelta: (delta) => emit({ type: 'delta', text: delta }),
    });

    fullText += result.text;
    inputTokens += result.usage.inputTokens;
    outputTokens += result.usage.outputTokens;

    if (result.stopReason !== 'tool_use' || result.toolCalls.length === 0) {
      // A non-tool stop ends the turn. If the model was CUT OFF mid-sentence by the
      // token cap (M4), the loop previously returned the truncated text with no
      // signal. Append a short, honest marker so the user knows it was clipped —
      // never present a half-finished answer as complete.
      if (result.stopReason === 'max_tokens') {
        emit({ type: 'delta', text: TRUNCATED_SUFFIX });
        fullText += TRUNCATED_SUFFIX;
      }
      break;
    }

    iterations += 1;
    if (iterations > MAX_TOOL_ITERATIONS) {
      // Ceiling hit (M3). Before, the loop just broke — leaving the user with the
      // dangling "let me check…" preamble and no resolution. Emit a deterministic
      // line so the turn closes honestly. The model's last tool batch is NOT
      // executed (we're over budget); writes from rounds 1..N already landed.
      console.warn('[elaya-brain] tool iteration ceiling hit for conversation', conversationId);
      emit({ type: 'delta', text: CEILING_SUFFIX });
      fullText += CEILING_SUFFIX;
      break;
    }

    messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });

    for (const call of result.toolCalls) {
      allToolCalls.push(call);
      emit({ type: 'tool', name: call.name });
      const execution = await executeTool(principal, call.name, call.input, maskingDepth, toolCtx);
      messages.push({ role: 'tool', toolCallId: call.id, content: execution.content });
    }

    // Visual separator between pre-tool and post-tool prose in the transcript.
    if (fullText.length > 0 && !fullText.endsWith('\n')) {
      fullText += '\n\n';
      emit({ type: 'delta', text: '\n\n' });
    }
  }
  } catch (e) {
    // Mid-turn failure (M5). Anything already streamed + any inline writes already
    // committed are real; we keep them. Append an honest marker so the persisted
    // assistant message reflects what happened, and flag turnError so the caller can
    // surface the failure to the user. We DO NOT rethrow — returning the partial
    // result is what lets the next turn's history record the completed inline writes
    // (preventing a duplicate-on-retry).
    console.error('[elaya-brain] turn loop failed:', e instanceof Error ? e.message : e);
    turnError = true;
    emit({ type: 'delta', text: TURN_ERROR_SUFFIX });
    fullText += TURN_ERROR_SUFFIX;
  }

  return {
    text: fullText.trim(),
    toolCalls: allToolCalls,
    meta: {
      provider: llm.adapter.name,
      model: llm.model,
      usage: { inputTokens, outputTokens },
      toolIterations: iterations,
      turnError,
    },
  };
}

/**
 * Resolve a state-change proposal pending from a prior turn against the human's latest
 * reply. Returns a code-generated line to surface to the user when something executed
 * or was explicitly halted, or null when there was nothing to resolve / the proposal
 * was simply cancelled (the model then handles the new message fresh).
 *
 * Security-critical invariants:
 *   • The verdict is computed from the latest USER-role message only (the human's reply)
 *     — never assistant prose or tool/lead content. Lead-sourced text in context can
 *     therefore never BE the confirmation (prompt-injection defence).
 *   • Only a clear affirmative executes; everything else dismisses (safety bias).
 *   • Execution re-checks access + the before-snapshot inside executeProposedAction —
 *     a stale/moved target fails rather than firing.
 *   • A proposal older than PROPOSAL_TTL_MS auto-dismisses without executing (H3) —
 *     a later unrelated "yes" can never fire a stale state change.
 *   • Execution requires that Elaya actually RELAYED the ask: the most recent
 *     assistant message must be non-empty (H3b). A proposal whose run() recorded a
 *     row but never surfaced a confirmation prompt (e.g. the model produced no text,
 *     or hit the iteration ceiling) is never confirmable by a stray affirmative.
 */
async function resolvePendingAction(
  principal: ElayaPrincipal,
  conversationId: string,
  history: ElayaMessageRow[],
): Promise<string | null> {
  const pending = await getLatestProposedAction(conversationId, principal.userId);
  if (!pending) return null;

  // H3 — stale-proposal guard. A proposal past its TTL is dismissed without ever
  // reaching the affirmation check, so an unrelated later "yes"/"haan" can't fire it.
  const ageMs = Date.now() - new Date(pending.created_at).getTime();
  if (ageMs > PROPOSAL_TTL_MS) {
    await markActionResolved(pending.id, 'dismissed', principal.userId);
    return null;
  }

  // The human's latest message is the last user-role row (the route inserted it before
  // calling the brain). If the last row somehow isn't a user message, do not treat
  // anything as a confirmation — cancel the proposal and move on.
  const lastUserMessage = [...history].reverse().find((m) => m.role === 'user');
  const verdict = lastUserMessage
    ? classifyConfirmation(lastUserMessage.content)
    : 'other';

  // H3b — the ask must have been relayed. The confirmation prompt lives in the most
  // recent ASSISTANT message (the proposal was recorded on a prior turn). If that
  // message is missing/empty, Elaya never asked — do not let a stray affirmative
  // execute a proposal the user never saw.
  const lastAssistantMessage = [...history].reverse().find((m) => m.role === 'assistant');
  const askWasRelayed = !!lastAssistantMessage && lastAssistantMessage.content.trim().length > 0;

  if (verdict === 'affirmative' && askWasRelayed) {
    const outcome = await executeProposedAction(principal, pending);
    return outcome.line;
  }

  // Anything not a clear yes (or a yes with no relayed ask) cancels the pending
  // action. The new message is then processed normally by the model turn.
  await markActionResolved(pending.id, 'dismissed', principal.userId);
  return null;
}
