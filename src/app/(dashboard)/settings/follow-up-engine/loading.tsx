// Skeleton — Follow-up Engine settings sub-page.
// Detail-page header (back button + title) + a SectionCard-shaped panel block.

import { Shimmer, SkeletonCard, skeletonStagger } from "@/components/ui/PageSkeletons";

export default function FollowUpEngineLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Detail header — back button + title */}
      <div className="flex items-center gap-4 mb-8">
        <Shimmer w={36} h={36} r="var(--radius-full)" />
        <Shimmer w={220} h={28} r="var(--radius-xs)" />
      </div>

      {/* Policy panel — a few stacked rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard key={i}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: 1 }}>
                <Shimmer w={180} h={13} r="var(--radius-xs)" delay={delay} />
                <Shimmer w={120} h={10} r="var(--radius-xs)" delay={delay} />
              </div>
              <Shimmer w={90} h={34} delay={delay} style={{ flexShrink: 0 }} />
              <Shimmer w={40} h={22} r="var(--radius-full)" delay={delay} style={{ flexShrink: 0 }} />
            </SkeletonCard>
          );
        })}
      </div>
    </main>
  );
}
