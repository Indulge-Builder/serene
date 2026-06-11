/**
 * Converts a raw utm_campaign key (underscore/space-separated) into a
 * display-only title joined with a thin middle dot separator.
 *
 * e.g. "TG_House_Meta Leads" → "TG · House · Meta · Leads"
 *
 * Never pass the output of this function to a DB query or RPC.
 * The DB stores raw keys and the lookup must match exactly.
 */
export function beautifyCampaignTitle(raw: string): string {
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .join(' · ');
}

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
