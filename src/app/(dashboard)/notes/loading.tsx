// Skeleton — /notes page.
// Mirrors NotesManager: canonical page header (h1 + New Note CTA), the paper filter bar
// (sliders + search + count), then a vertical list of note cards (title + 2-line body
// preview · Edit/Delete).

import {
  PageHeaderSkeleton,
  FilterBarSkeleton,
  SkeletonCard,
  Shimmer,
  skeletonStagger,
} from "@/components/ui/PageSkeletons";

export default function NotesLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Row 1 — page header: title left, New Note CTA right */}
      <PageHeaderSkeleton titleWidth={160} actionWidth={120} />

      {/* Row 2 — paper filter bar */}
      <FilterBarSkeleton icon searchWidth="flex" countWidth={56} />

      {/* Row 3 — note cards */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard key={i} style={{ flexWrap: "nowrap" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <Shimmer w={180} h={14} r="var(--radius-xs)" delay={delay} />
                <Shimmer w="80%" h={11} r="var(--radius-xs)" delay={delay} />
                <Shimmer w="60%" h={11} r="var(--radius-xs)" delay={delay} />
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
