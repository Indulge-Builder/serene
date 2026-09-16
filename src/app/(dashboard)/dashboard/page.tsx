import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { isMobileUserAgent } from "@/lib/utils/device";
import { FORCE_DESKTOP_COOKIE } from "@/lib/constants/mobile-rooms";
import {
  getDashboardSummary,
  getLeadVolumeByRange,
  getLeadVolumeByDomains,
  getLeadVolumeForDomain,
  getAgentRecentActivity,
} from "@/lib/services/dashboard-service";
import {
  getBudgetSummary,
  getAccountRecharges,
  filterBudgetRowsByDomain,
  buildBudgetGaugeSummary,
  buildDomainSpendGaugeSummary,
} from "@/lib/services/ad-spend-service";
import { GIA_DOMAINS } from "@/lib/constants/domains";
import { resolveDomainParam } from "@/lib/utils/domain-scope";
import { DashboardCanvas } from "@/components/dashboard/DashboardCanvas";
import { pickDashboardGreeting } from "@/lib/constants/dashboard-greetings";
import type { AppDomain, UserRole } from "@/lib/types/database";
import type { DashboardSummary } from "@/lib/types";
import {
  resolvePresetToRange,
  rangeFromUrlParams,
  type DatePreset,
  type DateRange,
} from "@/lib/utils/date-range";

