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
import { getModelContextMessages, getUserContext } from '@/lib/services/elaya-service';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import type { ElayaChannel, ElayaMessageRow, ElayaToolCallRecord } from '@/lib/types/elaya';

/** Hard ceiling on tool round-trips per turn — a runaway-loop backstop. */
const MAX_TOOL_ITERATIONS = 5;

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

  const [llm, maskingDepth, userContext, history] = await Promise.all([
    resolveLlmForJob('reasoning'),
    getPiiMaskingDepth(),
    getUserContext(principal.userId),
    getModelContextMessages(conversationId),
  ]);

  const system = buildElayaSystemPrompt(principal, userContext, channel);
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

    if (result.stopReason !== 'tool_use' || result.toolCalls.length === 0) break;

    iterations += 1;
    if (iterations > MAX_TOOL_ITERATIONS) {
      console.warn('[elaya-brain] tool iteration ceiling hit for conversation', conversationId);
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

  return {
    text: fullText.trim(),
    toolCalls: allToolCalls,
    meta: {
      provider: llm.adapter.name,
      model: llm.model,
      usage: { inputTokens, outputTokens },
      toolIterations: iterations,
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
 */
async function resolvePendingAction(
  principal: ElayaPrincipal,
  conversationId: string,
  history: ElayaMessageRow[],
): Promise<string | null> {
  const pending = await getLatestProposedAction(conversationId, principal.userId);
  if (!pending) return null;

  // The human's latest message is the last user-role row (the route inserted it before
  // calling the brain). If the last row somehow isn't a user message, do not treat
  // anything as a confirmation — cancel the proposal and move on.
  const lastUserMessage = [...history].reverse().find((m) => m.role === 'user');
  const verdict = lastUserMessage
    ? classifyConfirmation(lastUserMessage.content)
    : 'other';

  if (verdict === 'affirmative') {
    const outcome = await executeProposedAction(principal, pending);
    return outcome.line;
  }

  // Anything not a clear yes cancels the pending action. The new message is then
  // processed normally by the model turn (no line needed — Elaya just responds).
  await markActionResolved(pending.id, 'dismissed', principal.userId);
  return null;
}
