import { Suspense }              from 'react';
import { redirect }              from 'next/navigation';
import { getCurrentProfile }     from '@/lib/services/profiles-service';
import { PerformanceAsync }      from './PerformanceAsync';
import { PerformanceSkeleton }   from './PerformanceSkeleton';
import { PerformancePeriodSelector } from '@/components/performance/PerformancePeriodSelector';
import type { PerformancePeriod } from '@/lib/services/performance-service';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const VALID_PERIODS: PerformancePeriod[] = [
  'this_week', 'this_month', 'last_month', 'all_time',
];

const PERIOD_LABELS: Record<PerformancePeriod, string> = {
  this_week:  'This Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  all_time:   'All Time',
};

function parsePeriod(raw: string | undefined): PerformancePeriod {
  if (raw && (VALID_PERIODS as string[]).includes(raw)) {
    return raw as PerformancePeriod;
  }
  return 'this_month';
}

// ─────────────────────────────────────────────
// Motivational footer — server component, Lia's voice
// ─────────────────────────────────────────────

function PerformanceMotivationalFooter({
  leadsWon,
  inDiscussionCount,
  period,
}: {
  leadsWon:          number;
  inDiscussionCount: number;
  period:            PerformancePeriod;
}) {
  let message: string;
  const periodLabel = PERIOD_LABELS[period].toLowerCase();

  if (leadsWon > 0) {
    message = `You've closed ${leadsWon} lead${leadsWon === 1 ? '' : 's'} ${
      period === 'all_time' ? 'in total' : `this ${periodLabel}`
    }.`;
  } else if (inDiscussionCount > 0) {
    message = `${inDiscussionCount} lead${inDiscussionCount === 1 ? '' : 's'} in discussion — almost there.`;
  } else {
    message = 'Every expert was once a beginner.';
  }

  return (
    <div
      style={{
        paddingTop:    "var(--space-8)",
        paddingBottom: "var(--space-4)",
        textAlign:     "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle:  "italic",
          fontSize:   "var(--text-lg)",
          fontWeight: "var(--weight-light)",
          color:      "var(--theme-text-secondary)",
          margin:     0,
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
  if (!profile) redirect('/login');

  // Access gate: performance self-view is agent-only in Phase 1
  if (profile.role !== 'agent') redirect('/dashboard');

  const params = await searchParams;
  const rawPeriod = typeof params.period === 'string' ? params.period : undefined;
  const period    = parsePeriod(rawPeriod);

  // Pre-fetch effort metrics for the motivational footer.
  // These are already loaded inside PerformanceAsync — we use a lightweight
  // import just for the footer sentence (leadsWon + inDiscussionCount).
  // We avoid an extra DB call by importing from the service directly.
  // Note: the footer renders server-side with the current period's data.
  const { getCoreFourMetrics, getEffortMetrics } = await import(
    '@/lib/services/performance-service'
  );
  const [coreForFooter, effortForFooter] = await Promise.all([
    getCoreFourMetrics(profile.id, period),
    getEffortMetrics(profile.id, period),
  ]);

  return (
    <main style={{ flex: 1, padding: 'var(--space-8)', maxWidth: '960px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <p
          style={{
            fontFamily:    "var(--font-sans)",
            fontSize:      "var(--text-2xs)",
            fontWeight:    "var(--weight-medium)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color:         "var(--theme-text-tertiary)",
            margin:        0,
            marginBottom:  "var(--space-1)",
          }}
        >
          {PERIOD_LABELS[period]}
        </p>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize:   "var(--text-2xl)",
            fontWeight: "var(--weight-light)",
            color:      "var(--theme-text-primary)",
            margin:     0,
          }}
        >
          Your Performance
        </h1>
      </div>

      {/* Period selector */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <PerformancePeriodSelector current={period} />
      </div>

      {/* Main data — Suspense boundary shows skeleton while loading */}
      <Suspense fallback={<PerformanceSkeleton />}>
        <PerformanceAsync period={period} agentId={profile.id} domain={profile.domain} />
      </Suspense>

      {/* Motivational footer — Lia's quiet voice */}
      <PerformanceMotivationalFooter
        leadsWon={coreForFooter.leadsWon}
        inDiscussionCount={effortForFooter.inDiscussionCount}
        period={period}
      />
    </main>
  );
}
