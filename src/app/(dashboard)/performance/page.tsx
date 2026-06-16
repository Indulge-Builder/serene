import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getNotifications } from "@/lib/services/notifications-service";
import { DEFAULT_GIA_DOMAIN, GIA_DOMAINS } from "@/lib/constants/domains";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { PageControls } from "@/components/layout/PageControls";
import type { PerformancePeriod } from "@/lib/services/performance-service";
import { ManagerPerformanceSkeleton } from "./ManagerPerformanceSkeleton";
import { PerformanceSkeleton } from "./PerformanceSkeleton";
import { ManagerPerformanceAsync } from "./ManagerPerformanceAsync";
import { FounderPerformanceShell } from "./FounderPerformanceShell";
import { PerformanceFilters } from "@/components/performance/PerformanceFilters";
import { AgentPerformanceShell } from "@/components/performance/AgentPerformanceShell";
import type { AppDomain } from "@/lib/types/database";

// ─────────────────────────────────────────────
// Motivational footer — server component, Elaya's voice (agent view only)
// ─────────────────────────────────────────────

// Periods that read as "this <period>" in the footer; any other range
// (custom, today) gets a neutral phrasing.
const PERIOD_PHRASE: Partial<Record<PerformancePeriod, string>> = {
  this_week: "week",
  this_month: "month",
  last_month: "month",
};

