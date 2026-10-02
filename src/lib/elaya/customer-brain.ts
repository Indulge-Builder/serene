// The PUBLIC bot's turn (0252, docs/architecture/indulge-bot-plan.md). SERVER ONLY.
// Rewritten in place from the June customer brain; there is no second copy.
//
// Deliberately separate from the staff brains: no confirmation resolver, no staff persona, no
// memory, no elaya_actions ledger, no import from staff Elaya. It shares only the provider
// contract (on its own credential and its own model row, `public_bot`) and the IST formatter.
//
// One turn: the cached system prompt (persona + published pack) → the conversation → the turn's
// volatile context on the latest message → up to PUBLIC_BOT_LIMITS.maxModelCalls model calls with
// the three tools → the reply text. Only the LAST call's text is the reply: text the model wrote
// before a tool call is never sent (the June "Let me pull our brochure" leak). Never throws.

import { resolveLlmForJob, type ResolvedLlm } from '@/lib/elaya/registry';
import type { LlmChatMessage } from '@/lib/elaya/provider';
import type { CustomerPrincipal } from '@/lib/elaya/principal';
import { buildPublicBotSystemPrompt } from '@/lib/elaya/customer-persona';
import { executeCustomerTool, getCustomerToolDefinitions, type HandoverRequest, type PublicToolContext } from '@/lib/elaya/tools/customer-registry';
import { formatIstNow } from '@/lib/utils/ist';
import { costForTokens, PUBLIC_BOT_LIMITS } from '@/lib/constants/public-bot';
import type { ElayaToolCallRecord } from '@/lib/types/elaya';

export type CustomerTurnInput = { role: 'user' | 'assistant'; content: string };

export type PublicTurnContext = {
  /** Their first name when they have given one (never a phone number). */
  firstName: string | null;
  /** Is this the first reply Indulge has ever sent them? (She introduces herself once.) */
  firstReply: boolean;
  /** Titles of library items they already received. */
  alreadySent: string[];
  /** Interests on record. */
  interests: string[];
  /** The ad they came from, when the payload says (headline / body). */
  cameFrom: string | null;
  /** Already handed over once (she keeps answering, does not hand over again for the same thing). */
  handedOver: boolean;
};

export type PublicTurnResult = {
  text: string;
  toolCalls: ElayaToolCallRecord[];
  queuedSends: string[];
  interests: string[];
  handover: HandoverRequest | null;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  costUsd: number;
  error: string | null;
};

function turnContextLine(c: PublicTurnContext): string {
  const parts = [
    `[For you, not the person: it is ${formatIstNow(new Date())}.`,
    c.firstName ? `Their first name is ${c.firstName}.` : `You do not know their name yet.`,
    c.firstReply ? `This is your first reply to them: introduce yourself once as Indulge's digital concierge.` : `You have spoken before; do not introduce yourself again.`,
    c.cameFrom ? `They came from this ad: ${c.cameFrom}.` : null,
    c.interests.length ? `Interests on record: ${c.interests.join(', ')}.` : null,
    c.alreadySent.length ? `Already sent to them: ${c.alreadySent.join('; ')}.` : null,
    c.handedOver ? `The team already has their brief; hand over again only for something new.` : null,
  ].filter(Boolean);
  return `${parts.join(' ')}]`;
}

/**
 * Collapse the stored thread into a valid conversation: it starts with the person, and two turns
 * in a row from the same side are joined (an agent's line and the bot's line are both "us").
 */
function toConversation(history: CustomerTurnInput[]): LlmChatMessage[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of history) {
    const content = m.content.trim();
    if (!content) continue;
    if (out.length === 0 && m.role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${content}`;
    else out.push({ role: m.role, content });
  }
  return out;
}

export async function runCustomerTurn(args: {
  principal: CustomerPrincipal;
  packText: string;
  libraryIds: ReadonlySet<string>;
  sentIds: ReadonlySet<string>;
  history: CustomerTurnInput[];
  context: PublicTurnContext;
  /** The bench only: a model chosen by the caller, and tools that write nothing. */
  bench?: { llm: ResolvedLlm };
}): Promise<PublicTurnResult> {
  const ctx: PublicToolContext = {
    dryRun: !!args.bench,
    principal: args.principal,
    libraryIds: args.libraryIds,
    sentIds: args.sentIds,
    queuedSends: [],
    interests: [],
    handover: null,
  };
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const toolCalls: ElayaToolCallRecord[] = [];
  let model = '';
  let text = '';
  let error: string | null = null;

  try {
    const llm = args.bench?.llm ?? (await resolveLlmForJob('public_bot'));
    model = llm.model;
    const system = buildPublicBotSystemPrompt(args.packText);
    const tools = getCustomerToolDefinitions();
    const messages = toConversation(args.history);
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser || lastUser.role !== 'user') return { text: '', toolCalls, queuedSends: [], interests: [], handover: null, model, usage, costUsd: 0, error: 'no message from the person' };
    lastUser.content = `${turnContextLine(args.context)}\n\n${lastUser.content}`;

    for (let call = 0; call < PUBLIC_BOT_LIMITS.maxModelCalls; call += 1) {
      const result = await llm.adapter.complete({
        model: llm.model,
        maxTokens: llm.maxTokens,
        system,
        messages,
        tools,
        cachePrefix: true,
        timeoutMs: PUBLIC_BOT_LIMITS.callTimeoutMs,
        credential: 'public_bot',
      });
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      usage.cacheReadTokens += result.usage.cacheReadTokens ?? 0;
      usage.cacheWriteTokens += result.usage.cacheWriteTokens ?? 0;
      if (result.text.trim()) text = result.text.trim();

      if (result.stopReason === 'refusal') {
        text = '';
        error = 'the model declined';
        break;
      }
      if (result.stopReason !== 'tool_use' || result.toolCalls.length === 0) break;

      // A reply written alongside tool calls is the lead-in, not the answer: keep the latest
      // text only when the model finishes without calling another tool.
      text = '';
      messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });
      for (const tc of result.toolCalls) {
        toolCalls.push(tc);
        const exec = await executeCustomerTool(ctx, tc.name, tc.input);
        messages.push({ role: 'tool', toolCallId: tc.id, content: exec.content });
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error('[public-bot-brain] turn failed:', error);
  }

  return {
    text,
    toolCalls,
    queuedSends: ctx.queuedSends,
    interests: ctx.interests,
    handover: ctx.handover,
    model,
    usage,
    costUsd: model ? costForTokens(model, usage) : 0,
    error,
  };
}
