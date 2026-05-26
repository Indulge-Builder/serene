import type { AppDomain } from "@/lib/types/database";

export const APP_DOMAINS: AppDomain[] = [
  'concierge',
  'onboarding',
  'finance',
  'marketing',
  'tech',
  'shop',
  'b2b',
  'house',
  'legacy',
];

export const DOMAIN_LABELS: Record<AppDomain, string> = {
  concierge:  'Indulge Concierge',
  onboarding: 'Onboarding',
  finance:    'Finance',
  marketing:  'Marketing',
  tech:       'Technology',
  shop:       'Indulge Shop',
  b2b:        'B2B',
  house:      'Indulge House',
  legacy:     'Legacy',
};
