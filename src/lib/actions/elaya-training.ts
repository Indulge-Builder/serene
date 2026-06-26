"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/actions/_auth";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formErrors } from "@/lib/validations/form-errors";
import {
  upsertTrainingAssetSchema,
  deleteTrainingAssetSchema,
} from "@/lib/validations/elaya-training-schema";
import type { ActionResult, UserRole } from "@/lib/types";
import type { TrainingAssetRow } from "@/lib/types/elaya-training";

// The ONLY access difference from ad-creatives (['admin','founder']): manager is
// included (managers curate their domain's library — the locked decision). Same triple
// as assertDrillAccess / getCompletedTasksAction.
const TRAINING_ROLES: UserRole[] = ["manager", "admin", "founder"];

const TRAINING_TABLE = "elaya_training_assets";

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
  let parsedTags: unknown = [];
  try {
    parsedTags = rawTags ? JSON.parse(String(rawTags)) : [];
  } catch {
    return { data: null, error: "Those tags couldn't be read. Please re-enter them." };
  }

  const parsed = upsertTrainingAssetSchema.safeParse({
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
  });
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? formErrors.generic };
  }

  // 2. Auth gate (A-18 / Rule 09).
  const auth = await requireProfile(TRAINING_ROLES);
  if (!auth.ok) return auth.result;

  const { id, kind, title, description, url, storagePath, tags, domain, sendOrder, active } =
    parsed.data;

  // 3. sanitizeText on every free-text field (Rule 06); url + storage_path NOT sanitized.
  const row = {
    kind,
    title:        sanitizeText(title),
    description:  description ? sanitizeText(description) : null,
    url:          url ?? null,
    storage_path: storagePath ?? null,
    tags:         tags.map((t) => sanitizeText(t)),
    domain:       domain ?? null,
    send_order:   sendOrder,
    active,
  };

  // The table is not yet in the generated Database type (interim — regen drops this).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = createAdminClient() as any;

  // Resolve create-vs-update, with the singleton-fact fold: a fresh fact for a domain
  // that already has one updates the existing row rather than inserting a duplicate.
  let targetId = id ?? null;
  if (!targetId && kind === "fact") {
    const existingFactQuery = adminClient
      .from(TRAINING_TABLE)
      .select("id")
      .eq("kind", "fact");
    const { data: existingFact } = await (domain
      ? existingFactQuery.eq("domain", domain)
      : existingFactQuery.is("domain", null)
    ).maybeSingle();
    if (existingFact?.id) targetId = existingFact.id as string;
  }

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
// deleteTrainingAsset — manager/admin/founder. Hard delete (the asset is editable
// config/content, not an append-only log). Idempotent friendly: a missing row → error
// copy, never a throw.
// ─────────────────────────────────────────────────────────
export async function deleteTrainingAsset(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteTrainingAssetSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? formErrors.generic };
  }

  const auth = await requireProfile(TRAINING_ROLES);
  if (!auth.ok) return auth.result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = createAdminClient() as any;
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
