import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import {
  getDashboardSummary,
  getLeadVolumeByRange,
  getLeadVolumeByDomains,
} from "@/lib/services/dashboard-service";
import { GIA_DOMAINS } from "@/lib/constants/domains";
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

  // Agents never use the date filter (their widgets ignore it).
  // For agents, skip date range resolution for the RPC (pass null).
  const rpcDateRange = role === 'agent' ? undefined : dateRange;

  // ── Seed initial data via single RPC ──────────────────────────────────────
  // perf-01: do NOT split into N per-widget calls on initial paint.
  // getDashboardSummary returns all summary data in one RPC call.
  let initialData: DashboardSummary;

  const isManagerPlus = role === "manager" || role === "admin" || role === "founder";

  try {
    const [rpcData, managerVolume, multiVolume] = await Promise.all([
      getDashboardSummary(
        role,
        domain,
        profile.id,
        isManager ? undefined : ("onboarding" as AppDomain),
        rpcDateRange,
      ),
      isManager
        ? getLeadVolumeByRange(role, domain, dateRange)
        : Promise.resolve(null),
      isManagerPlus && !isManager
        ? getLeadVolumeByDomains([...GIA_DOMAINS], dateRange)
        : Promise.resolve(null),
    ]);
    initialData = {
      ...rpcData,
      agent_tasks:       rpcData.agent_tasks    ?? [],
      agent_activity:    rpcData.agent_activity ?? [],
      campaigns:         rpcData.campaigns      ?? [],
      lead_volume:       managerVolume,
      lead_volume_multi: multiVolume,
    };
  } catch (e) {
    console.error("[dashboard/page] RPC failed, rendering with empty initial data:", e);
    initialData = {
      agent_tasks:    [],
      agent_activity: [],
      lead_status:    { totals: [], byAgent: [] },
      campaigns:      [],
      lead_volume:       null,
      lead_volume_multi: null,
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
        initialData={initialData}
        activePreset={activePreset}
        fromParam={fromParam}
        toParam={toParam}
        dateRange={dateRange}
      />
    </main>
  );
}
