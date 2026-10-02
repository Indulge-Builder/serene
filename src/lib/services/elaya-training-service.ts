import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TrainingAssetRow } from "@/lib/types/elaya-training";

// ─────────────────────────────────────────────────────────────────────────
// The library page read (migration 0150; the public bot, 0252).
//
// Two readers, ONE table. PARITY: they must agree on what "an asset" is — they
// differ ONLY in client, filters, and ordering, each documented inline. Do NOT
// "fix" one to match the other.
//   • getAllTrainingAssets   — the ADMIN page list. Session client (RLS net), the
//                              page role-gates before render; newest-first.
//   • The public bot's reads (0252) live in bot-knowledge-service.ts (the published pack)
//     and bot-library-service.ts (the library send); the June send-path read is gone.
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
