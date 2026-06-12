// Call Intelligence — service taxonomy + per-domain interest vocabulary.
// Spec: docs/modules/call-intelligence.md §3.
//
// SERVICE_CATEGORY_* derive from one defineEnum() source (L-7) — the 6
// concierge categories that drive the helpdesk pills, the dossier card, and
// conversation_hooks/service_cases.category values for concierge-style
// domains.
//
// DOMAIN_INTERESTS owns the valid leads.service_interests values per domain.
// leads.service_interests is text[] — NOT an enum — because Shop/House/Legacy
// carry different vocabularies. Unknown values are dropped at ingestion,
// never rejected (a garbage interest string must never block a lead INSERT).

import { defineEnum } from '@/lib/constants/define-enum';

const SERVICE_CATEGORY_DEF = defineEnum([
  { id: 'travel',  label: 'Travel' },
  { id: 'dining',  label: 'Dining' },
  { id: 'gifts',   label: 'Gifts' },
  { id: 'events',  label: 'Events' },
  { id: 'retail',  label: 'Retail' },
  { id: 'special', label: 'Special Requests' },
]);

export const SERVICE_CATEGORIES       = SERVICE_CATEGORY_DEF.values;
export const SERVICE_CATEGORY_LABELS  = SERVICE_CATEGORY_DEF.labels;
export const SERVICE_CATEGORY_OPTIONS = SERVICE_CATEGORY_DEF.options;
export const SERVICE_CATEGORY_ENUM    = SERVICE_CATEGORY_DEF.zodEnum;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/**
 * Display label for any interest/category slug. Known concierge categories
 * use their canonical labels; other domain vocabularies (e.g. 'smart_home',
 * 'perfumes') title-case the slug — ONE label resolver for every surface.
 */
export function getServiceCategoryLabel(category: string): string {
  return (
    SERVICE_CATEGORY_LABELS[category as ServiceCategory] ??
    category
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}

/**
 * Valid leads.service_interests values per lead domain.
 * Domains not listed here (finance, marketing, tech, b2b, concierge-adjacent
 * future domains) fall back to the concierge vocabulary at the call site.
 */
export const DOMAIN_INTERESTS = {
  concierge:  ['travel', 'dining', 'gifts', 'events', 'retail', 'special'],
  shop:       ['watches', 'perfumes', 'jewellery', 'fashion', 'accessories', 'art'],
  house:      ['interior', 'renovation', 'staff', 'security', 'smart_home', 'garden'],
  legacy:     ['estate', 'investments', 'art', 'philanthropy', 'succession', 'legal'],
  onboarding: ['travel', 'dining', 'gifts', 'events', 'retail', 'special'],
} as const satisfies Record<string, readonly string[]>;

export type ServiceInterest =
  (typeof DOMAIN_INTERESTS)[keyof typeof DOMAIN_INTERESTS][number];

/** Vocabulary for a lead domain — concierge list for unlisted domains. */
export function getDomainInterests(domain: string): readonly string[] {
  return DOMAIN_INTERESTS[domain as keyof typeof DOMAIN_INTERESTS] ?? DOMAIN_INTERESTS.concierge;
}
