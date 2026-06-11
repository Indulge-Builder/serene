"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/actions/_auth";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeCampaignKey } from "@/lib/utils/campaigns";
import { formErrors } from "@/lib/validations/form-errors";
import {
  upsertAdCreativeSchema,
  deleteAdCreativeSchema,
} from "@/lib/validations/ad-creative-schema";
import type { ActionResult, UserRole } from "@/lib/types";
import type { AdCreative } from "@/lib/types/database";

const ADMIN_ROLES: UserRole[] = ["admin", "founder"];

// ─────────────────────────────────────────────────────────
// upsertAdCreative
// Creates a new creative or updates an existing one (by id).
// Admin/founder only. Normalises campaign_key (lowercase + trim).
// ─────────────────────────────────────────────────────────
export async function upsertAdCreative(
  _prevState: ActionResult<AdCreative>,
  formData: FormData,
): Promise<ActionResult<AdCreative>> {
  const rawId = formData.get("id");
  const parsed = upsertAdCreativeSchema.safeParse({
    id:            rawId ? String(rawId) : null,
    campaign_key:  formData.get("campaign_key"),
    video_url:     formData.get("video_url"),
    thumbnail_url: formData.get("thumbnail_url") || null,
    ad_name:       formData.get("ad_name") || null,
    notes:         formData.get("notes") || null,
  });

  if (!parsed.success) {
    return { data: null, error: formErrors.generic };
  }

  const auth = await requireProfile(ADMIN_ROLES);
  if (!auth.ok) return auth.result;

  const { id, campaign_key, video_url, thumbnail_url, ad_name, notes } = parsed.data;

  // Normalisation invariant — must match the DB CHECK constraint and the
  // getAdCreativeForCampaign lookup (lowercase + trim).
  const normalisedKey = normalizeCampaignKey(campaign_key);

  const row = {
    campaign_key:  normalisedKey,
    video_url,
    thumbnail_url: thumbnail_url ?? null,
    ad_name:       ad_name ? sanitizeText(ad_name) : null,
    notes:         notes ? sanitizeText(notes) : null,
  };

  const adminClient = createAdminClient();

  if (id) {
    const { data, error } = await adminClient
      .from("ad_creatives")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) return { data: null, error: formErrors.generic };

    revalidatePath("/admin/ad-creatives");
    revalidatePath("/campaigns");
    return { data: data as AdCreative, error: null };
  }

  const { data, error } = await adminClient
    .from("ad_creatives")
    .insert(row)
    .select("*")
    .single();

  if (error || !data) {
    // Unique violation on campaign_key → friendlier message
    if (error?.code === "23505") {
      return { data: null, error: "A creative already exists for that campaign." };
    }
    return { data: null, error: formErrors.generic };
  }

  revalidatePath("/admin/ad-creatives");
  revalidatePath("/campaigns");
  return { data: data as AdCreative, error: null };
}

// ─────────────────────────────────────────────────────────
// deleteAdCreative
// Removes a creative row. Admin/founder only.
// Note: the underlying Storage object is NOT deleted here — the row is the
// join key the UI reads. Orphaned bucket files are harmless and cheap.
// ─────────────────────────────────────────────────────────
export async function deleteAdCreative(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteAdCreativeSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { data: null, error: formErrors.generic };
  }

  const auth = await requireProfile(ADMIN_ROLES);
  if (!auth.ok) return auth.result;

  const adminClient = createAdminClient();
  const { data: deleted, error } = await adminClient
    .from("ad_creatives")
    .delete()
    .eq("id", parsed.data.id)
    .select("campaign_key")
    .maybeSingle();

  if (error || !deleted) return { data: null, error: formErrors.generic };

  revalidatePath("/admin/ad-creatives");
  revalidatePath("/campaigns");
  return { data: { id: parsed.data.id }, error: null };
}
