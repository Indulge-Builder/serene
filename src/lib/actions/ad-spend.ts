"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/actions/_auth";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeCampaignKey } from "@/lib/utils/campaigns";
import { getExistingSpendKeys } from "@/lib/services/ad-spend-service";
import { uploadAdSpendSchema } from "@/lib/validations/ad-spend-schema";
import type { ActionResult, UserRole } from "@/lib/types";

const ADMIN_ROLES: UserRole[] = ["admin", "founder"];

export type UploadAdSpendSummary = {
  inserted: number;
  updated:  number;
  skipped:  number;
};

// ─────────────────────────────────────────────────────────
// uploadAdSpendAction
// Upserts client-parsed Meta daily-breakdown rows on the
// (campaign_key, spend_date, source) unique key — re-uploading the same
// file changes zero values. Admin/founder only.
// ─────────────────────────────────────────────────────────
export async function uploadAdSpendAction(
  input: unknown,
): Promise<ActionResult<UploadAdSpendSummary>> {
  const parsed = uploadAdSpendSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: "That upload couldn't be read. Re-export the daily breakdown from Meta and try again." };
  }

  const auth = await requireProfile(ADMIN_ROLES);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  // Server-side re-normalisation — never trust the client to have applied the
  // campaign-key invariant (S-04 whitelist + S-02 sanitize).
  const rows = parsed.data.rows.map((r) => ({
    campaign_key: normalizeCampaignKey(sanitizeText(r.campaign_key)),
    spend_date:   r.spend_date,
    spend:        r.spend,
    results:      r.results,
    impressions:  r.impressions,
    reach:        r.reach,
    link_clicks:  r.link_clicks,
    currency:     "INR",
    source:       "meta_csv",
    uploaded_by:  caller.id,
  }));

  const uniqueKeys = [...new Set(rows.map((r) => r.campaign_key))];
  const dates      = rows.map((r) => r.spend_date).sort();

  const existing = await getExistingSpendKeys(
    uniqueKeys,
    dates[0],
    dates[dates.length - 1],
  );

  const adminClient = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient as any)
    .from("ad_spend_daily")
    .upsert(rows, { onConflict: "campaign_key,spend_date,source" });

  if (error) {
    console.error("[ad-spend-action] upsert failed:", error);
    return { data: null, error: "The upload failed to save. Please try again." };
  }

  let updated = 0;
  for (const r of rows) {
    if (existing.has(`${r.campaign_key}::${r.spend_date}`)) updated += 1;
  }

  revalidatePath("/budget");

  return {
    data: {
      inserted: rows.length - updated,
      updated,
      skipped: parsed.data.skipped,
    },
    error: null,
  };
}
