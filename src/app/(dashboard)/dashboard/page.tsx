import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import {
  getDashboardSummary,
  getLeadVolumeByPeriod,
} from "@/lib/services/dashboard-service";
import { DashboardCanvas } from "@/components/dashboard/DashboardCanvas";
import { pickDashboardGreeting } from "@/lib/constants/dashboard-greetings";
import type { AppDomain, UserRole } from "@/lib/types/database";
import type { DashboardSummary } from "@/lib/types";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const role   = profile.role as UserRole;
  const domain = profile.domain as AppDomain;
  const isManager = role === "manager";

  // Seed admin/founder with onboarding-scoped pipeline data (their default tab).
  // Manager receives no p_initial_domain — their data is always domain-scoped.
  // Volume RSC is skipped for admin/founder: they fire a multi-domain fetch on mount.
  let initialData: DashboardSummary;

  try {
    const [rpcData, weekVolume] = await Promise.all([
      getDashboardSummary(
        role,
        domain,
        profile.id,
        isManager ? undefined : ("onboarding" as AppDomain),
      ),
      isManager
        ? getLeadVolumeByPeriod(role, domain, "week")
        : Promise.resolve(null),
    ]);
    initialData = { ...rpcData, lead_volume: weekVolume };
  } catch (e) {
    console.error("[dashboard/page] RPC failed, rendering with empty initial data:", e);
    initialData = {
      agent_tasks:    [],
      agent_activity: [],
      lead_status:    { totals: [], byAgent: [] },
      campaigns:      [],
      lead_volume:    null,
    };
  }

  const greeting   = pickDashboardGreeting();
  const firstName  = profile.full_name.split(" ")[0];

  return (
    <main className="flex-1 p-8">
      <DashboardCanvas
        greeting={greeting}
        firstName={firstName}
        userId={profile.id}
        role={profile.role}
        domain={profile.domain}
        initialData={initialData}
      />
    </main>
  );
}
