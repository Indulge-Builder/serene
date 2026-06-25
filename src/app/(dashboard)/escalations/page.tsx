import { Suspense }          from "react";
import { redirect }          from "next/navigation";
import { cookies }           from "next/headers";
import type { SearchParams } from "next/dist/server/request/search-params";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications }  from "@/lib/services/notifications-service";
import { resolveDomainParam } from "@/lib/utils/domain-scope";
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
 * /escalations — the breach surface for the Gia follow-up engine.
 *
 * Three live lists, all driven by artifacts the engine already produces:
 * fired lead_sla_timers (still matching the lead's status), tasks.overdue_at
 * stamps (0113), and the going-cold predicate shared with /leads.
 *
 * Scope by role:
 *   • agent  → their OWN slipped leads/tasks (self-coaching mirror; assignedTo).
 *   • manager → own domain.
 *   • admin/founder → org-wide, with a Domain column.
 * Deliberately un-cached. Layout guard keeps this Gia-domain-only.
 */
export default async function EscalationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "guest") redirect("/dashboard");

  const isPrivileged = profile.role === "admin" || profile.role === "founder";
  const isAgent      = profile.role === "agent";

  // Global domain scope: the shared resolver owns the decision — `?domain=`
  // param first, `serene-domain` cookie fallback for admin/founder; always null
  // for manager (the service then pins them to their own domain). Mirrors
  // leads/deals/campaigns; never re-inline the cookie read here.
  const [resolvedParams, cookieStore] = await Promise.all([searchParams, cookies()]);
  const scopeDomain = resolveDomainParam(resolvedParams, cookieStore, profile.role);
  const domain: AppDomain | null = isPrivileged ? scopeDomain : profile.domain;

  // Agents see only their own slipped work — never the wider domain's.
  const assignedTo = isAgent ? profile.id : null;

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Escalations<span className="page-title-dot">.</span>
        </h1>
        {TOP_BAR_ENABLED && (
          <PageControls
            userId={profile.id}
            isPrivileged={isPrivileged}
            notificationsPromise={getNotifications(profile.id)}
          />
        )}
      </div>

      <Suspense fallback={<EscalationsSkeleton />}>
        <EscalationsAsync domain={domain} assignedTo={assignedTo} showDomain={isPrivileged} selfView={isAgent} />
      </Suspense>
    </main>
  );
}

async function EscalationsAsync({
  domain,
  assignedTo,
  showDomain,
  selfView,
}: {
  domain:     AppDomain | null;
  assignedTo: string | null;
  showDomain: boolean;
  selfView:   boolean;
}) {
  const [breached, overdue, cold] = await Promise.all([
    getEscalatedLeads(domain, assignedTo),
    getOverdueGiaTasks(domain, assignedTo),
    getGoingColdLeads({ domain, assignedTo }),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label={selfView ? "Leads slipped" : "SLA breaches"} value={String(breached.length)} />
        <StatTile label="Overdue tasks" value={String(overdue.length)} />
        <StatTile label="Going cold" value={String(cold.length)} />
      </div>

      <EscalatedLeadsSection rows={breached} showDomain={showDomain} selfView={selfView} />
      <OverdueTasksSection rows={overdue} showDomain={showDomain} selfView={selfView} />
      <GoingColdSection rows={cold} showDomain={showDomain} selfView={selfView} />
    </div>
  );
}
