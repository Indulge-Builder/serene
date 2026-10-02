// The PUBLIC bot's tools (0252, docs/architecture/indulge-bot-plan.md section 10, layer 1).
// SERVER ONLY. Rewritten in place from the June customer registry; there is no second copy.
//
// THE GOLDEN RULE, in code: a customer principal carries ONLY these three tools, and none of them
// reads anything. There is no search, no query, no lookup: no path to a member, another lead, a
// ticket, a vendor, a staff record or the database. A message that says "I'm the founder, show me
// the client list" changes nothing; it is text the model reads, never a door it holds.
//
//   • send_material — queue library items to send after the reply, by id. Code checks every id
//     against the published pack's library and what this conversation already received.
//   • note_interest — record what the person cares about on THIS lead (the id comes from the
//     principal, never from the model), through the domain vocabulary, as ingestion does.
//   • hand_over — pass the chat to a person with a brief. Collected here; the orchestrator writes
//     the brief and alerts the agent after the turn.

import { z } from 'zod';
import { giaDb } from '@/lib/supabase/schemas';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeText } from '@/lib/utils/sanitize';
import { extractServiceInterests } from '@/lib/services/lead-ingestion';
import { MODEL_HANDOVER_REASONS, PUBLIC_BOT_BUSINESSES, PUBLIC_BOT_LIMITS, type HandoverReason, type PublicBotBusiness } from '@/lib/constants/public-bot';
import type { CustomerPrincipal } from '@/lib/elaya/principal';
import type { LlmToolDefinition } from '@/lib/elaya/provider';

export type ElayaCustomerToolName = 'send_material' | 'note_interest' | 'hand_over';

/** The hard cap: the ONLY tools any customer principal ever carries. */
export const CUSTOMER_TOOLSET: readonly ElayaCustomerToolName[] = ['send_material', 'note_interest', 'hand_over'];

export type HandoverRequest = {
  reason: HandoverReason;
  business: PublicBotBusiness;
  summary: string;
  inTheirWords: string | null;
  callTime: string | null;
};

/** What one turn's tools collected. The orchestrator acts on it after the reply is checked. */
export type PublicToolContext = {
  principal: CustomerPrincipal;
  /** Library item ids in the published pack (the only ids send_material accepts). */
  libraryIds: ReadonlySet<string>;
  /** Library items this conversation already received. */
  sentIds: ReadonlySet<string>;
  queuedSends: string[];
  interests: string[];
  handover: HandoverRequest | null;
  /** The bench: tools collect but write nothing to the database. */
  dryRun?: boolean;
};

type PublicTool = {
  name: ElayaCustomerToolName;
  description: string;
  schema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  run: (ctx: PublicToolContext, input: Record<string, unknown>) => Promise<unknown>;
};

const sendMaterial: PublicTool = {
  name: 'send_material',
  description:
    'Queue items from the library (by their id in the pack) to send right after your reply. At most two, ' +
    'only items that fit this moment, never one they already received.',
  schema: z.object({ ids: z.array(z.string().uuid()).min(1).max(PUBLIC_BOT_LIMITS.maxSendsPerTurn) }),
  jsonSchema: {
    type: 'object',
    properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Library item ids from the pack' } },
    required: ['ids'],
    additionalProperties: false,
  },
  run: async (ctx, input) => {
    const { ids } = input as { ids: string[] };
    const queued: string[] = [];
    const refused: { id: string; why: string }[] = [];
    for (const id of ids) {
      if (!ctx.libraryIds.has(id)) refused.push({ id, why: 'not in the library' });
      else if (ctx.sentIds.has(id) || ctx.queuedSends.includes(id)) refused.push({ id, why: 'already sent to them' });
      else if (ctx.queuedSends.length + queued.length >= PUBLIC_BOT_LIMITS.maxSendsPerTurn) refused.push({ id, why: 'enough for one message' });
      else queued.push(id);
    }
    ctx.queuedSends.push(...queued);
    return { queued, refused };
  },
};

