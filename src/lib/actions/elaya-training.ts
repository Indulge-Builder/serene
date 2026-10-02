"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formErrors } from "@/lib/validations/form-errors";
import {
  upsertTrainingAssetSchema,
  deleteTrainingAssetSchema,
  approveTrainingAssetSchema,
} from "@/lib/validations/elaya-training-schema";
import type { ActionResult, UserRole } from "@/lib/types";
import type { TrainingAssetRow } from "@/lib/types/elaya-training";

// The ONLY access difference from ad-creatives (['admin','founder']): manager is
// included (managers curate their domain's library — the locked decision). Same triple
// as assertDrillAccess / getCompletedTasksAction.
const TRAINING_ROLES: UserRole[] = ["manager", "admin", "founder"];

const TRAINING_TABLE = "elaya_training_assets";

/** Who may approve an item for the public bot's pack (plan Decide 4: a founder publishes). */
const APPROVER_ROLES: UserRole[] = ["admin", "founder"];

/** News falls out of the pack after this many days unless edited (plan 7e). */
const NEWS_LIFETIME_DAYS = 60;

/** sanitizeText on each line, so a fact, a story or a ready message keeps its line breaks. */
function sanitizeMultiline(text: string): string {
  return text.split(/\r?\n/).map((l) => sanitizeText(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─────────────────────────────────────────────────────────
// upsertTrainingAsset — create (no id) or update (id) a training asset.
// manager/admin/founder. Zod-first (Rule 02), sanitizeText on text fields (Rule 06,
// NEVER on url/storage_path), adminClient write (RLS double-enforces via TRAINING_ROLES),
// revalidate the one consuming route.
//
// Singleton company-facts brief: a kind='fact' is the per-domain company-facts brief.
// On a CREATE of a fact for a domain that already has one, UPDATE the existing row
// instead of inserting a second — so the brief stays exactly one row per domain
// (app-layer enforcement; see docs/modules/customer-welcome-blast.md File 9).
// ─────────────────────────────────────────────────────────
export async function upsertTrainingAsset(
  _prevState: ActionResult<TrainingAssetRow>,
  formData: FormData,
): Promise<ActionResult<TrainingAssetRow>> {
  // 1. Zod-first (Rule 02) — before auth, before any DB work.
  const rawId = formData.get("id");
  const rawTags = formData.get("tags"); // JSON-encoded string[] from the client
  const rawAttachments = formData.get("attachments"); // JSON-encoded uuid[] (ready messages)
  let parsedTags: unknown = [];
  let parsedAttachments: unknown = [];
  try {
    parsedTags = rawTags ? JSON.parse(String(rawTags)) : [];
    parsedAttachments = rawAttachments ? JSON.parse(String(rawAttachments)) : [];
  } catch {
    return { data: null, error: "Those tags couldn't be read. Please re-enter them." };
  }

  const parsed = parseActionInput(upsertTrainingAssetSchema, {
    id:          rawId ? String(rawId) : null,
    kind:        formData.get("kind"),
    title:       formData.get("title"),
    description: formData.get("description") || null,
    url:         formData.get("url") || null,
    storagePath: formData.get("storagePath") || null,
    tags:        parsedTags,
    domain:      formData.get("domain") || null,
    sendOrder:   formData.get("sendOrder") ?? 0,
    active:      formData.get("active") ?? true,
    whenToSend:  formData.get("whenToSend") || null,
    mimeType:    formData.get("mimeType") || null,
    byteSize:    formData.get("byteSize") || null,
    attachments: parsedAttachments,
    approve:     formData.get("approve") ?? false,
  });
  if (!parsed.ok) return { data: null, error: parsed.error };

  // 2. Auth gate (A-18 / Rule 09).
  const auth = await requireProfile(TRAINING_ROLES);
  if (!auth.ok) return auth.result;

  const { id, kind, title, description, url, storagePath, tags, domain, sendOrder, active, whenToSend, mimeType, byteSize, attachments, approve } =
    parsed.data;

  const adminClient = createAdminClient();
  const isApprover = APPROVER_ROLES.includes(auth.profile.role);

  // Draft until a founder approves (0252). A founder's own edit of an approved item keeps it
  // approved; anyone else's edit sends it back to draft, so the pack never carries words no
  // founder has read.
  let wasApproved = false;
  if (id) {
    const { data: existing } = await adminClient.from(TRAINING_TABLE).select("status").eq("id", id).maybeSingle();
    wasApproved = (existing as { status?: string } | null)?.status === "approved";
  }
  const approved = isApprover && (approve || wasApproved);
  const now = new Date().toISOString();

  // 3. sanitizeText on every free-text field (Rule 06); url + storage_path NOT sanitized.
  //    Long text keeps its line breaks (a fact, a story, a ready message).
  const row = {
    kind,
    title:        sanitizeText(title),
    description:  description ? sanitizeMultiline(description) : null,
    url:          url ?? null,
    storage_path: storagePath ?? null,
    tags:         tags.map((t) => sanitizeText(t)),
    domain:       domain ?? null,
    send_order:   sendOrder,
    active,
    when_to_send: whenToSend ? sanitizeText(whenToSend) : null,
    mime_type:    storagePath ? mimeType ?? null : null,
    byte_size:    storagePath ? byteSize ?? null : null,
    attachments:  kind === "ready_message" ? attachments : [],
    status:       approved ? "approved" : "draft",
    approved_by:  approved ? auth.profile.id : null,
    approved_at:  approved ? now : null,
    ...(kind === "news" && !id ? { expires_at: new Date(Date.now() + NEWS_LIFETIME_DAYS * 86_400_000).toISOString() } : {}),
  };

  // The June rule folded every new fact into one row per domain. The pack has many facts
  // (who we are, membership, hours, privacy...), so each fact is its own row now.
  const targetId = id ?? null;

  if (targetId) {
    const { data, error } = await adminClient
      .from(TRAINING_TABLE)
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", targetId)
      .select("*")
      .single();
    if (error || !data) return { data: null, error: formErrors.generic };
    revalidatePath("/admin/elaya-training");
    return { data: data as TrainingAssetRow, error: null };
  }

  const { data, error } = await adminClient
    .from(TRAINING_TABLE)
    .insert(row)
    .select("*")
    .single();
  if (error || !data) return { data: null, error: formErrors.generic };
  revalidatePath("/admin/elaya-training");
  return { data: data as TrainingAssetRow, error: null };
}

// ─────────────────────────────────────────────────────────
// approveTrainingAsset — admin/founder (0252). A draft becomes part of the next published
// pack. Approving never publishes: the bot keeps the live pack until someone presses Publish.
// ─────────────────────────────────────────────────────────
export async function approveTrainingAsset(
  formData: FormData,
): Promise<ActionResult<TrainingAssetRow>> {
  const parsed = parseActionInput(approveTrainingAssetSchema, { id: formData.get("id") });
  if (!parsed.ok) return { data: null, error: parsed.error };

  const auth = await requireProfile(APPROVER_ROLES);
  if (!auth.ok) return auth.result;

  const { data, error } = await createAdminClient()
    .from(TRAINING_TABLE)
    .update({ status: "approved", approved_by: auth.profile.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("*")
    .single();
  if (error || !data) return { data: null, error: formErrors.generic };
  revalidatePath("/admin/elaya-training");
  return { data: data as TrainingAssetRow, error: null };
}

// ─────────────────────────────────────────────────────────
// deleteTrainingAsset — manager/admin/founder. Hard delete (the asset is editable
// config/content, not an append-only log). Idempotent friendly: a missing row → error
// copy, never a throw.
// ─────────────────────────────────────────────────────────
export async function deleteTrainingAsset(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(deleteTrainingAssetSchema, { id: formData.get("id") });
  if (!parsed.ok) return { data: null, error: parsed.error };

  const auth = await requireProfile(TRAINING_ROLES);
  if (!auth.ok) return auth.result;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from(TRAINING_TABLE)
    .delete()
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { data: null, error: formErrors.generic };
  revalidatePath("/admin/elaya-training");
  return { data: { id: data.id as string }, error: null };
}
