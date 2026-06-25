// Skeleton — Lead Revival settings sub-page.
// Detail-page header (back button + title) + the per-status policy rows.

import { Shimmer, SkeletonCard, skeletonStagger } from "@/components/ui/PageSkeletons";

export default function LeadRevivalLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Detail header — back button + title */}
      <div className="flex items-center gap-4 mb-8">
        <Shimmer w={36} h={36} r="var(--radius-full)" />
        <Shimmer w={180} h={28} r="var(--radius-xs)" />
      </div>

      {/* One row per silenceable status (touched / in_discussion / nurturing) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {Array.from({ length: 3 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard key={i}>
              <Shimmer w={160} h={13} r="var(--radius-xs)" delay={delay} style={{ flex: 1 }} />
              <Shimmer w={140} h={34} delay={delay} style={{ flexShrink: 0 }} />
              <Shimmer w={140} h={34} delay={delay} style={{ flexShrink: 0 }} />
              <Shimmer w={40} h={22} r="var(--radius-full)" delay={delay} style={{ flexShrink: 0 }} />
            </SkeletonCard>
          );
        })}
      </div>
    </main>
  );
}
