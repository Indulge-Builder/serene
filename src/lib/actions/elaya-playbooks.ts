"use server";
// actions/elaya-playbooks.ts — the /settings/elaya-playbooks write path (admin/founder). The table
// has no user write RLS: this gated action on the service role IS the sanctioned write path (the
// ticket-settings posture). The router reads active playbooks per turn, so a save applies on the
// very next message, no deploy.
import { revalidatePath } from "next/cache";
import { requireProfile } from "./_auth";
import { parseActionInput } from "./_validation";
import { sanitizeText } from "@/lib/utils/sanitize";
import { DeleteElayaPlaybookSchema, DraftElayaPlaybookSchema, UpsertElayaPlaybookSchema } from "@/lib/validations/elaya-playbook-schema";
import { draftPlaybookFromNotes, type PlaybookDraft } from "@/lib/services/elaya-playbook-drafter";
import { resolveStaffPrincipal } from "@/lib/elaya/principal";
import { deleteElayaPlaybookCore, upsertElayaPlaybookCore, type ElayaPlaybookRow } from "@/lib/services/elaya-playbooks-service";
import { ELAYA_PLAYBOOKS_PATH } from "@/lib/constants/elaya";
import type { ActionResult } from "@/lib/types";

const ROLES = ["admin", "founder"] as const;

export async function upsertElayaPlaybookAction(input: unknown): Promise<ActionResult<ElayaPlaybookRow>> {
  const parsed = parseActionInput(UpsertElayaPlaybookSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...ROLES]);
  if (!auth.ok) return auth.result;
  const clean = {
    ...parsed.data,
    title: sanitizeText(parsed.data.title),
    // The instructions are read by the model, never rendered as HTML. sanitizeText collapses all
    // whitespace, so it runs per LINE: the founder's steps stay on their own lines.
    instructions: parsed.data.instructions.split(/\r?\n/).map((l) => sanitizeText(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    example_questions: parsed.data.example_questions.map((q) => sanitizeText(q)).filter((q) => q.length >= 3),
  };
  if (clean.example_questions.length === 0) return { data: null, error: "Add at least one example question." };
  const res = await upsertElayaPlaybookCore(auth.profile.id, clean);
  if (res.error || !res.data) return { data: null, error: res.error ?? "The playbook could not be saved just now." };
  revalidatePath(ELAYA_PLAYBOOKS_PATH);
  return { data: res.data, error: null };
}

export async function deleteElayaPlaybookAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(DeleteElayaPlaybookSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...ROLES]);
  if (!auth.ok) return auth.result;
  const res = await deleteElayaPlaybookCore(parsed.data.id);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(ELAYA_PLAYBOOKS_PATH);
  return { data: { id: parsed.data.id }, error: null };
}

/** The founder's spoken notes → a playbook DRAFT for the preview. Saves nothing; the ordinary upsert does. */
export async function draftElayaPlaybookAction(input: unknown): Promise<ActionResult<PlaybookDraft>> {
  const parsed = parseActionInput(DraftElayaPlaybookSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...ROLES]);
  if (!auth.ok) return auth.result;
  const draft = await draftPlaybookFromNotes(resolveStaffPrincipal(auth.profile), sanitizeText(parsed.data.notes));
  if (!draft) return { data: null, error: "Elaya could not shape that into a playbook. Try saying it again with the question and what the answer must cover." };
  return { data: draft, error: null };
}
