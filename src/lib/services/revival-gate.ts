// Lead Revival — the note-AI suppression gate. SERVER ONLY.
//
// A SINGLE-SHOT structured judgment, NOT a chat/tool loop. It reuses the Elaya
// provider + PII layer wholesale (R-01 / D-01): resolveLlmForJob('routing') → the
// Haiku-tier adapter.complete() with NO tools, notes masked via maskPii before the
// model. No second LLM integration, no new provider call, no new SDK import.
//
// The gate's job is MOSTLY SUPPRESSION — it errs toward 'unsure' (never revive).
// 'unsure' lands in the review tab (a human decides); only a confident 'revive'
// can become an auto-task. A malformed/throwing model response FAILS CLOSED to
// 'unsure' — a glitch never auto-revives.

import "server-only";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { getLeadNotesFull } from "@/lib/services/leads-service";
import {
  REVIVAL_GATE_MAX_NOTES,
  REVIVAL_GATE_MAX_NOTES_CHARS,
  type RevivalTriggerStatus,
} from "@/lib/constants/revival";
import type { PiiMaskingDepth } from "@/lib/services/llm-providers-service";
import type { RevivalGateVerdict } from "@/lib/types/revival";

// ─────────────────────────────────────────────
// System prompt — the suppression bias lives HERE, in code (not the model's whim).
// ─────────────────────────────────────────────

const GATE_SYSTEM_PROMPT = `You are a lead-revival SUPPRESSION gate for a luxury concierge sales CRM.

A lead has gone silent. Your ONE job is to read its recent notes and decide whether it is worth an agent's time to re-engage NOW — and to SUPPRESS the junk. You are biased toward NOT reviving. When in doubt, you choose "unsure" (a human reviews it) — you NEVER guess "revive".

Choose verdict "unsure" (do NOT revive) when the notes show ANY of:
- Own-network / internal / staff / friend-of-staff lead (not a real prospect).
- The person only ever wanted information/details/pricing and showed no real buying intent ("only wanted details", "just enquiring", "sending brochure only").
- Affordability is dead — they said it's too expensive / out of budget / can't afford it, with no openness left.
- Pure no-response with NO real conversation ever (only "RNR", "switched off", "not picking", "wrong number" — never actually spoke). These are handled by other follow-up tooling, not revival.
- Explicitly not interested / asked to stop / hard rejection.
- The notes are empty, contentless, or you cannot tell.

Choose verdict "revive" ONLY when the notes show a genuine warm signal that died from neglect, e.g.:
- A real conversation happened, interest was expressed, and the thread simply went quiet (no rejection, no dead-end).
- A concrete future intent ("call me after Diwali", "circle back next month", "deciding with spouse") whose window has now arrived or passed.
- A soft/temporary objection (timing, travel, busy) rather than a hard no.

Output STRICT JSON ONLY (no prose, no markdown, no code fence), exactly:
{"verdict":"revive"|"unsure","reasoning":"<one short sentence, max 200 chars, why>","suggested_revive_at":"<YYYY-MM-DD or null>"}

"reasoning" must cite the note signal that drove the call. "suggested_revive_at" is your best date to re-engage (null if you have no basis). Never invent facts not in the notes.`;

// ─────────────────────────────────────────────
// The judgment call.
// ─────────────────────────────────────────────

const FALLBACK_UNSURE: RevivalGateVerdict = {
  verdict: "unsure",
  reasoning: "Could not confidently assess — sent to review.",
  suggestedReviveAt: null,
};

/**
 * THE gate judgment on a prepared notes blob: mask → routing-tier complete() with
 * NO tools → parse. This is the part that exercises the model; `judgeLeadForRevival`
 * is the DB-read wrapper around it. Kept separate so the judgment can be evaluated
 * on arbitrary notes (e.g. a local calibration script) without a DB lead row, while
 * the lead path stays byte-identical.
 *
 * The caller supplies the masking depth so this stays I/O-free (the lead wrapper
 * resolves it from `elaya_settings`; an eval can pass 'light' directly). FAILS
 * CLOSED to 'unsure' on a malformed model response or any throw.
 */
