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

// Per-request timeout for a single model call (M6). The route's maxDuration is 60s
// and a turn makes several calls, so each call must finish well under that. 30s is
// generous for a streamed completion while leaving headroom for tool execution +
// the final SSE flush; a stalled call fails fast (with one retry) instead of
// silently riding the SDK's 10-min default into a lambda kill.
const ELAYA_REQUEST_TIMEOUT_MS = 30_000;

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
    // Prompt caching (perf): render order is tools → system → messages. One
    // cache_control breakpoint on the LAST system block caches tools + system
    // together (the stable prefix), so calls 2..n of a multi-tool turn read it
    // at ~0.1x instead of re-billing the full ~3-4k-token prefix every call.
    // A breakpoint below the model's minimum prefix simply doesn't cache — no
    // error, no behaviour change. The caller (brain) sets cachePrefix only when
    // the prefix is byte-stable across the turn (volatile timestamp lives in a
    // trailing message block, never in `system`).
    const system: Anthropic.MessageCreateParams['system'] =
      req.cachePrefix && req.system.length > 0
        ? [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }]
        : req.system;

    const stream = getClient().messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system,
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
      },
      // Per-request overrides (the SDK defaults are a 10-min timeout + 2 retries,
      // which inside a 60s Vercel lambda can silently exceed maxDuration and get the
      // function killed mid-stream with no error event — M6). A turn makes up to
      // MAX_TOOL_ITERATIONS+1 calls, so each call is bounded well under the lambda
      // budget and retried at most once (a second backoff would blow the window).
      { timeout: ELAYA_REQUEST_TIMEOUT_MS, maxRetries: 1 },
    );

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
