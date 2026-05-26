// Maps campaign name prefixes to lead domains.
// Leads arrive from Pabbly (Meta/Google/website forms) with a utm_campaign value.
// The prefix of that value determines which domain the lead belongs to.

export const CAMPAIGN_DOMAIN_MAP: Record<string, string> = {
  TG_Global: 'indulge_concierge',
  TG_Shop:   'indulge_shop',
  TG_Legacy: 'indulge_legacy',
  TG_House:  'indulge_house',
  TG_B2B:    'indulge_b2b',
};

// Safe default when no prefix matches — logged to Sentry as a warning
export const DEFAULT_LEAD_DOMAIN = 'indulge_concierge';

export function resolveDomainFromCampaign(campaignName: string | null): string {
  if (!campaignName) return DEFAULT_LEAD_DOMAIN;
  const entry = Object.entries(CAMPAIGN_DOMAIN_MAP).find(([prefix]) =>
    campaignName.startsWith(prefix),
  );
  return entry ? entry[1] : DEFAULT_LEAD_DOMAIN;
}
