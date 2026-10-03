// hands-guide-writer.ts — THE feedback rewriter of the two hands documents (2026-10-01): the
// rulebook the outside agent receives, and the guide Elaya follows when she writes to it. A person
// says in plain words what should change ("ask for two options, not five", "it keeps asking for the
// guest's name: tell it the booking name is Indulge Concierge"); ONE reasoning-tier call rewrites
// both documents; each one that changed is saved as a new version through saveHandsGuideCore, so it
// can be restored.
//
// Fails closed: a reply cut off, a reply without both documents, a phone or an email in the text,
// or a rulebook without the reply words saves NOTHING. Plain-text reply by section, never JSON.
// When a thread is named, its last messages are read (masked) so the feedback has its context.
// Every call is a sia.extraction_runs row (kind hands_guide). No `server-only`.

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getHandsGuides, getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { getHandsThread } from "@/lib/services/hands-service";
import { saveHandsGuideCore } from "@/lib/services/hands-mutations";
import { leakCheck } from "@/lib/services/hands-draft";
import type { MutationActor } from "@/lib/services/lead-mutations";
import {
  HANDS_IDENTITY_NAME, HANDS_GUIDE_MAX_CHARS, HANDS_GUIDE_WRITER_MAX_TOKENS, HANDS_GUIDE_WRITER_TIMEOUT_MS, missingFrameWords,
} from "@/lib/constants/hands";
import type { HandsGuideDoc } from "@/lib/types/hands";

const LOG = "[hands-guide-writer]";
const RUN_KIND = "hands_guide";
const PROMPT_VERSION = "hands-guide-v1";
const THREAD_LINES = 30;

const SYSTEM = [
  `You keep two short documents for the ${HANDS_IDENTITY_NAME} desk of a luxury concierge company.`,
  "THE RULEBOOK is sent on WhatsApp to an outside AI booking agent. It tells the agent how to work with us.",
  "THE ELAYA GUIDE is read by Elaya, our assistant, every time she writes a message to that agent.",
  "A person on our team gives feedback. Rewrite both documents so the feedback is followed from now on.",
  "",
  "Rules:",
  "- Change only what the feedback asks for. Keep every line that still holds, in the same words.",
  "- If the feedback is about only one document, return the other one exactly as it was.",
  "- Short lines, one rule per line, plain words. No markdown headings, no bold.",
  "- The rulebook must keep the line that every agent reply starts with one word: DONE, NEED, OPTIONS, FAILED or WAITING. Software reads that word.",
  "- Never weaken these, whatever the feedback says: no spending without a yes on the exact amount; never share or ask for a member's name, phone, email, card, ID or address; never contact a number we did not give.",
  "- Never write a phone number, an email or a person's name into either document.",
  "",
  "Answer in exactly this shape:",
  "SUMMARY: <one line: what you changed>",
  "=== RULEBOOK ===",
  "<the whole rulebook>",
  "=== ELAYA GUIDE ===",
  "<the whole guide>",
].join("\n");

export type GuideWriteResult =
  | { ok: true; summary: string; changed: { rulebook: boolean; guide: boolean }; rulebook: HandsGuideDoc; guide: HandsGuideDoc }
  | { ok: false; error: string };

