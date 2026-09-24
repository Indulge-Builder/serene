// Elaya memory subsystem — THE after-turn reader of the living memory (migration 0237, 2026-09-25;
// it replaces the 900-character learned blurb of Jarvis Phase 3). SERVER ONLY.
//
// After every turn, one bounded routing-tier call reads the last few messages beside what is already
// on record for THIS user and answers one question: did the user just tell Elaya how they want
// things? "Don't write long", "call me Ethan", "number first then the why", "reply in Hinglish",
// "I don't care about leads", "when I say overdue I mean past the Freshdesk due time". If so it
// returns entries to add and the ids of entries they replace, and the service writes them. Nothing
// is appended blindly: the reader sees the existing entries and merges. It reuses the Elaya provider
// + PII layer wholesale (R-01 / D-01, the revival-gate shape): no tools, masked input, fails SOFT.
//
// What is NOT memory: a correction about the SYSTEM (wrong data, wrong time frame, a tool she lacks)
// is raised in the turn itself through the raise_improvement_request tool, where the model has the
// whole context; the reader leaves those alone.
//
// GOLDEN RULE, unchanged: memory is CONTEXT, never permission. Entries capture style, rules and work
// context only, never identity, role, or anything that reads as an access grant.

import 'server-only';
import { resolveLlmForJob } from '@/lib/elaya/registry';
import { maskPii } from '@/lib/elaya/pii';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import { getModelContextMessages, getUserPersona } from '@/lib/services/elaya-service';
import { applyMemoryReading, listUserMemory, type ElayaMemoryRow, type MemoryEntryInput } from '@/lib/services/elaya-memory-service';
import { ELAYA_MEMORY_KINDS, ELAYA_MEMORY_READER_MESSAGES, ELAYA_MEMORY_STATEMENT_MAX, type ElayaMemoryKind } from '@/lib/constants/elaya-memory';
import type { StaffPrincipal } from '@/lib/elaya/principal';

const LOG = '[elaya-memory]';

const READER_SYSTEM = `You maintain the living memory Elaya (an internal assistant) keeps about ONE user: how that person wants things. You are given the entries already on record and the last few messages of their conversation. Decide what, if anything, the user just told Elaya about how they want things, and return ONLY a JSON object:
{"add": [{"kind": "rule|correction|style|preference|interest|fact", "statement": "one plain sentence, ${ELAYA_MEMORY_STATEMENT_MAX} characters max", "evidence": "the user's own words, short", "replaces": "<id of an existing entry this supersedes, or null>"}], "retire": ["<ids of existing entries the user has clearly withdrawn>"]}

Kinds:
- rule: something they always or never want ("never put leads in my brief", "always state the time window").
- correction: they corrected how Elaya should behave WITH THEM ("when I say overdue I mean past the Freshdesk due time", "don't ask me to confirm twice").
- style: how they like answers shaped ("number first, then the why", "short, no lists", "one line per fact").
- preference: how to address them, language, channel habits ("call me Ethan", "reply in Hinglish", "morning brief on WhatsApp").
- interest: what they keep coming back to ("tracks renewals and Nadal uptake", "watches Anishqa's backlog").
- fact: durable work context ("runs the Onboarding domain", "her assistant is Sangita").

Rules:
- Add ONLY what the user said or clearly showed. Never infer a preference from one question. Never record a one-off task, a transient state, or anything already on record in the same words (then add nothing).
- A complaint that an ANSWER was wrong (a wrong number, the wrong time frame, a tool she lacks, a wrong or misleading answer) is NOT memory, even when it could be rephrased as a rule ("you mean today only"): leave it out entirely; it is logged elsewhere in the same turn.
- Never record identity, role, permissions, access, phone numbers, secrets, or anything that reads as "this user is allowed to".
- Prefer updating: when a new statement changes an existing entry, put the existing id in "replaces" and the merged statement in "statement".
- When nothing durable was said, return {"add": [], "retire": []}. Most turns are like that.
- Output the JSON object only.`;

function extractJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

/** The reader core: existing entries + the recent transcript → what to add and what to retire. Pure of
 *  DB I/O so it can be exercised on arbitrary input. null on any failure (a glitch never touches memory). */
