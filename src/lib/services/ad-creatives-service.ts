import { createClient } from '@/lib/supabase/server';
import { redis } from '@/lib/redis';
import {
  REDIS_KEYS,
  CAMPAIGN_AD_CREATIVE_TTL,
} from '@/lib/constants/redis-keys';
import type { AdCreative } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Query: resolve ad creatives for one campaign
// ─────────────────────────────────────────────
// A campaign may have MULTIPLE videos (migration 0058 dropped the UNIQUE on
// campaign_key). Returns all rows for the campaign, newest first.
// Normalises the input (toLowerCase + trim) — the campaign_key column has a DB
// CHECK enforcing the same normalisation on write, so the join is consistent.
// Returns [] on no match or any DB error — never throws.
export async function getAdCreativesForCampaign(
  campaignName: string
): Promise<AdCreative[]> {
  const normalised = campaignName.toLowerCase().trim();
  if (!normalised) return [];

  const cacheKey = REDIS_KEYS.campaign.campaignAdCreative(normalised);

  try {
    const cached = await redis.get<AdCreative[]>(cacheKey);
    if (cached) return cached;
  } catch { /* fall through to DB */ }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('ad_creatives')
      .select('*')
      .eq('campaign_key', normalised)
      .order('created_at', { ascending: false });

    const result: AdCreative[] =
      error || !data ? [] : (data as AdCreative[]);

    void redis.setex(cacheKey, CAMPAIGN_AD_CREATIVE_TTL, result).catch(() => {});

    return result;
  } catch (err) {
    console.error('[ad-creatives-service] getAdCreativesForCampaign error:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
// Query: list all ad creatives (admin management view)
// ─────────────────────────────────────────────
// Newest first. RLS already restricts SELECT to authenticated; the admin page
// gates by role before rendering. Returns [] on error — never throws.
export async function getAllAdCreatives(): Promise<AdCreative[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('ad_creatives')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data as AdCreative[];
  } catch (err) {
    console.error('[ad-creatives-service] getAllAdCreatives error:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
// Query: batch-resolve ad creatives for a list of campaign names
// ─────────────────────────────────────────────
// Per-key Redis cache-aside; one batched DB query for all misses.
// Returns Map<campaignKey, AdCreative[]> — each campaign may have multiple videos
// (migration 0058). Each array is newest-first.
// Call once per page render — never inside a loop or per-card useEffect.
// Returns an empty Map (never null/throws) on error.
export async function getAdCreativesForCampaigns(
  campaignNames: string[]
): Promise<Map<string, AdCreative[]>> {
  const normalizedKeys = campaignNames
    .map((n) => n.toLowerCase().trim())
    .filter(Boolean);

  if (normalizedKeys.length === 0) return new Map();

  const result = new Map<string, AdCreative[]>();

  const cached = await Promise.all(
    normalizedKeys.map((k) =>
      redis
        .get<AdCreative[]>(REDIS_KEYS.campaign.campaignAdCreative(k))
        .catch(() => null),
    ),
  );

  const missKeys: string[] = [];
  for (let i = 0; i < normalizedKeys.length; i++) {
    const key = normalizedKeys[i];
    const hit = cached[i];
    if (hit !== null && hit !== undefined) {
      result.set(key, hit);
    } else {
      missKeys.push(key);
    }
  }

  if (missKeys.length === 0) return result;

  const uniqueMissKeys = [...new Set(missKeys)];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('ad_creatives')
      .select('*')
      .in('campaign_key', uniqueMissKeys)
      .order('created_at', { ascending: false });

    const grouped = new Map<string, AdCreative[]>();
    if (!error && data) {
      for (const row of data) {
        const list = grouped.get(row.campaign_key);
        if (list) list.push(row as AdCreative);
        else grouped.set(row.campaign_key, [row as AdCreative]);
      }
    }

    for (const k of uniqueMissKeys) {
      const creatives = grouped.get(k) ?? [];
      result.set(k, creatives);
      void redis
        .setex(
          REDIS_KEYS.campaign.campaignAdCreative(k),
          CAMPAIGN_AD_CREATIVE_TTL,
          creatives,
        )
        .catch(() => {});
    }

    return result;
  } catch (err) {
    console.error('[ad-creatives-service] getAdCreativesForCampaigns error:', err);
    return result;
  }
}
