import type { AppDomain } from '@/lib/types/database';
import { GIA_DOMAINS } from '@/lib/constants/domains';

/** Routes all authenticated users can always reach, regardless of domain. */
export const ALWAYS_ALLOWED_PREFIXES: string[] = ['/dashboard', '/profile'];

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
      [domain]: ['/leads', '/deals', '/tasks', '/performance', '/campaigns', '/whatsapp', '/settings'],
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