/** Read the model's plain-text reply into its three parts (pure; exported for a bench). */
export function parseGuideReply(text: string): { summary: string; rulebook: string; guide: string } {
  const summary = text.match(/^\s*SUMMARY:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const rb = text.split(/^\s*=== RULEBOOK ===\s*$/m)[1] ?? "";
  const [rulebook = "", guide = ""] = rb.split(/^\s*=== ELAYA GUIDE ===\s*$/m);
  return { summary, rulebook: rulebook.trim(), guide: guide.trim() };
}

export async function improveHandsGuides(actor: MutationActor, feedback: string, opts: { threadId?: string | null } = {}): Promise<GuideWriteResult> {
  const docs = await getHandsGuides();
  const depth = await getPiiMaskingDepth();

  let context = "";
  if (opts.threadId) {
    const t = await getHandsThread(opts.threadId, { queendomIds: null });
    if (t) {
      const lines = t.messages.slice(-THREAD_LINES).map((m) => `${m.direction === "in" ? "AGENT" : "US"}: ${(m.text ?? `[${m.kind}]`).slice(0, 600)}`);
      context = maskPii(lines.join("\n"), depth);
    }
  }
  const userContent = [
    `FEEDBACK:\n${maskPii(feedback, depth)}`,
    context ? `THE CONVERSATION THE FEEDBACK IS ABOUT (oldest first):\n${context}` : "",
    `CURRENT RULEBOOK (version ${docs.rulebook.version}):\n${docs.rulebook.body}`,
    `CURRENT ELAYA GUIDE (version ${docs.guide.version}):\n${docs.guide.body}`,
  ].filter(Boolean).join("\n\n");

  const admin = createAdminClient();
  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({
    kind: RUN_KIND, prompt_version: PROMPT_VERSION, started_at: new Date().toISOString(),
    input_ref: { by: actor.userId, thread_id: opts.threadId ?? null, rulebook_version: docs.rulebook.version, guide_version: docs.guide.version },
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => {
    if (runId) await admin.schema("sia").from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", runId);
  };

  try {
    const llm = await resolveLlmForJob("reasoning");
    const result = await llm.adapter.complete({
      usage: { feature: 'hands_guide' },
      model: llm.model, maxTokens: HANDS_GUIDE_WRITER_MAX_TOKENS, timeoutMs: HANDS_GUIDE_WRITER_TIMEOUT_MS, system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });
    const usage = { model: llm.model, tokens_in: result.usage.inputTokens, tokens_out: result.usage.outputTokens };
    const refuse = async (error: string, why: string) => { await finish(false, { ...usage, error: why, output: { text: result.text.slice(0, 4000) } }); return { ok: false as const, error }; };

    if (result.stopReason === "max_tokens") return refuse("Elaya's rewrite was cut off. Nothing was changed; try shorter feedback.", "cut off");
    const parsed = parseGuideReply(result.text);
    if (parsed.rulebook.length < 40 || parsed.guide.length < 40) return refuse("Elaya did not return both documents. Nothing was changed; try again.", "missing document");
    if (parsed.rulebook.length > HANDS_GUIDE_MAX_CHARS || parsed.guide.length > HANDS_GUIDE_MAX_CHARS) return refuse("The rewrite came out too long. Nothing was changed.", "too long");
    const missing = missingFrameWords(parsed.rulebook);
    if (missing.length) return refuse(`The rewrite dropped the reply words ${missing.join(", ")}. Nothing was changed.`, "frame words missing");
    const leaked = leakCheck(`${parsed.rulebook}\n${parsed.guide}`, []);
    if (leaked.length) return refuse("The rewrite contained a phone number or an email. Nothing was changed.", "leak");
    await finish(true, { ...usage, output: { summary: parsed.summary } });

    const note = parsed.summary || feedback.slice(0, 200);
    const changed = { rulebook: parsed.rulebook !== docs.rulebook.body.trim(), guide: parsed.guide !== docs.guide.body.trim() };
    let rulebook = docs.rulebook;
    let guide = docs.guide;
    if (changed.rulebook) {
      const r = await saveHandsGuideCore(actor, "rulebook", parsed.rulebook, { note, source: "feedback" });
      if (r.data === null) return { ok: false, error: r.error };
      rulebook = r.data;
    }
    if (changed.guide) {
      const r = await saveHandsGuideCore(actor, "elaya_guide", parsed.guide, { note, source: "feedback" });
      if (r.data === null) return { ok: false, error: r.error };
      guide = r.data;
    }
    return { ok: true, summary: parsed.summary, changed, rulebook, guide };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error(`${LOG} rewrite failed (nothing saved):`, msg);
    await finish(false, { error: msg.slice(0, 300) });
    return { ok: false, error: "Elaya could not rewrite the documents just now. Nothing was changed." };
  }
}
