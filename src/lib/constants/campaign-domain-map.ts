// Maps campaign name prefixes to lead domains.
// Leads arrive from Pabbly (Meta/Google/website forms) with a utm_campaign value.
// The prefix of that value determines which domain the lead belongs to.

import type { AppDomain } from '@/lib/types/database';

export const CAMPAIGN_DOMAIN_MAP: Record<string, AppDomain> = {
  TG_Global: 'onboarding',
  TG_Shop:   'shop',
  TG_Legacy: 'legacy',
  TG_House:  'house',
  // TG_B2B → 'b2b': 'b2b' is a valid app_domain (user mgmt) but is NOT yet a Gia
  // sales domain (not in GIA_DOMAINS / DOMAIN_DEAL_CONFIG / DOMAIN_INTERESTS) —
  // we don't run B2B lead campaigns today. The ingestion pipeline coerces any
  // non-Gia resolved domain to DEFAULT_GIA_DOMAIN (lead-ingestion.ts, audit
  // #3/#12), so a stray TG_B2B lead lands in 'onboarding' rather than an
  // unhandled domain. When B2B leads start flowing, promote 'b2b' to a real Gia
  // domain (add to GIA_DOMAINS + DOMAIN_DEAL_CONFIG + DOMAIN_INTERESTS + a CHECK
  // migration, together) and this mapping starts taking effect.
  TG_B2B:    'b2b',
};

// Safe default when no prefix matches — logged to Sentry as a warning
export const DEFAULT_LEAD_DOMAIN: AppDomain = 'onboarding';

export function resolveDomainFromCampaign(campaignName: string | null): AppDomain {
  if (!campaignName) return DEFAULT_LEAD_DOMAIN;
  const entry = Object.entries(CAMPAIGN_DOMAIN_MAP).find(([prefix]) =>
    campaignName.startsWith(prefix),
  );
  return entry ? entry[1] : DEFAULT_LEAD_DOMAIN;
}
