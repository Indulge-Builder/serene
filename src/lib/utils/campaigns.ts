/**
 * THE campaign-key normalisation (lowercase + trim) — the invariant enforced
 * by the ad_creatives (0012) and ad_spend_daily (0104) CHECK constraints and
 * used by every leads join (`lower(trim(utm_campaign))`). One implementation:
 * `upsertAdCreative`, the ad-spend parser/upload, and any future campaign-key
 * write must call this — never re-inline `.toLowerCase().trim()`.
 */
export function normalizeCampaignKey(raw: string): string {
  return raw.toLowerCase().trim();
}