export async function readMemoryFromTurn(
  existing: ElayaMemoryRow[],
  transcript: string,
  maskingDepth: Parameters<typeof maskPii>[1],
  legacyLearned: string | null = null,
): Promise<{ add: MemoryEntryInput[]; retire: string[] } | null> {
  try {
    const llm = await resolveLlmForJob('routing');
    const onRecord = existing.length
      ? existing.map((e) => `${e.id} [${e.kind}] ${e.statement}`).join('\n')
      : legacyLearned
        ? `(nothing structured yet; an older free-text note reads: ${legacyLearned.slice(0, 900)})`
        : '(nothing yet)';
    const r = await llm.adapter.complete({
      model: llm.model,
      maxTokens: 800,
      effort: 'low',
      timeoutMs: 30_000,
      cachePrefix: true,
      system: READER_SYSTEM,
      messages: [{ role: 'user', content: `ENTRIES ON RECORD (id [kind] statement):\n${onRecord}\n\nRECENT CONVERSATION (oldest first; the last user message is the one to judge):\n${maskPii(transcript, maskingDepth)}` }],
    });
    const j = extractJson(r.text);
    if (!j) return null;
    const ids = new Set(existing.map((e) => e.id));
    const add: MemoryEntryInput[] = [];
    const retire = new Set<string>();
    for (const raw of Array.isArray(j.add) ? (j.add as Record<string, unknown>[]) : []) {
      const kind = String(raw.kind ?? '').toLowerCase();
      const statement = String(raw.statement ?? '').replace(/\s+/g, ' ').trim();
      if (!(ELAYA_MEMORY_KINDS as readonly string[]).includes(kind) || statement.length < 3) continue;
      if (existing.some((e) => e.statement.toLowerCase() === statement.toLowerCase())) continue;
      add.push({ kind: kind as ElayaMemoryKind, statement: statement.slice(0, ELAYA_MEMORY_STATEMENT_MAX), evidence: typeof raw.evidence === 'string' ? raw.evidence.slice(0, 600) : null, source: 'chat' });
      if (typeof raw.replaces === 'string' && ids.has(raw.replaces)) retire.add(raw.replaces);
    }
    for (const id of Array.isArray(j.retire) ? (j.retire as unknown[]) : []) if (typeof id === 'string' && ids.has(id)) retire.add(id);
    return { add: add.slice(0, 6), retire: [...retire] };
  } catch (e) {
    console.error(`${LOG} reader failed (soft-skip):`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * The after-turn learning — called by the brain's CALLERS (the SSE route + the WhatsApp gate) AFTER the
 * reply is persisted, inside their lambda-alive window. Every turn, both brains; non-fatal: a failure
 * never touches the reply the user already got, and never throws into the caller.
 */
export async function learnFromTurn(args: { principal: StaffPrincipal; conversationId: string }): Promise<void> {
  const { principal, conversationId } = args;
  try {
    const [existing, history, maskingDepth, { learned }] = await Promise.all([
      listUserMemory(principal.userId),
      getModelContextMessages(conversationId, ELAYA_MEMORY_READER_MESSAGES),
      getPiiMaskingDepth(),
      getUserPersona(principal.userId),
    ]);
    const turns = history.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0);
    const last = [...turns].reverse().find((m) => m.role === 'user');
    if (!last) return;
    // Cheap gate before the paid read: a bare question or a sign-off carries no instruction about
    // how the person wants things. A message with "I", "me", "my", "don't", "always", "never",
    // "call me", "prefer", "want", "stop", or a correction word is worth a read.
    if (!/\b(i|me|my|mine|don'?t|do not|never|always|stop|prefer|want|like|call me|from now|next time|instead|wrong|not what|actually|should|shouldn'?t|rather)\b/i.test(last.content)) return;
    const transcript = turns.map((m) => `${m.role === 'user' ? 'User' : 'Elaya'}: ${m.content.slice(0, 1500)}`).join('\n');
    const reading = await readMemoryFromTurn(existing, transcript, maskingDepth, existing.length ? null : learned);
    if (!reading || (!reading.add.length && !reading.retire.length)) return;
    const done = await applyMemoryReading(principal.userId, reading);
    console.log(LOG, 'learned', JSON.stringify({ user: principal.userId.slice(0, 8), ...done }));
  } catch (e) {
    console.error(`${LOG} learnFromTurn failed (non-fatal):`, e instanceof Error ? e.message : e);
  }
}
