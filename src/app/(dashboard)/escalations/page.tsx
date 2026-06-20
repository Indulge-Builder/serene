import { Suspense }          from "react";
import { redirect }          from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications }  from "@/lib/services/notifications-service";
import { TOP_BAR_ENABLED }   from "@/lib/constants/feature-flags";
import { PageControls }      from "@/components/layout/PageControls";
import {
  getEscalatedLeads,
  getOverdueGiaTasks,
  getGoingColdLeads,
} from "@/lib/services/sla-service";
import { StatTile }   from "@/components/ui/StatTile";
import {
  EscalatedLeadsSection,
  OverdueTasksSection,
  GoingColdSection,
} from "@/components/escalations/EscalationSections";
import { EscalationsSkeleton } from "./loading";
import type { AppDomain } from "@/lib/types/database";

export const metadata = { title: "Escalations — Serene" };

/**
 * /escalations — the manager+ breach surface for the Gia follow-up engine.
 *
 * Three live lists, all driven by artifacts the engine already produces:
 * fired lead_sla_timers (still matching the lead's status), tasks.overdue_at
 * stamps (0113), and the going-cold predicate shared with /leads.
 * Manager → own domain; admin/founder → org-wide. Deliberately un-cached.
 */
export default async function EscalationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "agent" || profile.role === "guest") redirect("/dashboard");

  const isPrivileged = profile.role === "admin" || profile.role === "founder";
  const domain: AppDomain | null = isPrivileged ? null : profile.domain;

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Escalations<span className="page-title-dot">.</span>
        </h1>
        {TOP_BAR_ENABLED && (
          <PageControls
            userId={profile.id}
            isPrivileged={false}
            notificationsPromise={getNotifications(profile.id)}
          />
        )}
      </div>

      <Suspense fallback={<EscalationsSkeleton />}>
        <EscalationsAsync domain={domain} showDomain={isPrivileged} />
      </Suspense>
    </main>
  );
}

async function EscalationsAsync({
  domain,
  showDomain,
}: {
  domain:     AppDomain | null;
  showDomain: boolean;
}) {
  const [breached, overdue, cold] = await Promise.all([
    getEscalatedLeads(domain),
    getOverdueGiaTasks(domain),
    getGoingColdLeads({ domain }),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="SLA breaches" value={String(breached.length)} />
        <StatTile label="Overdue tasks" value={String(overdue.length)} />
        <StatTile label="Going cold" value={String(cold.length)} />
      </div>

      <EscalatedLeadsSection rows={breached} showDomain={showDomain} />
      <OverdueTasksSection rows={overdue} showDomain={showDomain} />
      <GoingColdSection rows={cold} showDomain={showDomain} />
    </div>
  );
}
