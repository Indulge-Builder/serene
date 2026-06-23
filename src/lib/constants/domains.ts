import type { LucideIcon } from 'lucide-react';
import { Globe, UserRound, Home, ShoppingBag, Trees } from 'lucide-react';
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

/**
 * Gia module — the four active sales domains. Add new Gia domains here only.
 *
 * NOTE: 'b2b' is a valid app_domain (user mgmt / profiles) but is deliberately
 * NOT a Gia domain yet — we don't run B2B lead campaigns today, so the leads
 * pipeline (deals via DOMAIN_DEAL_CONFIG, interests via DOMAIN_INTERESTS, Gia
 * domain filters) does not handle it. The campaign map's TG_B2B → 'b2b' entry is
 * neutralised at ingestion (non-Gia → DEFAULT_GIA_DOMAIN). When B2B leads start
 * flowing, add 'b2b' to GIA_DOMAINS + DOMAIN_DEAL_CONFIG + DOMAIN_INTERESTS +
 * a CHECK migration together (audit #3).
 */
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

/**
 * Per-Gia-domain glyph — the visual shorthand for each domain (the icon-only
 * mobile domain selector renders the active domain's icon; the full menu shows
 * it beside the label). Onboarding = a client (person), House = a house, Shop =
 * a shopping bag, Legacy = a heritage/family tree (generations). The "All
 * domains" scope falls back to ALL_DOMAINS_ICON (Globe). Only the four Gia
 * domains carry an icon — the user-mgmt-only app_domains never appear here.
 */
export const DOMAIN_ICONS: Record<GiaDomain, LucideIcon> = {
  onboarding: UserRound,
  house:      Home,
  shop:       ShoppingBag,
  legacy:     Trees,
};

/** Fallback glyph for the unscoped "All domains" selection. */
export const ALL_DOMAINS_ICON: LucideIcon = Globe;

export function isGiaDomain(domain: string): domain is GiaDomain {
  return (GIA_DOMAINS as readonly string[]).includes(domain);
}

/** Validate an unknown string against the full platform domain enum. */
export function isAppDomain(domain: string): domain is AppDomain {
  return (APP_DOMAINS as readonly string[]).includes(domain);
}

/** FilterDropdown / select items — single source for Gia domain pickers */
export const GIA_DOMAIN_FILTER_ITEMS = GIA_DOMAINS.map((d) => ({
  id:    d,
  label: DOMAIN_LABELS[d],
  icon:  DOMAIN_ICONS[d],
}));

/** Parse a URL search param into a Gia domain, or null if missing/invalid */
export function parseGiaDomainParam(raw: string | null | undefined): GiaDomain | null {
  if (!raw || !isGiaDomain(raw)) return null;
  return raw;
}

// ─── serene-domain cookie — cross-page memory for the TopBar domain selector ──
//
// Mirrors the serene-theme cookie pattern. The TopBar domain selector writes
// this alongside the ?domain= URL param so an admin/founder's chosen scope
// survives navigation to a page reached without the param. Domain-aware pages
// (leads/deals/campaigns) resolve `domain = param ?? cookie ?? null` for
// admin/founder ONLY — manager/agent never read it (their domain is forced
// server-side, same as today). NOT a security boundary: pages still ignore
// both param and cookie for non-admin/founder. Empty value = the "All" scope.

export const DOMAIN_COOKIE = "serene-domain";

const DOMAIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Client-only (document.cookie) — persist the selector's choice for the next
 * navigation. Pass `null` for the "All" scope (writes an empty value, which
 * `parseGiaDomainParam` reads back as null).
 */
export function persistDomainCookie(domain: GiaDomain | null) {
  document.cookie = `${DOMAIN_COOKIE}=${domain ?? ""}; path=/; max-age=${DOMAIN_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Client-only (document.cookie) — read the saved scope. Returns null when
 * missing/empty/invalid ("All"). The selector reads `param ?? cookie` so its
 * displayed value matches what the page renders even on a URL with no ?domain=
 * (the page does the same param-first, cookie-fallback resolution server-side).
 * Returns null during SSR (no document) — the param is the SSR truth anyway.
 */
export function readDomainCookie(): GiaDomain | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${DOMAIN_COOKIE}=`));
  return parseGiaDomainParam(match?.slice(DOMAIN_COOKIE.length + 1));
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
