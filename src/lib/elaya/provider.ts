// Elaya LLM provider contract — THE provider-neutral boundary.
//
// Every shape in this file is provider-agnostic. Anthropic/Gemini/OpenAI request
// and response formats are normalized INSIDE each adapter (lib/elaya/adapters/*)
// and must never leak past it — the brain, tools, services and UI only ever see
// these types. Adding a provider means adding one adapter file and one row in
// llm_providers; nothing else changes.

import type { ElayaToolCallRecord } from '@/lib/types/elaya';

/**
 * A file shown to the model inside a user turn — an image or a PDF, as bytes.
 *
 * Provider-neutral by construction: base64 + a media type is the shape every
 * major provider accepts (Anthropic image/document blocks, Gemini inlineData,
 * OpenAI image_url with a data: URL). An adapter that cannot show files should
 * drop them rather than throw — the text of the turn still stands on its own.
 *
 * The bytes are held in memory for the length of the call and never stored:
 * the file itself already lives wherever it came from (the freshdesk-attachments
 * bucket, say) and the model sees a copy, not a new home for it.
 */
export type LlmFilePart = {
  /** 'image/png', 'image/jpeg', 'image/gif', 'image/webp', or 'application/pdf'. */
  mediaType: string;
  /** The file's bytes, base64-encoded, with no data: prefix. */
  dataBase64: string;
};

/**
 * One turn in the model conversation, provider-neutral.
 *
 * A user turn may carry `files` alongside its text (added 2026-09-17 for the
 * vendor extractor, which reads invoices that were photographed rather than
 * typed — about 39% of concierge notes carry a file and the supplier's details
 * are commonly ONLY in it). Text stays required: a file with no instruction is
 * not a question, and every existing caller keeps working unchanged.
 */
export type LlmChatMessage =
  | { role: 'user'; content: string; files?: LlmFilePart[] }
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
  /**
   * When true, the adapter SHOULD mark the stable prefix (tools + system) with a
   * provider-native prompt-cache breakpoint so calls 2..n of a multi-tool turn
   * read it at ~0.1x instead of re-billing it at full input rate. Provider-neutral
   * by design: an adapter without caching simply ignores it (correctness is
   * identical either way — caching changes billing only, never what the model
   * sees). The CALLER guarantees the prefix is byte-stable across the turn (no
   * per-request timestamp/UUID in `system` or `tools`) — see persona.ts
   * buildElayaTimeContext, which keeps the volatile "today" anchor OUT of `system`.
   */
  cachePrefix?: boolean;
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
