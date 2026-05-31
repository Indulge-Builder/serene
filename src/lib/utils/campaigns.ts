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
