import type { AppDomain } from '@/lib/types/database';

/**
 * Full platform domain enum — user management, profiles, authorization only.
 * Gia (leads, campaigns, dashboard widgets, performance) uses GIA_DOMAINS.
 */
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

export type GiaDomain = Extract<
  AppDomain,
  'onboarding' | 'house' | 'shop' | 'legacy'
>;

/** Gia module — the four active sales domains. Add new Gia domains here only. */
export const GIA_DOMAINS = [
  'onboarding',
  'house',
  'shop',
  'legacy',
] as const satisfies readonly GiaDomain[];

export const DEFAULT_GIA_DOMAIN: GiaDomain = 'onboarding';

/** Zod tuple for Gia domain fields */
export const GIA_DOMAIN_ENUM = [...GIA_DOMAINS] as [GiaDomain, ...GiaDomain[]];

/** Zod tuple for full app_domain fields (profiles, admin) */
export const APP_DOMAIN_ENUM = APP_DOMAINS as [AppDomain, ...AppDomain[]];

/** Canonical display labels for every app_domain value */
export const DOMAIN_LABELS: Record<AppDomain, string> = {
  concierge:  'Indulge Concierge',
  onboarding: 'Onboarding',
  finance:    'Finance',
  marketing:  'Marketing',
  tech:       'Technology',
  shop:       'Indulge Shop',
  b2b:        'B2B',
  house:      'Indulge House',
  legacy:     'Indulge Legacy',
};

export function isGiaDomain(domain: string): domain is GiaDomain {
  return (GIA_DOMAINS as readonly string[]).includes(domain);
}

/** FilterDropdown / select items — single source for Gia domain pickers */
export const GIA_DOMAIN_FILTER_ITEMS = GIA_DOMAINS.map((d) => ({
  id:    d,
  label: DOMAIN_LABELS[d],
}));

/** Parse a URL search param into a Gia domain, or null if missing/invalid */
export function parseGiaDomainParam(raw: string | null | undefined): GiaDomain | null {
  if (!raw || !isGiaDomain(raw)) return null;
  return raw;
}

export function getDomainLabel(domain: AppDomain | string): string {
  return DOMAIN_LABELS[domain as AppDomain] ?? domain;
}

/** Gia domains from `domains` in canonical GIA_DOMAINS order */
export function giaDomainsInOrder(domains: readonly AppDomain[]): GiaDomain[] {
  return GIA_DOMAINS.filter((d) => domains.includes(d));
}

/** Sort key for mixed lists — Gia domains first (canonical order), then others */
export function compareDomainDisplayOrder(a: AppDomain, b: AppDomain): number {
  const ai = GIA_DOMAINS.indexOf(a as GiaDomain);
  const bi = GIA_DOMAINS.indexOf(b as GiaDomain);
  const aGia = ai !== -1;
  const bGia = bi !== -1;
  if (aGia && bGia) return ai - bi;
  if (aGia) return -1;
  if (bGia) return 1;
  return APP_DOMAINS.indexOf(a) - APP_DOMAINS.indexOf(b);
}
