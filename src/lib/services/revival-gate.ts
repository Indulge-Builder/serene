// Lead Revival — the note-AI suppression gate. SERVER ONLY.
//
// A SINGLE-SHOT structured judgment, NOT a chat/tool loop. It reuses the Elaya
// provider + PII layer wholesale (R-01 / D-01): resolveLlmForJob('routing') → the
// Haiku-tier adapter.complete() with NO tools, notes masked via maskPii before the
// model. No second LLM integration, no new provider call, no new SDK import.
//
// THREE verdicts, three behaviours (the caller/sweep maps them):
//   • revive  → auto-task (the high bar — a genuine warm signal that died).
//   • dismiss → a candidate row written status='dismissed' (confident junk an agent
//               already disqualified) — kept as the audit log, NEVER surfaced in review.
//   • unsure  → the review tab (the ambiguous middle — a human decides).
// The gate is suppression-biased against 'revive', but it must COMMIT on dead leads
// ('dismiss') instead of draining them into 'unsure' and clogging review. A
// malformed/throwing model response FAILS CLOSED to 'unsure' — a glitch never
// auto-revives AND never auto-dismisses; it goes to a human.

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

const GATE_SYSTEM_PROMPT = `You are a lead-revival gate for a luxury concierge sales CRM.

A lead has gone silent. Read its recent notes and return ONE of three verdicts. Most leads are NOT revivable — you are biased against "revive". But you must also COMMIT: do not hide confidently-dead leads behind "unsure". "unsure" is only for the genuinely ambiguous middle, not a dumping ground.

The agent who wrote these notes already formed a view. When they recorded an explicit disqualifier, TRUST IT — that is "dismiss", not "unsure".

Choose verdict "dismiss" (confidently dead — NOT worth a human's second look) when the notes contain an explicit, agent-recorded disqualifier, e.g.:
- "not a prospect" / "doesn't need our services" / "not interested" / asked to stop / hard rejection.
- Own-network / internal / staff / friend-of-staff / not a real buyer.
- Only ever wanted information/details/pricing with no buying intent ("only wanted details", "just enquiring", "sending brochure only", "MBA student, only wanted details").
- Affordability is dead with no openness left ("can't afford", "too expensive", "not affordable for me") AND no genuine future-intent caveat.
- Doesn't recall the ad / clicked by mistake / no recollection of any interest.
- Pure unreachable with NO real conversation EVER and a standing wall (only RNR / switched off / wrong number / incoming-calls-barred — never actually spoke, no engagement to revive).

Choose verdict "revive" ONLY when the notes show a genuine warm signal that died from neglect — the bar is UNCHANGED, do not lower it:
- A real conversation happened, interest was expressed, and the thread simply went quiet (no rejection, no dead-end).
- A concrete future intent ("call me after Diwali", "circle back next month", "onboard in 3-4 months", "deciding with spouse") whose window has arrived or passed.
- A soft/temporary objection (timing, travel, busy, life event) rather than a hard no.

Choose verdict "unsure" (a human reviews it) for the AMBIGUOUS MIDDLE — never as a safe default for junk:
- A warm-but-stalled lead you can't cleanly call: real interest mixed with a soft objection or a stale/unclear follow-up window (e.g. "on hold, not sure when", "will get back" with no timeline, "will reach out when ready"). A warm lead is NEVER "dismiss" — when a real signal exists but you can't commit, choose "unsure".
- Effort made (video/brochure sent) but no response yet, where it's unclear if neglected or dead.
- Disconnected/unclear contact where you cannot tell rejection from accident.
- Notes too thin to judge either way.

Decision order: is there a genuine warm signal? → if clearly yes, "revive"; if a real signal exists but you can't commit, "unsure". No warm signal AND an explicit disqualifier or a standing unreachable wall? → "dismiss". Otherwise → "unsure".

Output STRICT JSON ONLY (no prose, no markdown, no code fence), exactly:
{"verdict":"revive"|"unsure"|"dismiss","reasoning":"<one short sentence, max 200 chars, citing the note signal>","suggested_revive_at":"<YYYY-MM-DD or null>"}

"suggested_revive_at" only applies to "revive" (null otherwise). Never invent facts not in the notes.`;

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
  // Honour exactly the three known verdicts; ANYTHING ELSE (missing, garbled, a
  // novel word) collapses to 'unsure' — the safe middle. The bias is asymmetric on
  // BOTH ends: an unrecognised verdict never auto-revives AND never auto-dismisses
  // — it goes to a human. Only an exact "revive"/"dismiss" earns its behaviour.
  const safeVerdict: RevivalGateVerdict["verdict"] =
    verdict === "revive" ? "revive" : verdict === "dismiss" ? "dismiss" : "unsure";

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
