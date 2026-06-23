import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";
import { BackButton } from "@/components/ui/BackButton";
import { DOMAIN_LABELS, isAppDomain } from "@/lib/constants/domains";
import {
  getTeamAgentBreakdown,
  getTeamEvents,
} from "@/lib/services/oversight-service";
import { OversightSkeleton } from "../OversightSkeleton";
import { AgentBreakdownGrid } from "@/components/oversight/AgentBreakdownGrid";
import { OversightTeamRail } from "@/components/oversight/OversightRail";
import type { AppDomain } from "@/lib/types/database";

// ─────────────────────────────────────────────
// /oversight/[domain] — Tier 2 (Team detail). Per-agent cards + the live team
// activity rail. Managers LAND here (Tier 1 redirects them) clamped to their
// own domain; admin/founder reach it by drilling a Tier 1 card. docs/oversight.md.
// ─────────────────────────────────────────────

async function TeamDetailAsync({
  caller,
  domain,
}: {
  caller: { role: AppDomainCallerRole; domain: AppDomain };
  domain: AppDomain;
}) {
  // ONE aggregation query (get_team_agent_breakdown) + the rail seed (a bounded
  // task_events read). The rail then subscribes to Realtime INSERTs from there.
  const [rows, eventSeed] = await Promise.all([
    getTeamAgentBreakdown(caller, domain),
    getTeamEvents(domain),
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
      <AgentBreakdownGrid domain={domain} rows={rows} />
      <OversightTeamRail domain={domain} initialEvents={eventSeed} />
    </div>
  );
}

type AppDomainCallerRole = "manager" | "admin" | "founder";

export default async function OversightTeamPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "agent" || profile.role === "guest") redirect("/dashboard");

  // decodeURIComponent can throw on a malformed param (Q-10) → 404, not 500.
  let raw: string;
  try {
    const p = await params;
    raw = decodeURIComponent(p.domain);
  } catch {
    notFound();
  }
  if (!isAppDomain(raw)) notFound();
  const domain = raw as AppDomain;

  // MANAGER CLAMP — a manager may only see their own team. Requesting another
  // team's URL sends them to their own (never another team's data). admin/founder
  // pass through to any domain. (The service/RPC re-clamp is the third layer.)
  if (profile.role === "manager" && domain !== profile.domain) {
    redirect(`/oversight/${profile.domain}`);
  }

  const caller = {
    role: profile.role as AppDomainCallerRole,
    domain: profile.domain,
  };

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center" style={{ gap: "var(--space-4)" }}>
          {/* Founder/admin came from Tier 1; a manager has no Tier 1, so their
              back-link returns to the dashboard. */}
          <BackButton
            href={profile.role === "manager" ? "/dashboard" : "/oversight"}
            label={profile.role === "manager" ? "Back to dashboard" : "Back to teams"}
          />
          <h1 className="type-page-title m-0">{DOMAIN_LABELS[domain]}</h1>
        </div>
        {TOP_BAR_ENABLED && (
          <PageControls
            userId={profile.id}
            isPrivileged={profile.role !== "manager"}
            notificationsPromise={getNotifications(profile.id)}
          />
        )}
      </div>

      <Suspense fallback={<OversightSkeleton />}>
        <TeamDetailAsync caller={caller} domain={domain} />
      </Suspense>
    </main>
  );
}
