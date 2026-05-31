import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { DEFAULT_GIA_DOMAIN } from "@/lib/constants/domains";
import type { PerformancePeriod } from "@/lib/services/performance-service";
import { PerformanceAsync } from "./PerformanceAsync";
import { PerformanceSkeleton } from "./PerformanceSkeleton";
import { ManagerPerformanceSkeleton } from "./ManagerPerformanceSkeleton";
import { ManagerPerformanceAsync } from "./ManagerPerformanceAsync";
import { FounderPerformanceShell } from "./FounderPerformanceShell";
import { PerformanceFilters } from "@/components/performance/PerformanceFilters";
// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const VALID_PERIODS: PerformancePeriod[] = [
  "this_week",
  "this_month",
  "last_month",
  "all_time",
  "custom",
];

const PERIOD_LABELS: Record<PerformancePeriod, string> = {
  this_week: "This Week",
  this_month: "This Month",
  last_month: "Last Month",
  all_time: "All Time",
  custom: "Custom",
};

function parsePeriod(raw: string | undefined): PerformancePeriod {
  if (raw && (VALID_PERIODS as string[]).includes(raw)) {
    return raw as PerformancePeriod;
  }
  return "this_month";
}

// ─────────────────────────────────────────────
// Motivational footer — server component, Lia's voice (agent view only)
// ─────────────────────────────────────────────

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
  const periodLabel = PERIOD_LABELS[period].toLowerCase();

  if (leadsWon > 0) {
    message = `You've closed ${leadsWon} lead${leadsWon === 1 ? "" : "s"} ${
      period === "all_time" ? "in total" : `this ${periodLabel}`
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
  const rawPeriod =
    typeof params.period === "string" ? params.period : undefined;
  const period = parsePeriod(rawPeriod);

  // Custom date params — only meaningful when period === 'custom'
  const rawFrom = typeof params.from === "string" ? params.from : undefined;
  const rawTo = typeof params.to === "string" ? params.to : undefined;

  // ── Agent view ──────────────────────────────────────────────────────────
  if (profile.role === "agent") {
    const { getCoreFourMetrics, getEffortMetrics } =
      await import("@/lib/services/performance-service");
    const [coreForFooter, effortForFooter] = await Promise.all([
      getCoreFourMetrics(profile.id, period),
      getEffortMetrics(profile.id, period),
    ]);

    return (
      <main style={{ flex: 1, padding: "var(--space-8)", maxWidth: "1280px", minWidth: 0 }}>
        <div style={{ marginBottom: "var(--space-6)" }}>
          <h1 className="type-page-title" style={{ margin: 0 }}>
            Your Performance<span className="page-title-dot">.</span>
          </h1>
        </div>
        <div className="px-5 py-4 mb-6 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
          <PerformanceFilters
            period={period}
            customFrom={rawFrom ?? null}
            customTo={rawTo ?? null}
            showSearch={false}
          />
        </div>
        <Suspense fallback={<PerformanceSkeleton />}>
          <PerformanceAsync
            period={period}
            agentId={profile.id}
            domain={profile.domain}
          />
        </Suspense>
        <PerformanceMotivationalFooter
          leadsWon={coreForFooter.leadsWon}
          inDiscussionCount={effortForFooter.inDiscussionCount}
          period={period}
        />
      </main>
    );
  }

  // ── Manager view ───────────────────────────────────────────────────────
  // domain is always read from the server-verified profile — never from URL params
  if (profile.role === "manager") {
    return (
      <main style={{ flex: 1, padding: "var(--space-8)", minWidth: 0 }}>
        <div style={{ marginBottom: "var(--space-6)" }}>
          <h1 className="type-page-title" style={{ margin: 0 }}>
            Team Performance<span className="page-title-dot">.</span>
          </h1>
        </div>
        <div className="px-5 py-4 mb-6 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
          <PerformanceFilters
            period={period}
            customFrom={rawFrom ?? null}
            customTo={rawTo ?? null}
            showSearch
          />
        </div>
        <Suspense fallback={<ManagerPerformanceSkeleton />}>
          <ManagerPerformanceAsync
            domain={profile.domain}
            period={period}
            customFrom={rawFrom}
            customTo={rawTo}
          />
        </Suspense>
      </main>
    );
  }

  // ── Founder / admin view ────────────────────────────────────────────────
  // All domains in one roster; domain filtering is client-side in ManagerPerformancePanel.
  return (
    <main style={{ flex: 1, padding: "var(--space-8)", minWidth: 0 }}>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 className="type-page-title" style={{ margin: 0 }}>
          Performance<span className="page-title-dot">.</span>
        </h1>
      </div>

      <div className="px-5 py-4 mb-6 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <PerformanceFilters
          period={period}
          customFrom={rawFrom ?? null}
          customTo={rawTo ?? null}
          showSearch
        />
      </div>

      <FounderPerformanceShell
        domain={DEFAULT_GIA_DOMAIN}
        period={period}
        customFrom={rawFrom}
        customTo={rawTo}
      />
    </main>
  );
}
