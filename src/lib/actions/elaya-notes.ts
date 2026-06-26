"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/actions/_auth";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formErrors } from "@/lib/validations/form-errors";
import {
  upsertNoteSchema,
  deleteNoteSchema,
} from "@/lib/validations/elaya-notes-schema";
import { ELAYA_NOTES_MAX_PER_USER } from "@/lib/constants/elaya-notes";
import type { ActionResult } from "@/lib/types";
import type { ElayaNoteRow } from "@/lib/types/elaya-notes";

const NOTES_TABLE = "elaya_notes";

// ─────────────────────────────────────────────────────────────────────────
// upsertNote — create (no id) or update (id) one of the caller's OWN notes.
// Any staff (no role list — notes are personal, every user has them). Zod-first
// (Rule 02), sanitizeText on both text fields (Rule 06). SESSION client — the
// owner-only RLS (migration 0152) is the enforcement: an INSERT writes user_id =
// the authenticated caller (never from the form), an UPDATE can only touch the
// caller's own rows. A note is CONTENT Elaya reads, never a permission.
// ─────────────────────────────────────────────────────────────────────────
export async function upsertNote(
  _prevState: ActionResult<ElayaNoteRow>,
  formData: FormData,
): Promise<ActionResult<ElayaNoteRow>> {
  // 1. Zod-first (Rule 02) — before auth, before any DB work.
  const rawId = formData.get("id");
  const parsed = upsertNoteSchema.safeParse({
    id: rawId ? String(rawId) : null,
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? formErrors.generic };
  }

  // 2. Auth gate (A-18 / Rule 09) — any signed-in staff member.
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const userId = auth.profile.id;

  const { id, title, body } = parsed.data;

  // 3. sanitizeText on every free-text field (Rule 06).
  const row = {
    title: sanitizeText(title),
    body: sanitizeText(body),
  };

  // Not yet in the generated Database type (interim — regen drops the cast).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  if (id) {
    // UPDATE — RLS scopes to the caller's own rows; a foreign id matches zero rows.
    const { data, error } = await supabase
      .from(NOTES_TABLE)
      .update(row)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) return { data: null, error: formErrors.generic };
    revalidatePath("/notes");
    return { data: data as ElayaNoteRow, error: null };
  }

  // CREATE — enforce the soft per-user cap before inserting.
  const { count } = await supabase
    .from(NOTES_TABLE)
    .select("id", { count: "exact", head: true });
  if (typeof count === "number" && count >= ELAYA_NOTES_MAX_PER_USER) {
    return {
      data: null,
      error: `You've reached the ${ELAYA_NOTES_MAX_PER_USER}-note limit. Edit or remove a note to add another.`,
    };
  }

  // user_id is the authenticated caller — NEVER taken from the form (A-01).
  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .insert({ ...row, user_id: userId })
    .select("*")
    .single();
  if (error || !data) return { data: null, error: formErrors.generic };
  revalidatePath("/notes");
  return { data: data as ElayaNoteRow, error: null };
}

// ─────────────────────────────────────────────────────────────────────────
// deleteNote — hard delete one of the caller's OWN notes. Session client + owner
// RLS — a foreign id deletes nothing. Idempotent-friendly: a missing row → error
// copy, never a throw.
// ─────────────────────────────────────────────────────────────────────────
export async function deleteNote(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteNoteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? formErrors.generic };
  }

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase
    .from(NOTES_TABLE)
    .delete()
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { data: null, error: formErrors.generic };
  revalidatePath("/notes");
  return { data: { id: data.id as string }, error: null };
}