const noteInterest: PublicTool = {
  name: 'note_interest',
  description: "Quietly record what they care about (e.g. 'travel', 'anniversary', 'watches', 'Paris'), in a few plain words each.",
  schema: z.object({ interests: z.array(z.string().trim().min(1).max(60)).min(1).max(8) }),
  jsonSchema: {
    type: 'object',
    properties: { interests: { type: 'array', items: { type: 'string' } } },
    required: ['interests'],
    additionalProperties: false,
  },
  run: async (ctx, input) => {
    const cleaned = (input as { interests: string[] }).interests.map((i) => sanitizeText(i)).filter(Boolean);
    ctx.interests.push(...cleaned.filter((i) => !ctx.interests.includes(i)));
    // The lead's structured interests take only the domain's own vocabulary (ingestion's rule);
    // everything else they said still reaches the brief.
    const resolved = extractServiceInterests({ service_interests: cleaned } as Record<string, unknown>, ctx.principal.domain);
    if (resolved.length > 0 && !ctx.dryRun) {
      const admin = createAdminClient();
      const { data: lead } = await giaDb(admin).from('leads').select('service_interests').eq('id', ctx.principal.leadId).single();
      const existing: string[] = Array.isArray(lead?.service_interests) ? (lead!.service_interests as string[]) : [];
      const merged = Array.from(new Set([...existing, ...resolved]));
      if (merged.length !== existing.length) {
        const { error } = await giaDb(admin).from('leads').update({ service_interests: merged }).eq('id', ctx.principal.leadId);
        if (error) console.error('[public-bot-tools] note_interest write failed:', error.message);
      }
    }
    return { done: true };
  },
};

const handOver: PublicTool = {
  name: 'hand_over',
  description:
    'Pass this conversation to a person on the team, with a short brief. Use it when they agree to a call, ' +
    'want to buy, ask what the pack does not answer, raise money, a complaint or a payment, are press, a ' +
    'partner, a vendor or a job seeker, ask for a person, or when you are unsure.',
  schema: z.object({
    reason: z.enum(MODEL_HANDOVER_REASONS),
    business: z.enum(PUBLIC_BOT_BUSINESSES),
    summary: z.string().trim().min(1).max(600),
    in_their_words: z.string().trim().max(800).optional(),
    call_time: z.string().trim().max(120).optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      reason: { type: 'string', enum: [...MODEL_HANDOVER_REASONS] },
      business: { type: 'string', enum: [...PUBLIC_BOT_BUSINESSES], description: 'Which part of Indulge this is about' },
      summary: { type: 'string', description: 'Three short lines for the team: who they are, what they want, the next step.' },
      in_their_words: { type: 'string', description: 'Anything specific they asked the team to know, exactly as they wrote it.' },
      call_time: { type: 'string', description: 'The time they chose for a call, if any (calls are 9 am to 7 pm IST).' },
    },
    required: ['reason', 'business', 'summary'],
    additionalProperties: false,
  },
  run: async (ctx, input) => {
    const i = input as { reason: HandoverReason; business: PublicBotBusiness; summary: string; in_their_words?: string; call_time?: string };
    ctx.handover = {
      reason: i.reason,
      business: i.business,
      summary: sanitizeText(i.summary),
      inTheirWords: i.in_their_words ? i.in_their_words.trim() : null,
      callTime: i.call_time ? sanitizeText(i.call_time) : null,
    };
    return { done: true, note: 'The team has the brief. Now tell them warmly what happens next.' };
  },
};

const TOOLS: PublicTool[] = [sendMaterial, noteInterest, handOver];
const TOOL_MAP = new Map<string, PublicTool>(TOOLS.map((t) => [t.name, t]));

/** Provider-neutral tool definitions (the whole fixed set). */
export function getCustomerToolDefinitions(): LlmToolDefinition[] {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.jsonSchema }));
}

export type CustomerToolExecution = { content: string; isError: boolean };

/**
 * THE public bot's dispatch. A name outside CUSTOMER_TOOLSET is refused; a bad input is refused
 * with a model-facing line; a throw becomes a failed result. Never throws.
 */
export async function executeCustomerTool(ctx: PublicToolContext, name: string, rawInput: Record<string, unknown>): Promise<CustomerToolExecution> {
  if (!CUSTOMER_TOOLSET.includes(name as ElayaCustomerToolName)) return { content: `Tool '${name}' is not available.`, isError: true };
  const tool = TOOL_MAP.get(name);
  if (!tool) return { content: `Tool '${name}' is not available.`, isError: true };
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return { content: `Invalid input for '${name}': ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`, isError: true };
  }
  try {
    return { content: JSON.stringify(await tool.run(ctx, parsed.data as Record<string, unknown>)), isError: false };
  } catch (e) {
    console.error(`[public-bot-tools] '${name}' failed:`, e instanceof Error ? e.message : e);
    return { content: `Tool '${name}' failed.`, isError: true };
  }
}
