// Anthropic adapter — the ONLY file allowed to import @anthropic-ai/sdk.
// Normalizes Anthropic request/response/tool-call shapes to the provider-neutral
// contract in lib/elaya/provider.ts. Nothing Anthropic-specific may leak out of
// this module (the multi-provider failure mode the foundation guards against).
//
// SERVER ONLY — uses ANTHROPIC_API_KEY (S-11).

import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmChatMessage,
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmProviderAdapter,
  LlmStopReason,
} from '@/lib/elaya/provider';
import type { ElayaToolCallRecord } from '@/lib/types/elaya';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('[elaya-anthropic] ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Map neutral messages → Anthropic MessageParam[].
 * Consecutive `tool` results fold into one `user` turn of tool_result blocks
 * (Anthropic requires tool results in the user turn following the tool_use).
 */
function toAnthropicMessages(messages: LlmChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (msg.content.trim().length > 0) {
        blocks.push({ type: 'text', text: msg.content });
      }
      for (const call of msg.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      }
      if (blocks.length > 0) out.push({ role: 'assistant', content: blocks });
      continue;
    }

    // role === 'tool' — fold into the previous user turn when it is already a
    // tool_result batch, otherwise open a new user turn.
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: msg.toolCallId,
      content: msg.content,
    };
    const last = out[out.length - 1];
    if (
      last &&
      last.role === 'user' &&
      Array.isArray(last.content) &&
      last.content.every((b) => b.type === 'tool_result')
    ) {
      (last.content as Anthropic.ToolResultBlockParam[]).push(block);
    } else {
      out.push({ role: 'user', content: [block] });
    }
  }

  return out;
}

function toStopReason(reason: Anthropic.Message['stop_reason']): LlmStopReason {
  switch (reason) {
    case 'tool_use':   return 'tool_use';
    case 'end_turn':   return 'end_turn';
    case 'max_tokens': return 'max_tokens';
    case 'refusal':    return 'refusal';
    default:           return 'other';
  }
}

export const anthropicAdapter: LlmProviderAdapter = {
  name: 'anthropic',

  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResult> {
    const stream = getClient().messages.stream({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
      ...(req.tools && req.tools.length > 0
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
            })),
          }
        : {}),
    });

    if (req.onTextDelta) {
      stream.on('text', (delta) => req.onTextDelta?.(delta));
    }

    const final = await stream.finalMessage();

    let text = '';
    const toolCalls: ElayaToolCallRecord[] = [];
    for (const block of final.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      toolCalls,
      stopReason: toStopReason(final.stop_reason),
      usage: {
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      },
    };
  },
};
