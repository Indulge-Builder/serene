import type { UserRole, AppDomain } from '@/lib/types/database';
import {
  ALWAYS_ALLOWED_PREFIXES,
  DOMAIN_ROUTE_MAP,
} from '@/lib/constants/route-permissions';

type RouteProfile = { role: UserRole; domain: AppDomain };

/**
 * Returns true when the given profile may visit the given pathname.
 *
 * Check order:
 * 1. admin / founder → always true (full cross-domain access).
 * 2. ALWAYS_ALLOWED_PREFIXES (/dashboard, /profile) → true for everyone.
 * 3. Domain route map → prefix match on the allowed list for the caller's domain.
 * 4. Fallback → false.
 *
 * Pure function. Zero side effects. Safe in 'use client' components.
 */
export function canAccessRoute(profile: RouteProfile, pathname: string): boolean {
  if (profile.role === 'admin' || profile.role === 'founder') return true;

  if (ALWAYS_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;

  const allowed = DOMAIN_ROUTE_MAP[profile.domain] ?? [];
  return allowed.some((prefix) => pathname.startsWith(prefix));
}
