import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import {
  getDashboardSummary,
  getLeadVolumeByPeriod,
} from "@/lib/services/dashboard-service";
import { DashboardCanvas } from "@/components/dashboard/DashboardCanvas";
import { pickDashboardGreeting } from "@/lib/constants/dashboard-greetings";
import type { AppDomain, UserRole } from "@/lib/types/database";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const role = profile.role as UserRole;
  const domain = profile.domain as AppDomain;

  // Fetch RPC summary + week volume in parallel — one network round-trip each.
  const [rpcData, weekVolume] = await Promise.all([
    getDashboardSummary(role, domain, profile.id),
    getLeadVolumeByPeriod(role, domain, "week"),
  ]);

  const initialData = { ...rpcData, lead_volume: weekVolume };
  const greeting = pickDashboardGreeting();
  const firstName = profile.full_name.split(" ")[0];

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