const VALID_PRESETS: DatePreset[] = ['today', 'week', 'month', 'last_month', 'quarter', 'custom'];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const sp = await searchParams;

  // Mobile Ops: an admin/founder landing on the desktop dashboard from a phone
  // is sent to the pocket /m surface (their rooms are fully built). Manager/agent
  // stay here until their room sets ship, and every desktop browser is untouched.
  // Authorization is unaffected — this only picks which fully-functional surface
  // loads; the "View desktop site" drawer link sets FORCE_DESKTOP_COOKIE to opt out.
  // Gated on a bare landing (no query params) so a shared /dashboard?… deep link
  // or a back-nav from within the dashboard is never hijacked mid-flow.
  if (
    (profile.role === "admin" || profile.role === "founder") &&
    Object.keys(sp).length === 0 &&
    (await cookies()).get(FORCE_DESKTOP_COOKIE)?.value !== "1" &&
    (await isMobileUserAgent())
  ) {
    redirect("/m");
  }

  // ── Resolve active date range from URL params ──────────────────────────────
  // dash_preset: 'today' | 'week' | 'month' | 'quarter' | 'custom'
  // dash_from / dash_to: YYYY-MM-DD (only used when preset=custom)
  const rawPreset = sp.dash_preset ?? 'week';
  const activePreset: DatePreset = VALID_PRESETS.includes(rawPreset as DatePreset)
    ? (rawPreset as DatePreset)
    : 'week';
  const fromParam = sp.dash_from ?? null;
  const toParam   = sp.dash_to   ?? null;

  let dateRange: DateRange;
  if (activePreset === 'custom') {
    const customRange = rangeFromUrlParams(fromParam, toParam);
    // Fall back to "week" if custom params are malformed
    dateRange = customRange ?? resolvePresetToRange('week');
  } else {
    dateRange = resolvePresetToRange(activePreset);
  }

  const role   = profile.role as UserRole;
  const domain = profile.domain as AppDomain;
  const isManager = role === "manager";

  // ── Global domain scope (admin/founder) ────────────────────────────────────
  // The SAME serene-domain param/cookie the list pages read — one selector, one
  // resolver (domain-scope.ts). Admin/founder → the chosen Gia domain or null
  // ("All domains" → org-wide aggregate). Manager/agent → always null (the
  // service pins managers to their own domain regardless). Sourcing the seed
  // scope from here is what unifies the dashboard onto the global selector.
  const scopeDomain = resolveDomainParam(sp, await cookies(), role);

  // Agents never use the date filter (their widgets ignore it).
  // For agents, skip date range resolution for the RPC (pass null).
  const rpcDateRange = role === 'agent' ? undefined : dateRange;

  // ── Seed initial data via single RPC ──────────────────────────────────────
  // perf-01: do NOT split into N per-widget calls on initial paint.
  // getDashboardSummary returns all summary data in one RPC call.
  //
  // NOT awaited here (2026-09-16, perf: the dashboard no longer blocks on its
  // fetches). The Promise.all below starts now and is handed to DashboardCanvas
  // as `initialDataPromise`; the page returns immediately, the header paints,
  // and the grid resolves the seed behind its own Suspense (<Await>). Same
  // seven calls, same single Promise.all, same empty-summary fallback on
  // failure — only the await moved from the page to the grid boundary.
  const EMPTY_SUMMARY: DashboardSummary = {
    agent_tasks:    [],
    agent_activity: [],
    lead_status:    { totals: [], byAgent: [] },
    campaigns:      [],
    lead_volume:       null,
    lead_volume_multi: null,
    budget_summary:    null,
    budget_gauge:      null,
  };

  const isManagerPlus = role === "manager" || role === "admin" || role === "founder";
  // Budget widget is manager+ (mirrors the /budget page + the budget widget's
  // roles). Admin/founder seed the ORG-WIDE gauge (spend + org recharges); a
  // MANAGER seeds a domain-scoped SPEND gauge (spend filtered to profile.domain,
  // no recharges — recharges carry no domain). Only admin/founder fetch recharges
  // and the legacy per-domain budget_summary campaign seed.
  const isAdminFounder = role === "admin" || role === "founder";

  // Admin/founder seed scope: the chosen Gia domain, or undefined for the
  // org-wide "All domains" aggregate (replaces the old hardcoded 'onboarding').
  const adminFounderScope: AppDomain | undefined = scopeDomain ?? undefined;

  // Admin/founder volume seed split by shape (each key has a distinct type):
  //   scoped domain → single-line LeadVolumeSummary (lead_volume)
  //   "All domains" → MultiDomainVolumeSummary       (lead_volume_multi)
  const adminFounderSingleVolume = isManagerPlus && !isManager && scopeDomain;
  const adminFounderMultiVolume  = isManagerPlus && !isManager && !scopeDomain;

  const initialDataPromise: Promise<DashboardSummary> = Promise.all([
      getDashboardSummary(
        role,
        domain,
        profile.id,
        isManager ? undefined : adminFounderScope,
        rpcDateRange,
      ),
      // Recent-leads rollup seed (migration 0132). Always seeded from the
      // dedicated lead-rollup RPC — NOT from get_dashboard_summary's
      // agent_activity CTE (that is still the old event shape and would not
      // match the lead card). Default 'team' scope; admin/founder pass the
      // global scopeDomain (null = all-org), managers are pinned in SQL.
      getAgentRecentActivity(profile.id, role, domain, scopeDomain ?? undefined, 'team'),
      // Manager volume — single line, pinned to the manager's own domain.
      isManager
        ? getLeadVolumeByRange(role, domain, dateRange)
        : Promise.resolve(null),
      // Admin/founder single-domain volume — only when a domain is scoped.
      adminFounderSingleVolume
        ? getLeadVolumeForDomain(scopeDomain, dateRange)
        : Promise.resolve(null),
      // Admin/founder multi-domain volume — the "All domains" aggregate.
      adminFounderMultiVolume
        ? getLeadVolumeByDomains([...GIA_DOMAINS], dateRange)
        : Promise.resolve(null),
      // Budget widget spend seed (manager+) — date-filtered like campaigns.
      // Managers get the same spend rows; they are filtered to profile.domain
      // below (a manager can never see another domain's spend).
      isManagerPlus
        ? getBudgetSummary(dateRange.from, dateRange.to)
        : Promise.resolve(null),
      // Fuel-gauge recharges (admin/founder only) — the gauge is ALWAYS org-wide
      // (recharges carry no domain, so a per-domain "remaining" would be a
      // finance error); fetched unscoped alongside the spend rows.
      isAdminFounder
        ? getAccountRecharges(dateRange.from, dateRange.to)
        : Promise.resolve(null),
  ]).then(([rpcData, recentLeads, managerVolume, adminSingleVolume, adminMultiVolume, budgetRows, budgetRecharges]): DashboardSummary => {
    // Budget pre-filter for the LEGACY per-domain budget_summary campaign seed
    // (admin/founder only — the scoped domain, or null for all-domains full rows).
    // Managers never seed budget_summary (they have no org-wide budget consumer).
    const budgetFilterDomain: AppDomain | null = scopeDomain ?? null;
    return {
      ...rpcData,
      agent_tasks:       rpcData.agent_tasks    ?? [],
      // Recent-leads rollup (migration 0132 — lead cards, not the RPC's old
      // event-stream agent_activity CTE). Always the dedicated rollup result.
      agent_activity:    recentLeads ?? [],
      campaigns:         rpcData.campaigns      ?? [],
      // Manager → own single-domain seed; admin/founder scoped → single seed.
      lead_volume:       isManager ? managerVolume : adminSingleVolume,
      lead_volume_multi: adminMultiVolume,
      // Legacy per-domain campaign seed — admin/founder only (managers null).
      budget_summary:    !isAdminFounder
        ? null
        : budgetRows && budgetFilterDomain
          ? filterBudgetRowsByDomain(budgetRows, budgetFilterDomain)
          : budgetRows,
      // Fuel gauge seed. Manager → domain-scoped SPEND gauge (spend filtered to
      // their own domain, no recharge). Admin/founder → the org-wide tank
      // (UNFILTERED spend + org recharges; recharges carry no domain, so the same
      // tank for every admin/founder viewer).
      budget_gauge:      !budgetRows
        ? null
        : isManager
          ? buildDomainSpendGaugeSummary(filterBudgetRowsByDomain(budgetRows, domain))
          : buildBudgetGaugeSummary(budgetRows, budgetRecharges ?? []),
    };
  }).catch((e: unknown): DashboardSummary => {
    console.error(
      "[dashboard/page] RPC failed, rendering with empty initial data:",
      e instanceof Error ? e.message : JSON.stringify(e),
      e,
    );
    return EMPTY_SUMMARY;
  });

  const greeting   = pickDashboardGreeting();
  const firstName  = profile.full_name.split(" ")[0];

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <DashboardCanvas
        greeting={greeting}
        firstName={firstName}
        userId={profile.id}
        role={profile.role}
        domain={profile.domain}
        scopeDomain={scopeDomain}
        initialDataPromise={initialDataPromise}
        activePreset={activePreset}
        fromParam={fromParam}
        toParam={toParam}
        dateRange={dateRange}
      />
    </main>
  );
}