function PerformanceMotivationalFooter({
  leadsWon,
  inDiscussionCount,
  period,
}: {
  leadsWon: number;
  inDiscussionCount: number;
  period: PerformancePeriod;
}) {
  let message: string;
  const phrase = PERIOD_PHRASE[period];

  if (leadsWon > 0) {
    message = `You've closed ${leadsWon} lead${leadsWon === 1 ? "" : "s"} ${
      phrase ? `this ${phrase}` : "in this period"
    }.`;
  } else if (inDiscussionCount > 0) {
    message = `${inDiscussionCount} lead${inDiscussionCount === 1 ? "" : "s"} in discussion — almost there.`;
  } else {
    message = "Every expert was once a beginner.";
  }

  return (
    <div
      style={{
        paddingTop: "var(--space-8)",
        paddingBottom: "var(--space-4)",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: "var(--text-lg)",
          fontWeight: "var(--weight-light)",
          color: "var(--theme-text-secondary)",
          margin: 0,
        }}
      >
        {message}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Agent view async subtree — streams behind PerformanceSkeleton so the
// header paints as soon as the role is known instead of blocking on the RPC
// (loading.tsx renders the manager/founder chrome; this keeps the agent's
// exposure to it down to the profile-fetch window).
// ─────────────────────────────────────────────

async function AgentPerformanceAsync({
  agentId,
  agentDomain,
  period,
  customFrom,
  customTo,
}: {
  agentId: string;
  agentDomain: AppDomain;
  period: PerformancePeriod;
  customFrom: string | null;
  customTo: string | null;
}) {
  // One self-scoped RPC round trip (perf audit D-2) — replaces the previous
  // 5-function / ~17-query fan-out. The RPC reads auth.uid() internally.
  // Fetched server-side for the resolved range; the shell key-remounts per
  // range (no client refetch effect — honours the one-RPC-per-view rule).
  const { getAgentPerformanceSummary } = await import(
    "@/lib/services/performance-service"
  );
  const initialData = await getAgentPerformanceSummary(
    period,
    customFrom ?? undefined,
    customTo ?? undefined,
  );

  return (
    <>
      <AgentPerformanceShell
        key={`${period}:${customFrom ?? ""}:${customTo ?? ""}`}
        agentId={agentId}
        agentDomain={agentDomain}
        period={period}
        customFrom={customFrom}
        customTo={customTo}
        initialData={initialData}
      />
      <PerformanceMotivationalFooter
        leadsWon={initialData.core.leadsWon}
        inDiscussionCount={initialData.effort.inDiscussionCount}
        period={period}
      />
    </>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  if (profile.role === "guest") redirect("/dashboard");

  const params = await searchParams;

  // Pure date_from/date_to URL params (the FilterBar Range/Dates contract, same
  // as /leads) → the PerformancePeriod + ISO range the service layer keys on.
  // resolvePerformanceDateParams is THE single boundary; default = This Month.
  const { resolvePerformanceDateParams } = await import(
    "@/lib/services/performance-service"
  );
  const dateFrom = typeof params.date_from === "string" ? params.date_from : null;
  const dateTo   = typeof params.date_to === "string" ? params.date_to : null;
  const { period, from, to, customFrom, customTo } = resolvePerformanceDateParams(
    dateFrom,
    dateTo,
  );

  // ── Agent view ──────────────────────────────────────────────────────────
  // URL-driven: the shared PerformanceFilters writes date_from/date_to, the
  // shell key-remounts per range with the server-fetched data.
  if (profile.role === "agent") {
    return (
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="type-page-title m-0">
            Your Performance<span className="page-title-dot">.</span>
          </h1>
          {TOP_BAR_ENABLED && (
            <PageControls
              userId={profile.id}
              isPrivileged={false}
              notificationsPromise={getNotifications(profile.id)}
            />
          )}
        </div>
        <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
          <PerformanceFilters showSearch={false} />
        </div>
        <Suspense fallback={<PerformanceSkeleton />}>
          <AgentPerformanceAsync
            agentId={profile.id}
            agentDomain={profile.domain}
            period={period}
            customFrom={customFrom}
            customTo={customTo}
          />
        </Suspense>
      </main>
    );
  }

  // ── Manager view ───────────────────────────────────────────────────────
  // domain is always read from the server-verified profile — never from URL params
  if (profile.role === "manager") {
    return (
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="type-page-title m-0">
            Team Performance<span className="page-title-dot">.</span>
          </h1>
          {TOP_BAR_ENABLED && (
            <PageControls
              userId={profile.id}
              isPrivileged={false}
              notificationsPromise={getNotifications(profile.id)}
            />
          )}
        </div>
        <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
          <PerformanceFilters showSearch />
        </div>
        <Suspense fallback={<ManagerPerformanceSkeleton />}>
          <ManagerPerformanceAsync
            domain={profile.domain}
            period={period}
            customFrom={customFrom ?? undefined}
            customTo={customTo ?? undefined}
          />
        </Suspense>
      </main>
    );
  }

  // ── Founder / admin view ────────────────────────────────────────────────
  // All domains in one roster; domain filtering is client-side in ManagerPerformancePanel.
  // Fetch domain health server-side so the Domains tab has initial data on first paint.
  // from/to are already resolved (boundary-ISO) by resolvePerformanceDateParams.
  const { getDomainHealthMetrics, getPeriodDateRange } = await import("@/lib/services/performance-service");
  const { getDomainTargets } = await import("@/lib/services/domain-targets-service");
  const monthRange = getPeriodDateRange('this_month');

  const [initialDomainHealth, monthHealth, domainTargets] = await Promise.all([
    getDomainHealthMetrics([...GIA_DOMAINS] as AppDomain[], from, to),
    // The target meter is month-pinned; when the active period IS this month,
    // reuse the same fetch instead of a second RPC round trip.
    period === 'this_month'
      ? Promise.resolve(null)
      : getDomainHealthMetrics([...GIA_DOMAINS] as AppDomain[], monthRange.from, monthRange.to),
    getDomainTargets(),
  ]);

  const monthDeals = Object.fromEntries(
    (monthHealth ?? initialDomainHealth).map((c) => [c.domain, c.totalDeals]),
  ) as Partial<Record<AppDomain, number>>;

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Performance<span className="page-title-dot">.</span>
        </h1>
        {TOP_BAR_ENABLED && (
          <PageControls
            userId={profile.id}
            // Founder/admin: the global domain selector seeds the roster filter
            // (ManagerPerformancePanel reads serene-domain on mount).
            isPrivileged
            notificationsPromise={getNotifications(profile.id)}
          />
        )}
      </div>

      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <PerformanceFilters showSearch />
      </div>

      <FounderPerformanceShell
        domain={DEFAULT_GIA_DOMAIN}
        period={period}
        customFrom={customFrom ?? undefined}
        customTo={customTo ?? undefined}
        initialDomainHealth={initialDomainHealth}
        initialTargets={domainTargets}
        monthDeals={monthDeals}
        canEditTargets={true}
        agentsSlot={
          <Suspense fallback={<ManagerPerformanceSkeleton />}>
            <ManagerPerformanceAsync
              domain={DEFAULT_GIA_DOMAIN}
              period={period}
              customFrom={customFrom ?? undefined}
              customTo={customTo ?? undefined}
              allDomains={true}
            />
          </Suspense>
        }
      />
    </main>
  );
}
