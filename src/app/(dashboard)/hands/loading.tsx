// Skeleton — /hands, the same split pieces the page renders (the /sia loading posture).
import { PageHeaderSkeleton, Shimmer, RailRowsSkeleton, EmptyStateSkeleton } from "@/components/ui/PageSkeletons";
import { SplitWorkspace, SplitRail, SplitRailHeader, SplitRailList, SplitPane } from "@/components/ui/SplitWorkspace";

export default function HandsLoading() {
  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={90} actionWidth={60} />
      <SplitWorkspace>
        <SplitRail>
          <SplitRailHeader>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {[48, 48].map((w, i) => <Shimmer key={i} w={w} h={28} r="var(--radius-full)" delay={i * 40} style={{ flexShrink: 0 }} />)}
            </div>
          </SplitRailHeader>
          <SplitRailList><RailRowsSkeleton /></SplitRailList>
        </SplitRail>
        <SplitPane className="hidden md:flex items-center justify-center"><EmptyStateSkeleton /></SplitPane>
      </SplitWorkspace>
    </main>
  );
}
