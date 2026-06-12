// Elaya LLM provider contract — THE provider-neutral boundary.
//
// Every shape in this file is provider-agnostic. Anthropic/Gemini/OpenAI request
// and response formats are normalized INSIDE each adapter (lib/elaya/adapters/*)
// and must never leak past it — the brain, tools, services and UI only ever see
// these types. Adding a provider means adding one adapter file and one row in
// llm_providers; nothing else changes.

import type { ElayaToolCallRecord } from '@/lib/types/elaya';

/** One turn in the model conversation, provider-neutral. */
export type LlmChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ElayaToolCallRecord[] }
  | { role: 'tool'; toolCallId: string; content: string };

/** JSON-Schema tool definition (the lowest common denominator across providers). */
export type LlmToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type LlmStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LlmCompleteRequest = {
  model: string;
  maxTokens: number;
  system: string;
  messages: LlmChatMessage[];
  tools?: LlmToolDefinition[];
  /** Streamed text deltas (assistant prose only — never tool-call JSON). */
  onTextDelta?: (delta: string) => void;
};

export type LlmCompleteResult = {
  /** Full assistant prose for the turn (concatenation of streamed deltas). */
  text: string;
  /** Normalized tool calls requested this turn (empty when none). */
  toolCalls: ElayaToolCallRecord[];
  stopReason: LlmStopReason;
  usage: LlmUsage;
};

/**
 * THE one contract every adapter implements. Streaming is part of complete():
 * adapters stream internally and emit deltas through onTextDelta, then resolve
 * with the normalized final result.
 */
export interface LlmProviderAdapter {
  readonly name: string;
  complete(req: LlmCompleteRequest): Promise<LlmCompleteResult>;
}
