// elaya-playbook-drafter.ts — turns the founder's spoken (or typed) notes into a playbook DRAFT.
//
// "When I ask this, I need all these details": the founder speaks it, the transcript lands here,
// and one reasoning-tier call (the Elaya provider, no tools, no new SDK) shapes it into what the
// router and the brain can use: a short title, example questions the way people really ask, and
// step-by-step instructions that name Elaya's real tools, keep the call budget small, and treat the
// playbook as a METHOD, never a source of facts. The draft is only a preview: the founder reads it,
// edits it, and only then saves it through the ordinary action. Fails closed to an error, never to
// a half-made playbook.

import { resolveLlmForJob } from '@/lib/elaya/registry';
import { getToolDefinitionsForPrincipal } from '@/lib/elaya/tools/registry';
import type { StaffPrincipal } from '@/lib/elaya/principal';

export type PlaybookDraft = { title: string; example_questions: string[]; instructions: string };

const SYSTEM = `You write PLAYBOOKS for Elaya, the AI inside Indulge's operating system (Serene). A playbook teaches Elaya how to answer one KIND of question. The founder describes what he wants in loose spoken words; you turn it into a clean draft.

Return ONLY a JSON object with exactly these keys, no prose, no code fence:
{"title": "...", "example_questions": ["...", "..."], "instructions": "..."}

Rules for the draft:
- title: 3 to 8 words naming the kind of question, e.g. "What's happening in a queendom".
- example_questions: 4 to 8 short questions the way people really type or say them on WhatsApp, including at least one casual or misspelt one. Use a placeholder in square brackets for the variable part, e.g. "what all happened in [queendom]".
- instructions: numbered steps, plain words, 5 to 9 steps, each on its own line. They must cover, in this order where it applies:
  1. the time frame: check the recent messages for one; say the default when none is given (the founder usually wants today in full plus the last 3 and 7 days in brief); say the window used;
  2. the scope: exactly which records count (one queendom, one member, one event) and what to exclude;
  3. which of Elaya's tools to use for each part, by their real names, and a call budget ("at most six tool calls, then answer");
  4. what to lead with (what needs attention now), then the rest;
  5. how to present: short lines, names and numbers with dates, no all-time totals unless asked, no percentages unless asked, say when a part is unavailable, always finish with an answer.
- A playbook is a METHOD. Never put facts, names of real members, or numbers in it.
- Keep every instruction that the founder actually asked for; add the standard steps above around them; drop nothing he said.
- Write in simple English. The founder's notes may be in Hinglish or messy; the draft is clean.`;

function toolCatalog(principal: StaffPrincipal): string {
  return getToolDefinitionsForPrincipal(principal)
    .map((t) => `- ${t.name}: ${t.description.split(/(?<=\.)\s/)[0].slice(0, 170)}`)
    .join('\n');
}

function parseDraft(text: string): PlaybookDraft | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(text.slice(start, end + 1)) as Partial<PlaybookDraft>;
    const title = typeof j.title === 'string' ? j.title.trim() : '';
    const qs = Array.isArray(j.example_questions) ? j.example_questions.filter((q): q is string => typeof q === 'string').map((q) => q.trim()).filter(Boolean) : [];
    const instructions = typeof j.instructions === 'string' ? j.instructions.trim() : '';
    if (title.length < 2 || qs.length === 0 || instructions.length < 10) return null;
    return { title: title.slice(0, 120), example_questions: qs.slice(0, 12).map((q) => q.slice(0, 200)), instructions: instructions.slice(0, 6000) };
  } catch {
    return null;
  }
}

/** One reasoning-tier call; null when the model could not produce a usable draft (the caller says so). */
export async function draftPlaybookFromNotes(principal: StaffPrincipal, notes: string): Promise<PlaybookDraft | null> {
  try {
    const llm = await resolveLlmForJob('reasoning');
    const result = await llm.adapter.complete({
      model: llm.model,
      maxTokens: Math.min(llm.maxTokens, 2500),
      effort: 'low',
      system: `${SYSTEM}\n\nElaya's tools available to this founder (use these names in the steps):\n${toolCatalog(principal)}`,
      messages: [{ role: 'user', content: `The founder's notes (spoken, may be messy):\n"""\n${notes.slice(0, 6000)}\n"""\n\nReturn the JSON draft.` }],
    });
    return parseDraft(result.text ?? '');
  } catch (e) {
    console.error('[elaya-playbook-drafter] failed:', e instanceof Error ? e.message : e);
    return null;
  }
}
