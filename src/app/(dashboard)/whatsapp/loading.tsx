// Skeleton — /whatsapp. The WhatsAppShell chrome through the SAME split pieces the
// page renders (ui/SplitWorkspace, the Sia layout): title row, then the 340px
// conversation rail (search, the Conversations label + period filter, rows) beside
// the "select a conversation" pane (md+ only, as on the page).
import { PageHeaderSkeleton, Shimmer, RailRowsSkeleton, EmptyStateSkeleton } from '@/components/ui/PageSkeletons';
import { SplitWorkspace, SplitRail, SplitRailHeader, SplitRailList, SplitPane } from '@/components/ui/SplitWorkspace';

export default function WhatsAppLoading() {
  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={150} />

      <SplitWorkspace>
        <SplitRail>
          <SplitRailHeader>
            <Shimmer w="100%" h={32} r="var(--neu-radius-control)" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Shimmer w={96} h={10} r="var(--radius-xs)" />
              <Shimmer w={84} h={28} r="var(--neu-radius-control)" />
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
