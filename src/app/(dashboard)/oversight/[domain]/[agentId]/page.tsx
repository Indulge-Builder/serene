import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";
import { BackButton } from "@/components/ui/BackButton";
import { DOMAIN_LABELS, isAppDomain } from "@/lib/constants/domains";
import {
  getAgentTasksOversight,
  getAgentEvents,
} from "@/lib/services/oversight-service";
import { OversightSkeleton } from "../../OversightSkeleton";
import { AgentTaskList } from "@/components/oversight/AgentTaskList";
import { AgentOversightMetricsRow } from "@/components/oversight/AgentOversightMetricsRow";
import { OversightAgentRail } from "@/components/oversight/OversightRail";
import type { AppDomain } from "@/lib/types/database";

// ─────────────────────────────────────────────
// /oversight/[domain]/[agentId] — Tier 3 (Agent detail). The agent's personal +
// group tasks, their task metrics (derived from the same one query), and a live
// rail scoped to that agent. Read by a DIFFERENT user (not auth.uid()-scoped) —
// the sign-off case. Manager is clamped to own-domain agents. docs/oversight.md.
// ─────────────────────────────────────────────

type CallerRole = "manager" | "admin" | "founder";

async function AgentDetailAsync({
  caller,
  agentId,
}: {
  caller: { role: CallerRole; domain: AppDomain };
  agentId: string;
}) {
  // ONE aggregation query (get_agent_tasks_oversight) → task list + derived
  // metric counts (no second aggregation) + the rail seed.
  const [result, eventSeed] = await Promise.all([
    getAgentTasksOversight(caller, agentId),
    getAgentEvents(agentId),
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <AgentOversightMetricsRow metrics={result.metrics} />
        <AgentTaskList tasks={result.tasks} />
      </div>
      <OversightAgentRail agentId={agentId} initialEvents={eventSeed} />
    </div>
  );
}

export default async function OversightAgentPage({
  params,
}: {
  params: Promise<{ domain: string; agentId: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "agent" || profile.role === "guest") redirect("/dashboard");

  let domainRaw: string;
  let agentId: string;
  try {
    const p = await params;
    domainRaw = decodeURIComponent(p.domain);
    agentId = decodeURIComponent(p.agentId);
  } catch {
    notFound();
  }
  if (!isAppDomain(domainRaw)) notFound();
  const domain = domainRaw as AppDomain;

  // MANAGER CLAMP (the URL domain) — a manager can only browse within their team.
  if (profile.role === "manager" && domain !== profile.domain) {
    redirect(`/oversight/${profile.domain}`);
  }

  // Resolve the agent for the header + the agent-vs-team-domain check. One read
  // (not per-card). A non-existent agent, or an agent outside this team's domain,
  // → 404 (the agent must belong to the team whose URL we are under). The service
  // RPC also re-clamps a manager to their own-domain agents (returns zero rows).
  const admin = createAdminClient();
  const { data: agent } = await admin
    .from("profiles")
    .select("id, full_name, domain, role")
    .eq("id", agentId)
    .single();

  if (!agent || agent.domain !== domain) notFound();

  const caller = {
    role: profile.role as CallerRole,
    domain: profile.domain,
  };

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center min-w-0" style={{ gap: "var(--space-4)" }}>
          <BackButton
            href={`/oversight/${domain}`}
            label={`Back to ${DOMAIN_LABELS[domain]}`}
          />
          <div className="min-w-0">
            <h1 className="type-page-title m-0 truncate">
              {agent.full_name ?? "Agent"}
            </h1>
            <p
              className="m-0"
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--theme-text-tertiary)",
                letterSpacing: "var(--tracking-wide)",
              }}
            >
              {DOMAIN_LABELS[domain]}
            </p>
          </div>
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
        <AgentDetailAsync caller={caller} agentId={agentId} />
      </Suspense>
    </main>
  );
}
