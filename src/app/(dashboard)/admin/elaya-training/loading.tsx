// Skeleton — admin/elaya-training page.
// Mirrors ElayaTrainingManager: canonical page header (h1 + Add Asset CTA), the
// pinned company-facts card, the paper filter bar (sliders + search + count), then
// a vertical list of asset row cards (48×48 tile · title/subtitle · Edit/Delete).

import {
  PageHeaderSkeleton,
  FilterBarSkeleton,
  SkeletonCard,
  Shimmer,
  skeletonStagger,
} from "@/components/ui/PageSkeletons";

export default function ElayaTrainingLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Row 1 — page header: title left, Add Asset CTA right */}
      <PageHeaderSkeleton titleWidth={200} actionWidth={130} />

      {/* Pinned company-facts card */}
      <div className="mb-4">
        <SkeletonCard style={{ flexWrap: "nowrap" }}>
          <Shimmer w={48} h={48} r="var(--radius-md)" delay={0} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <Shimmer w={160} h={13} r="var(--radius-xs)" delay={0} />
            <Shimmer w={260} h={11} r="var(--radius-xs)" delay={0} />
          </div>
          <Shimmer w={60} h={26} r="var(--radius-sm)" delay={0} style={{ flexShrink: 0 }} />
        </SkeletonCard>
      </div>

      {/* Row 2 — paper filter bar */}
      <FilterBarSkeleton icon searchWidth="flex" countWidth={64} />

      {/* Row 3 — asset row cards */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard key={i} style={{ flexWrap: "nowrap" }}>
              <Shimmer w={48} h={48} r="var(--radius-sm)" delay={delay} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <Shimmer w={190} h={13} r="var(--radius-xs)" delay={delay} />
                <Shimmer w={130} h={11} r="var(--radius-xs)" delay={delay} />
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                <Shimmer w={60} h={26} r="var(--radius-sm)" delay={delay} />
                <Shimmer w={72} h={26} r="var(--radius-sm)" delay={delay} />
              </div>
            </SkeletonCard>
          );
        })}
      </div>
    </main>
  );
}
