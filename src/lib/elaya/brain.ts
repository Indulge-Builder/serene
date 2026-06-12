// Elaya brain — the read-only tool-calling loop. SERVER ONLY.
//
// Provider-neutral by construction: it speaks only the lib/elaya/provider.ts
// contract; the model/provider comes from the llm_providers config row resolved
// per turn (registry). Tool execution carries the resolved principal — never
// model-supplied identity.

import { resolveLlmForJob } from '@/lib/elaya/registry';
import type { LlmChatMessage } from '@/lib/elaya/provider';
import type { ElayaPrincipal } from '@/lib/elaya/principal';
import { buildElayaSystemPrompt } from '@/lib/elaya/persona';
import { executeTool, getToolDefinitionsForPrincipal } from '@/lib/elaya/tools/registry';
import { getModelContextMessages, getUserContext } from '@/lib/services/elaya-service';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import type { ElayaChannel, ElayaToolCallRecord } from '@/lib/types/elaya';

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

  let fullText = '';
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
      const execution = await executeTool(principal, call.name, call.input, maskingDepth);
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
