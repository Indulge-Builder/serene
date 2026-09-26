import type { AppDomain } from '@/lib/types/database';
import { GIA_DOMAINS } from '@/lib/constants/domains';

/** Routes all authenticated users can always reach, regardless of domain. */
// /helpdesk is the Call Intelligence library — visible to all roles/domains
// by spec (docs/modules/call-intelligence.md §9); read-only, RLS-gated writes.
// /elaya left this list 2026-09-26: Elaya is for the teams whose data she holds (ELAYA_DOMAINS
// below); canAccessRoute asks hasElayaAccess for it. What Elaya can ACCESS once inside is still
// enforced per-principal in the tool layer, never here.
// /notes is the per-user Notes section (all roles by spec, docs/modules/elaya.md —
// Feature 3): a personal surface scoped to the owner by RLS, like /profile. Notes are
// CONTEXT Elaya reads, never permission — so being able to reach the page grants nothing.
export const ALWAYS_ALLOWED_PREFIXES: string[] = ['/dashboard', '/profile', '/helpdesk', '/notes'];

/**
 * ELAYA_DOMAINS — the teams Elaya is switched on for (the founder's call, 2026-09-26): the Gia sales
 * domains (leads, deals, campaigns, escalations) and the concierge floor (members, groups, Freshdesk,
 * Sia tickets, vendors). Finance, marketing and business wait until they have their own
 * tools and clean data: with only tasks and notes in reach, the model drifted toward promising things it
 * could not do (the 2026-09-26 audit). Admin and founder always pass; so does the tech workbench.
 * ONE list, read by every door: the /elaya page and nav (canAccessRoute), the floating button and the
 * dashboard widget, the chat route, the WhatsApp staff gate, the MCP connector, and BOTH brains'
 * principal resolvers (backend/app/brain/principal.py mirrors it). Opening a domain = one entry here
 * + the Python mirror.
 */
export const ELAYA_DOMAINS: readonly AppDomain[] = ['concierge', ...GIA_DOMAINS];
export const ELAYA_ROUTE_PREFIX = '/elaya';

/**
 * The founder's sidebar (2026-09-16). VISIBILITY ONLY — the founder still bypasses
 * every route check (canAccessRoute → true), so a deep link from a lead to its deal,
 * or to /whatsapp, keeps working; the nav and the command palette simply do not list
 * those pages. Admins see everything. Edit this list to change what the founder sees.
 */
export const FOUNDER_NAV_PREFIXES: string[] = [
  '/dashboard',
  '/elaya',
  '/members',
  '/leads',
  '/tasks',
  '/vendors',
  '/subscriptions',
  '/notes',
  '/performance',
  '/oversight',
  '/sia',
  '/freshdesk',
  '/books',
  '/admin/suggestions',
];

/**
 * Workbench domains (2026-09-16, TEMPORARY while the tech team builds the platform):
 * every member of these domains — whatever their role — reaches and sees every page
 * except WORKBENCH_BLOCKED_PREFIXES. This widens PAGE access only: server actions keep
 * their requireProfile role gates and RLS keeps scoping rows, so a tech agent can open
 * /vendors but a write from that page still returns "unauthorized". Remove 'tech' here
 * to end the arrangement — nothing else needs to change.
 */
/**
 * Pages a domain can still REACH (ALWAYS_ALLOWED) but does not LIST in its nav. /helpdesk is the
 * sales call-intelligence library; it is noise on the concierge floor (founder, 2026-09-18).
 * Visibility only, like FOUNDER_NAV_PREFIXES. Admin and founder are not affected.
 */
export const DOMAIN_NAV_HIDDEN: Partial<Record<AppDomain, string[]>> = {
  // /tickets (Sia's own ticketing) stays REACHABLE for the concierge floor (the Sia chat's "make a
  // ticket from these messages" lands there) but is not listed: the founder's concierge nav
  // (2026-09-25) is Dashboard, Elaya, Members, Tasks, Vendors, Notes, Sia, Freshdesk.
  concierge: ['/helpdesk', '/tickets'],
};

export const WORKBENCH_DOMAINS: AppDomain[] = ['tech'];
/** Pages a workbench member still does not reach. /books is the organisation's money. */
export const WORKBENCH_BLOCKED_PREFIXES: string[] = ['/books'];
// /members (the Sia member twin, 0194): the whole queendom sees its members — the concierge
// domain reaches it here; admin/founder bypass this map; the rows are RLS-scoped (member_visible).


/**
 * Domain → permitted route prefixes.
 *
 * GIA domains (onboarding, house, shop, legacy) share the Gia feature set.
 * Non-Gia domains (concierge, finance, marketing, tech, business) get a narrower slice.
 */
export const DOMAIN_ROUTE_MAP: Record<AppDomain, string[]> = {
  // ── Gia sales domains (all four share the same feature set) ──────────────
  ...GIA_DOMAINS.reduce(
    (acc, domain) => ({
      ...acc,
      // /oversight is manager-read in practice — the page redirects agents/guests
      // (role gate), like /campaigns. /escalations is all-roles: agents get a
      // self-scoped view (own slipped leads/tasks), manager+ see the domain/org.
      // /budget is manager+ (the page's role redirect IS the authorization
      // boundary — this map only grants a Gia-domain manager REACHABILITY; agents
      // still bounce at the page, like /oversight). A manager sees only their own
      // domain's campaign SPEND (server-pinned via profile.domain) — the recharge
      // ledger/balance/gauge stay admin/founder-only (recharges carry no domain).
      // /admin/elaya-training is manager+ (the page's role redirect IS the
      // authorization boundary — this map only grants a Gia-domain manager
      // REACHABILITY; agents still bounce at the page, like /oversight). It is NOT
      // in ALWAYS_ALLOWED_PREFIXES on purpose: that would expose it to agents/guests.
      [domain]: ['/leads', '/deals', '/tasks', '/performance', '/oversight', '/campaigns', '/escalations', '/budget', '/whatsapp', '/settings', '/admin/elaya-training'],
    }),
    {} as Partial<Record<AppDomain, string[]>>,
  ),

  // ── Non-Gia domains ───────────────────────────────────────────────────────
  // /subscriptions is the Subscriptions & Bills Tracker — Finance + Tech own it
  // (admin/founder reach it by bypassing this map in canAccessRoute).
  // concierge (2026-09-18, founder): the floor works in Sia (the member WhatsApp groups) and
  // Freshdesk, not in the Gia sales inbox, so /whatsapp is gone and /sia + /freshdesk are in.
  // REACHABILITY only: both pages then ask sia-access.ts who the person is, and a seated
  // teammate sees only their own queendom (an unseated account is sent home).
  // /vendors (2026-09-18, founder): the whole concierge floor uses the vendor module; the pages
  // and actions ask hasVendorAccess (route-access.ts).
  // /settings left the concierge map 2026-09-25: it holds the Gia lead-routing roster and the Teach
  // Elaya doors (admin/founder), nothing a queen or genie uses; a seated manager saw a hub of dead doors.
  concierge: ['/tasks', '/members', '/tickets', '/sia', '/freshdesk', '/vendors'],
  finance:   ['/tasks', '/subscriptions', '/settings'],
  marketing: ['/tasks', '/campaigns', '/settings'],
  tech:      ['/tasks', '/subscriptions', '/settings'],
  business:  ['/tasks', '/leads', '/deals', '/campaigns', '/settings'],
} as Record<AppDomain, string[]>;
