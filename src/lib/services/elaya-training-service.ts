import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TrainingAssetRow } from "@/lib/types/elaya-training";
import type { GiaDomain } from "@/lib/constants/domains";

// ─────────────────────────────────────────────────────────────────────────
// Elaya customer-training reads (migration 0150). Block 2 of the welcome-blast.
//
// Two readers, ONE table. PARITY: they must agree on what "an asset" is — they
// differ ONLY in client, filters, and ordering, each documented inline. Do NOT
// "fix" one to match the other.
//   • getAllTrainingAssets   — the ADMIN page list. Session client (RLS net), the
//                              page role-gates before render; newest-first.
//   • getTrainingAssetsForBlast — the SEND path. ADMIN client + explicit domain
//                              scope (the parity rule, src/lib/elaya/CLAUDE.md):
//                              the customer send runs SESSIONLESS (WhatsApp webhook /
//                              Trigger.dev), where a session client returns [] —
//                              the H1 silent-blank bug. active + domain/global,
//                              send_order ASC (the curated blast sequence).
// No Redis (the ad_creatives posture). No campaign_key normalization (domain is an enum).
// ─────────────────────────────────────────────────────────────────────────

export async function getAllTrainingAssets(): Promise<TrainingAssetRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("elaya_training_assets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as unknown as TrainingAssetRow[];
  } catch (err) {
    console.error("[elaya-training-service] getAllTrainingAssets error:", err);
    return [];
  }
}

export async function getTrainingAssetsForBlast(
  domain: GiaDomain,
  interests?: string[],
): Promise<TrainingAssetRow[]> {
  try {
    if (!domain) return [];
    // Admin client — the send path is sessionless; identity here is the domain
    // (principal-derived by the caller), enforced in this query, never auth.uid().
    const supabase = createAdminClient();

    let query = supabase
      .from("elaya_training_assets")
      .select("*")
      .eq("active", true)
      // Domain-scoped OR global (a NULL-domain asset applies everywhere). Elaya never
      // silently crosses domain boundaries — a domain-scoped asset stores its domain
      // explicitly. domain is the app_domain enum, so the interpolation is constrained
      // to a known enum value (no free-text injection surface).
      .or(`domain.eq.${domain},domain.is.null`);

    // tags overlap on the text[] column — applied only when interests are provided.
    if (interests && interests.length > 0) {
      query = query.overlaps("tags", interests);
    }

    const { data, error } = await query.order("send_order", { ascending: true });

    if (error || !data) return [];
    return data as unknown as TrainingAssetRow[];
  } catch (err) {
    console.error("[elaya-training-service] getTrainingAssetsForBlast error:", err);
    return [];
  }
}
