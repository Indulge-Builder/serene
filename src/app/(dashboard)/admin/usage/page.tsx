import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getAgentUsage } from "@/lib/services/usage-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";
import { UsageDashboard } from "@/components/admin/usage/UsageDashboard";

/**
 * /admin/usage — adoption monitoring. Admin/founder only.
 *
 * Shows how much ACTIVE time each team member spends in Serene, per agent and
 * per domain, today + 30 days of daily history. "Active" = tab visible + a real
 * interaction in the last ~2 min (gated client-side in <UsagePresence>), NOT
 * merely logged in. Purpose: surface low-adoption users so usability problems
 * driving low usage can be fixed.
 *
 * RSC seed: getAgentUsage re-gates founder/admin in the service layer (defence
 * in depth alongside this page's role check) and returns null for anyone else.
 */
export default async function AdminUsagePage() {
  const profile = await getCurrentProfile();

  if (!profile || !["admin", "founder"].includes(profile.role)) {
    redirect("/dashboard");
  }

  // Seeded server-side (the page is already admin/founder-gated). null on
  // gate-miss or RPC error — the client shows an empty state, never throws.
  const report = await getAgentUsage();

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Usage<span className="page-title-dot">.</span>
        </h1>

        {TOP_BAR_ENABLED && (
          <PageControls
            userId={profile.id}
            isPrivileged={false}
            notificationsPromise={getNotifications(profile.id)}
          />
        )}
      </div>

      <UsageDashboard initialReport={report} />
    </main>
  );
}
