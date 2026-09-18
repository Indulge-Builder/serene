import type { UserRole, AppDomain } from '@/lib/types/database';
import {
  ALWAYS_ALLOWED_PREFIXES,
  DOMAIN_NAV_HIDDEN,
  DOMAIN_ROUTE_MAP,
  FOUNDER_NAV_PREFIXES,
  WORKBENCH_BLOCKED_PREFIXES,
  WORKBENCH_DOMAINS,
} from '@/lib/constants/route-permissions';

type RouteProfile = { role: UserRole; domain: AppDomain };

const startsWithAny = (pathname: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => pathname.startsWith(prefix));

/** True for a member of a workbench domain (WORKBENCH_DOMAINS — tech, for now). */
export function isWorkbenchProfile(profile: RouteProfile): boolean {
  return WORKBENCH_DOMAINS.includes(profile.domain);
}

/**
 * Returns true when the given profile may visit the given pathname.
 *
 * Check order:
 * 1. admin / founder → always true (full cross-domain access).
 * 2. Workbench-domain member → true unless the path is in WORKBENCH_BLOCKED_PREFIXES.
 * 3. ALWAYS_ALLOWED_PREFIXES (/dashboard, /profile, …) → true for everyone.
 * 4. Domain route map → prefix match on the allowed list for the caller's domain.
 * 5. Fallback → false.
 *
 * Pure function. Zero side effects. Safe in 'use client' components.
 */
export function canAccessRoute(profile: RouteProfile, pathname: string): boolean {
  if (profile.role === 'admin' || profile.role === 'founder') return true;

  if (isWorkbenchProfile(profile)) return !startsWithAny(pathname, WORKBENCH_BLOCKED_PREFIXES);

  if (startsWithAny(pathname, ALWAYS_ALLOWED_PREFIXES)) return true;

  const allowed = DOMAIN_ROUTE_MAP[profile.domain] ?? [];
  return startsWithAny(pathname, allowed);
}

/**
 * THE page-level "admin/founder only" gate. Admin and founder pass; so does a
 * workbench-domain member of any role (the temporary tech arrangement). Pages that
 * must stay admin/founder even for the workbench (/books) keep a literal role check
 * instead of calling this. Server actions do NOT use this — they keep requireProfile.
 */
export function hasElevatedPageAccess(profile: RouteProfile): boolean {
  return profile.role === 'admin' || profile.role === 'founder' || isWorkbenchProfile(profile);
}

/** THE page-level "manager and above" gate: manager, or anyone hasElevatedPageAccess admits. */
export function hasManagerPageAccess(profile: RouteProfile): boolean {
  return profile.role === 'manager' || hasElevatedPageAccess(profile);
}

/**
 * Whether a nav entry (Sidebar, command palette) is LISTED for this profile.
 * canAccessRoute decides reachability; on top of it the founder sees only the
 * curated FOUNDER_NAV_PREFIXES. Never use this as an authorization check.
 */
export function isNavVisible(profile: RouteProfile, href: string): boolean {
  if (!canAccessRoute(profile, href)) return false;
  if (profile.role === 'founder') return startsWithAny(href, FOUNDER_NAV_PREFIXES);
  if (profile.role !== 'admin' && startsWithAny(href, DOMAIN_NAV_HIDDEN[profile.domain] ?? [])) return false;
  return true;
}
