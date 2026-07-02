import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";
import { getTeamTaskOverview } from "@/lib/services/oversight-service";
import type { AppDomain } from "@/lib/types/database";
import { OversightSkeleton } from "./OversightSkeleton";
import { TeamOverviewGrid } from "@/components/oversight/TeamOverviewGrid";

// ─────────────────────────────────────────────
// /oversight — Tier 1 (Teams). Founder/admin only land here; a manager has no
// Tier 1 (they own one team) and is redirected to their own team detail; agents
// and guests are blocked entirely (the page redirects, the nav item is hidden,
// the layout guard + DOMAIN_ROUTE_MAP back it). docs/oversight.md §2/§3.
// ─────────────────────────────────────────────

async function TeamOverviewAsync({
  role,
  domain,
}: {
  role: "admin" | "founder";
  domain: AppDomain;
}) {
  // ONE aggregation query (get_team_task_overview) — admin/founder see every
  // rostered domain, present-agent pulse overlaid from listLivePresence().
  const rows = await getTeamTaskOverview({
    role,
    domain,
  });
  return <TeamOverviewGrid rows={rows} />;
}

export default async function OversightPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Agents + guests have no oversight surface.
  if (profile.role === "agent" || profile.role === "guest") redirect("/dashboard");

  // A manager owns exactly one team — send them straight to their team detail
  // (Tier 2), pinned to their own domain. They never see the all-teams Tier 1.
  if (profile.role === "manager") redirect(`/oversight/${profile.domain}`);

  // admin / founder — the all-teams overview.
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Oversight<span className="page-title-dot">.</span>
        </h1>
        {TOP_BAR_ENABLED && (
          <PageControls
            userId={profile.id}
            isPrivileged
            notificationsPromise={getNotifications(profile.id)}
          />
        )}
      </div>

      <Suspense fallback={<OversightSkeleton />}>
        <TeamOverviewAsync role={profile.role} domain={profile.domain} />
      </Suspense>
    </main>
  );
}
