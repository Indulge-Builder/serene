import type { AppDomain } from '@/lib/types/database';
import { GIA_DOMAINS } from '@/lib/constants/domains';

/** Routes all authenticated users can always reach, regardless of domain. */
// /helpdesk is the Call Intelligence library — visible to all roles/domains
// by spec (docs/modules/call-intelligence.md §9); read-only, RLS-gated writes.
// /elaya is Elaya's chat surface — all roles by spec (docs/modules/elaya.md);
// what Elaya can ACCESS is enforced per-principal in the tool layer, not here.
export const ALWAYS_ALLOWED_PREFIXES: string[] = ['/dashboard', '/profile', '/helpdesk', '/elaya'];

/**
 * Domain → permitted route prefixes.
 *
 * GIA domains (onboarding, house, shop, legacy) share the Gia feature set.
 * Non-Gia domains (concierge, finance, marketing, tech, b2b) get a narrower slice.
 */
export const DOMAIN_ROUTE_MAP: Record<AppDomain, string[]> = {
  // ── Gia sales domains (all four share the same feature set) ──────────────
  ...GIA_DOMAINS.reduce(
    (acc, domain) => ({
      ...acc,
      // /oversight is manager-read in practice — the page redirects agents/guests
      // (role gate), like /campaigns. /escalations is all-roles: agents get a
      // self-scoped view (own slipped leads/tasks), manager+ see the domain/org.
      // /budget is admin/founder ONLY (they bypass this map in canAccessRoute);
      // it is deliberately absent so a domain manager can't reach it by URL.
      [domain]: ['/leads', '/deals', '/tasks', '/performance', '/oversight', '/campaigns', '/escalations', '/whatsapp', '/settings'],
    }),
    {} as Partial<Record<AppDomain, string[]>>,
  ),

  // ── Non-Gia domains ───────────────────────────────────────────────────────
  concierge: ['/tasks', '/whatsapp', '/settings'],
  finance:   ['/tasks', '/settings'],
  marketing: ['/tasks', '/campaigns', '/settings'],
  tech:      ['/tasks', '/settings'],
  b2b:       ['/tasks', '/leads', '/deals', '/campaigns', '/settings'],
} as Record<AppDomain, string[]>;
