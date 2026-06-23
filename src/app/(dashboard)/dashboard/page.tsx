import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentProfile } from "@/lib/services/profiles-service";
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
} from "@/lib/services/ad-spend-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { GIA_DOMAINS } from "@/lib/constants/domains";
import { resolveDomainParam } from "@/lib/utils/domain-scope";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
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
  let initialData: DashboardSummary;

  const isManagerPlus = role === "manager" || role === "admin" || role === "founder";

  // Admin/founder seed scope: the chosen Gia domain, or undefined for the
  // org-wide "All domains" aggregate (replaces the old hardcoded 'onboarding').
  const adminFounderScope: AppDomain | undefined = scopeDomain ?? undefined;

  // Admin/founder volume seed split by shape (each key has a distinct type):
  //   scoped domain → single-line LeadVolumeSummary (lead_volume)
  //   "All domains" → MultiDomainVolumeSummary       (lead_volume_multi)
  const adminFounderSingleVolume = isManagerPlus && !isManager && scopeDomain;
  const adminFounderMultiVolume  = isManagerPlus && !isManager && !scopeDomain;

  try {
    const [rpcData, recentLeads, managerVolume, adminSingleVolume, adminMultiVolume, budgetRows, budgetRecharges] = await Promise.all([
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
      // Budget widget seed (manager+ only) — date-filtered like campaigns;
      // managers are pinned to their own domain before the data reaches the client.
      isManagerPlus
        ? getBudgetSummary(dateRange.from, dateRange.to)
        : Promise.resolve(null),
      // Fuel-gauge recharges (manager+ only) — the gauge is ALWAYS org-wide
      // (recharges carry no domain, so a per-domain "remaining" would be a
      // finance error); fetched unscoped alongside the spend rows.
      isManagerPlus
        ? getAccountRecharges(dateRange.from, dateRange.to)
        : Promise.resolve(null),
    ]);
    // Budget pre-filter: managers → own domain; admin/founder → the scoped
    // domain (or full rows for the all-domains view). Mirrors the manager pin.
    const budgetFilterDomain: AppDomain | null = isManager
      ? domain
      : (scopeDomain ?? null);
    initialData = {
      ...rpcData,
      agent_tasks:       rpcData.agent_tasks    ?? [],
      // Recent-leads rollup (migration 0132 — lead cards, not the RPC's old
      // event-stream agent_activity CTE). Always the dedicated rollup result.
      agent_activity:    recentLeads ?? [],
      campaigns:         rpcData.campaigns      ?? [],
      // Manager → own single-domain seed; admin/founder scoped → single seed.
      lead_volume:       isManager ? managerVolume : adminSingleVolume,
      lead_volume_multi: adminMultiVolume,
      budget_summary:    budgetRows && budgetFilterDomain
        ? filterBudgetRowsByDomain(budgetRows, budgetFilterDomain)
        : budgetRows,
      // Fuel gauge — org-wide (UNFILTERED spend + recharges); recharges have no
      // domain, so this is the same tank for every manager+ viewer.
      budget_gauge:      budgetRows
        ? buildBudgetGaugeSummary(budgetRows, budgetRecharges ?? [])
        : null,
    };
  } catch (e) {
    console.error(
      "[dashboard/page] RPC failed, rendering with empty initial data:",
      e instanceof Error ? e.message : JSON.stringify(e),
      e,
    );
    initialData = {
      agent_tasks:    [],
      agent_activity: [],
      lead_status:    { totals: [], byAgent: [] },
      campaigns:      [],
      lead_volume:       null,
      lead_volume_multi: null,
      budget_summary:    null,
      budget_gauge:      null,
    };
  }

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
        initialData={initialData}
        activePreset={activePreset}
        fromParam={fromParam}
        toParam={toParam}
        dateRange={dateRange}
        notificationsPromise={TOP_BAR_ENABLED ? getNotifications(profile.id) : undefined}
      />
    </main>
  );
}
