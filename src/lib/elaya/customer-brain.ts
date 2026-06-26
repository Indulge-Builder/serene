// Elaya CUSTOMER brain — the tool-calling loop for the outward-facing customer channel.
// SERVER ONLY. (FEATURE 2.)
//
// Deliberately SEPARATE from the staff brain (brain.ts): a customer turn has NO
// confirmation resolver (customers never confirm a state change — there are no
// state-changing customer tools), NO staff persona/learned-memory fold, NO elaya_actions
// ledger. Keeping it separate keeps the security-critical staff confirmation loop simple
// and means the customer path literally cannot reach staff machinery. It shares only the
// provider contract + the customer toolset.
//
// The principal is a CustomerPrincipal — its toolset is the hard cap (customer-registry.ts);
// the model is only ever handed those tools, and executeCustomerTool refuses anything else.

import { resolveLlmForJob } from '@/lib/elaya/registry';
import type { LlmChatMessage } from '@/lib/elaya/provider';
import type { CustomerPrincipal } from '@/lib/elaya/principal';
import { buildCustomerSystemPrompt } from '@/lib/elaya/customer-persona';
import {
  getCustomerToolDefinitions,
  executeCustomerTool,
} from '@/lib/elaya/tools/customer-registry';
import { buildElayaTimeContext } from '@/lib/elaya/persona';
import type { ElayaToolCallRecord } from '@/lib/types/elaya';

/** Hard ceiling on tool round-trips per customer turn — a runaway-loop backstop. */
const MAX_TOOL_ITERATIONS = 4;

export type CustomerTurnInput = {
  role: 'user' | 'assistant';
  content: string;
};

/** A sendable asset the turn fetched via get_company_material (deduped, in send_order). */
export type CustomerTurnMedia = {
  kind: string;
  title: string;
  url: string;
};

export type CustomerTurnResult = {
  /** The model-authored reply (raw markdown; the caller converts to WhatsApp-native). */
  text: string;
  /** The tool calls made this turn (audit). */
  toolCalls: ElayaToolCallRecord[];
  /** The sendable media surfaced by get_company_material this turn (the orchestrator
   *  sends these as actual WhatsApp media after the text reply — spaced + capped). */
  media: CustomerTurnMedia[];
  meta: Record<string, unknown>;
};

/**
 * Run one customer assistant turn. `history` is the conversation so far (oldest→newest),
 * ending with the customer's latest message (or, for the very first welcome, a single
 * synthetic 'system has just connected' user line the orchestrator supplies). Returns the
 * reply text + the tool calls made (so the orchestrator can also send any media assets the
 * model fetched). No streaming — WhatsApp gets one reply.
 */
export async function runCustomerTurn(args: {
  principal: CustomerPrincipal;
  history: CustomerTurnInput[];
}): Promise<CustomerTurnResult> {
  const { principal, history } = args;

  const llm = await resolveLlmForJob('reasoning');
  const system = buildCustomerSystemPrompt(principal);
  const tools = getCustomerToolDefinitions();

  const messages: LlmChatMessage[] = history
    .filter((m) => m.content.trim().length > 0)
    .map((m) =>
      m.role === 'user'
        ? { role: 'user' as const, content: m.content }
        : { role: 'assistant' as const, content: m.content },
    );

  // The per-turn "today" anchor rides the latest user message (outside the cached
  // system prefix), same pattern as the staff brain — so relative dates resolve correctly.
  const timeContext = buildElayaTimeContext();
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      messages[i] = { role: 'user', content: `${timeContext}\n\n${messages[i].content}` };
      break;
    }
  }

  const allToolCalls: ElayaToolCallRecord[] = [];
  const mediaByUrl = new Map<string, CustomerTurnMedia>();
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let iterations = 0;
  let turnError = false;

  try {
    for (;;) {
      const result = await llm.adapter.complete({
        model: llm.model,
        maxTokens: llm.maxTokens,
        system,
        messages,
        tools,
        cachePrefix: true,
        onTextDelta: () => {}, // no streaming on WhatsApp
      });

      fullText += result.text;
      inputTokens += result.usage.inputTokens;
      outputTokens += result.usage.outputTokens;

      if (result.stopReason !== 'tool_use' || result.toolCalls.length === 0) break;

      iterations += 1;
      if (iterations > MAX_TOOL_ITERATIONS) {
        console.warn('[elaya-customer-brain] tool iteration ceiling hit for lead', principal.leadId);
        break;
      }

      messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });
      for (const call of result.toolCalls) {
        allToolCalls.push(call);
        const execution = await executeCustomerTool(principal, call.name, call.input);
        messages.push({ role: 'tool', toolCallId: call.id, content: execution.content });
        // Surface the sendable media a get_company_material call returned so the
        // orchestrator can push the actual files (deduped by url, send_order kept).
        if (call.name === 'get_company_material' && !execution.isError) {
          collectMedia(execution.content, mediaByUrl);
        }
      }
    }
  } catch (e) {
    console.error('[elaya-customer-brain] turn loop failed:', e instanceof Error ? e.message : e);
    turnError = true;
  }

  const media = [...mediaByUrl.values()];

  return {
    text: fullText.trim(),
    toolCalls: allToolCalls,
    media,
    meta: {
      provider: llm.adapter.name,
      model: llm.model,
      usage: { inputTokens, outputTokens },
      toolIterations: iterations,
      turnError,
    },
  };
}

/** Pull the sendable `material[]` out of a get_company_material tool result. */
function collectMedia(serialized: string, into: Map<string, CustomerTurnMedia>): void {
  try {
    const parsed = JSON.parse(serialized) as {
      material?: { kind?: string; title?: string; url?: string | null }[];
    };
    for (const m of parsed.material ?? []) {
      if (m.url && !into.has(m.url)) {
        into.set(m.url, { kind: m.kind ?? 'doc', title: m.title ?? '', url: m.url });
      }
    }
  } catch {
    // non-JSON / unexpected shape — no media to collect, never throw
  }
}
