// Skeleton — settings page.
// Composes the shared scaffold (PageSkeletons): header + filter strip + agent card list.
// Each agent card mirrors the AgentSettingsTable row: avatar + name/domain |
// shift pickers | active-hours label | work-day pills | toggle.

import {
  PageHeaderSkeleton,
  FilterBarSkeleton,
  SkeletonCard,
  Shimmer,
  skeletonStagger,
} from '@/components/ui/PageSkeletons';

export default function SettingsLoading() {
  return (
    <main className="flex-1 p-8">
      <PageHeaderSkeleton titleWidth={100} />

      {/* Filter bar — matches AgentSettingsTable filter strip */}
      <FilterBarSkeleton icon searchWidth="flex" chips={[80]} countWidth={56} wrap />

      {/* Agent card list — 5 cards matching motion.div card shape */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard key={i}>
              {/* Avatar + name/domain */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: '1 1 200px', minWidth: 0 }}>
                <Shimmer w={36} h={36} r="var(--radius-md)" delay={delay} style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
                  <Shimmer w={120} h={13} r="var(--radius-xs)" delay={delay} />
                  <Shimmer w={72} h={10} r="var(--radius-xs)" delay={delay} />
                </div>
              </div>

              {/* Shift Start / End time pickers */}
              <Shimmer w={110} h={34} delay={delay} style={{ flexShrink: 0 }} />
              <Shimmer w={110} h={34} delay={delay} style={{ flexShrink: 0 }} />

              {/* Active hours label */}
              <Shimmer w={48} h={13} r="var(--radius-xs)" delay={delay} style={{ flexShrink: 0 }} />

              {/* Work-day pills (7 × 26px squares) */}
              <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
                {Array.from({ length: 7 }).map((_, d) => (
                  <Shimmer key={d} w={26} h={26} r="var(--radius-xs)" delay={delay} />
                ))}
              </div>

              {/* In-Pool toggle */}
              <Shimmer w={40} h={22} r="var(--radius-full)" delay={delay} style={{ flexShrink: 0 }} />
            </SkeletonCard>
          );
        })}
      </div>
    </main>
  );
}