export async function judgeNotesForRevival(
  notesBlob: string,
  triggerStatus: RevivalTriggerStatus,
  maskingDepth: PiiMaskingDepth,
): Promise<RevivalGateVerdict> {
  try {
    // PII gateway — same masking the brain uses (D-01 interim mechanism).
    const maskedBlob = maskPii(notesBlob, maskingDepth);

    const llm = await resolveLlmForJob("routing");
    const result = await llm.adapter.complete({
      model: llm.model,
      maxTokens: Math.min(llm.maxTokens, 300),
      system: GATE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            `Lead status: ${triggerStatus}\n` +
            `Recent notes (newest first):\n${maskedBlob}\n\n` +
            `Return the JSON verdict.`,
        },
      ],
      // NO tools — single-shot classification.
    });

    return parseGateVerdict(result.text) ?? FALLBACK_UNSURE;
  } catch (e) {
    console.error(
      "[revival-gate] judgeNotesForRevival failed (fail-closed to unsure):",
      e instanceof Error ? e.message : e,
    );
    return FALLBACK_UNSURE;
  }
}

/**
 * Build the recent-notes blob from full note rows (newest-first; cap count + chars)
 * exactly as the lead path feeds the gate. Exported so an eval can format raw note
 * strings the same way production does.
 */
export function buildRevivalNotesBlob(
  notes: Array<{ content: string | null; created_at?: string | null; authorName?: string | null }>,
): string {
  const recent = notes.slice(0, REVIVAL_GATE_MAX_NOTES);
  let blob = recent
    .map((n) => {
      const author = n.authorName ?? "agent";
      const when = (n.created_at ?? "").slice(0, 10);
      return `[${when} · ${author}] ${n.content ?? ""}`.trim();
    })
    .join("\n");
  if (blob.length > REVIVAL_GATE_MAX_NOTES_CHARS) {
    blob = blob.slice(0, REVIVAL_GATE_MAX_NOTES_CHARS) + "…";
  }
  return blob;
}

/**
 * Judge one lead. Reads its recent notes (getLeadNotesFull — the canonical notes
 * read path), masks them through the PII gateway, and runs the routing-tier gate.
 *
 * FAILS CLOSED: an empty notes set, a malformed model response, or any throw
 * returns a conservative 'unsure' verdict — never 'revive'.
 */
export async function judgeLeadForRevival(input: {
  leadId: string;
  triggerStatus: RevivalTriggerStatus;
}): Promise<RevivalGateVerdict> {
  try {
    const notes = await getLeadNotesFull(input.leadId);
    if (notes.length === 0) {
      return {
        verdict: "unsure",
        reasoning: "No notes on file to judge — sent to review.",
        suggestedReviveAt: null,
      };
    }

    const blob = buildRevivalNotesBlob(
      notes.map((n) => ({
        content: n.content,
        created_at: n.created_at,
        authorName: n.author?.full_name ?? null,
      })),
    );

    const maskingDepth = await getPiiMaskingDepth();
    return judgeNotesForRevival(blob, input.triggerStatus, maskingDepth);
  } catch (e) {
    console.error(
      "[revival-gate] judgeLeadForRevival failed (fail-closed to unsure):",
      e instanceof Error ? e.message : e,
    );
    return FALLBACK_UNSURE;
  }
}

// ─────────────────────────────────────────────
// Parse — tolerant JSON extraction, then validate the shape. Returns null on any
// shape it cannot trust (caller falls closed to 'unsure').
// ─────────────────────────────────────────────

function parseGateVerdict(text: string): RevivalGateVerdict | null {
  const raw = text.trim();
  // Models occasionally wrap JSON in a code fence despite instructions — strip it.
  const fenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // Grab the first {...} block (defensive against any leading prose).
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  const verdict = o.verdict;
  // Only an explicit, exact "revive" is honoured — anything else is suppression.
  const safeVerdict: RevivalGateVerdict["verdict"] = verdict === "revive" ? "revive" : "unsure";

  const reasoningRaw = typeof o.reasoning === "string" ? o.reasoning.trim() : "";
  const reasoning =
    reasoningRaw.length > 0 ? reasoningRaw.slice(0, 300) : "No reasoning supplied by the gate.";

  let suggestedReviveAt: string | null = null;
  const s = o.suggested_revive_at;
  if (typeof s === "string" && s !== "null" && s.trim().length > 0) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) suggestedReviveAt = d.toISOString();
  }

  return { verdict: safeVerdict, reasoning, suggestedReviveAt };
}
