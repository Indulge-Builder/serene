import { createClient } from '@/lib/supabase/server';
import type { AdCreative } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Query: resolve ad creative by campaign name
// ─────────────────────────────────────────────
// Normalises the input (toLowerCase + trim) before querying — the campaign_key
// column has a DB CHECK constraint enforcing the same normalisation on write,
// so the join will always be consistent.
// Returns null on no match or any DB error — never throws.
export async function getAdCreativeForCampaign(
  campaignName: string
): Promise<AdCreative | null> {
  const normalised = campaignName.toLowerCase().trim();
  if (!normalised) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('ad_creatives')
      .select('*')
      .eq('campaign_key', normalised)
      .single();

    if (error || !data) return null;
    return data as AdCreative;
  } catch (err) {
    console.error('[ad-creatives-service] getAdCreativeForCampaign error:', err);
    return null;
  }
}
