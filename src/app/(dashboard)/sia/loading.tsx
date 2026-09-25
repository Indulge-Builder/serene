// Skeleton — /sia. The SiaWorkspace chrome through the SAME split pieces the page
// renders (ui/SplitWorkspace), so the two can never drift: title row with the
// console gear, then the 340px group rail (search, kind chips, rows) beside the
// "pick a conversation" pane (md+ only, as on the page).
import { PageHeaderSkeleton, Shimmer, RailRowsSkeleton, EmptyStateSkeleton } from '@/components/ui/PageSkeletons';
import { SplitWorkspace, SplitRail, SplitRailHeader, SplitRailList, SplitPane } from '@/components/ui/SplitWorkspace';

export default function SiaLoading() {
  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={60} actionWidth={36} />

      <SplitWorkspace>
        <SplitRail>
          <SplitRailHeader>
            <Shimmer w="100%" h={32} r="var(--neu-radius-control)" />
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {[40, 72, 64, 72].map((w, i) => (
                <Shimmer key={i} w={w} h={24} r="var(--radius-full)" delay={i * 40} style={{ flexShrink: 0 }} />
              ))}
            </div>
          </SplitRailHeader>
          <SplitRailList>
            <RailRowsSkeleton />
          </SplitRailList>
        </SplitRail>

        <SplitPane className="hidden md:flex items-center justify-center">
          <EmptyStateSkeleton />
        </SplitPane>
      </SplitWorkspace>
    </main>
  );
}
