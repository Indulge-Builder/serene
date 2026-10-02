// Skeleton — /settings/elaya-chats. The page's own split pieces (ui/SplitWorkspace, the Sia and
// WhatsApp layout): back link + title, the description line, then the people rail beside the
// "select a person" pane (md+ only, as on the page).
import { Shimmer, RailRowsSkeleton, EmptyStateSkeleton } from '@/components/ui/PageSkeletons';
import { SplitWorkspace, SplitRail, SplitRailHeader, SplitRailList, SplitPane } from '@/components/ui/SplitWorkspace';

export default function ElayaChatsLoading() {
  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-3 shrink-0">
        <Shimmer w={36} h={36} r="var(--radius-full)" />
        <Shimmer w={200} h={30} r="var(--radius-sm)" />
      </div>
      <div className="shrink-0" style={{ marginBottom: 'var(--space-6)' }}>
        <Shimmer w="min(560px, 100%)" h={12} r="var(--radius-xs)" />
      </div>

      <SplitWorkspace>
        <SplitRail>
          <SplitRailHeader>
            <Shimmer w="100%" h={32} r="var(--neu-radius-control)" />
            <Shimmer w={96} h={10} r="var(--radius-xs)" />
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
