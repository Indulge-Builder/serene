import { PageHeaderSkeleton, SkeletonCard, Shimmer, skeletonStagger } from "@/components/ui/PageSkeletons";

/** Body-only skeleton — shared by loading.tsx and the page's Suspense fallback. */
export function EscalationsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i}>
            <Shimmer w="40%" h="10px" delay={skeletonStagger(i)} />
            <div style={{ height: "var(--space-3)" }} />
            <Shimmer w="56px" h="24px" delay={skeletonStagger(i)} />
          </SkeletonCard>
        ))}
      </div>

      {/* Section cards */}
      {[3, 4, 5].map((i) => (
        <SkeletonCard key={i}>
          <Shimmer w="160px" h="10px" delay={skeletonStagger(i)} />
          <div style={{ height: "var(--space-4)" }} />
          {[0, 1, 2].map((r) => (
            <div key={r} style={{ display: "flex", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
              <Shimmer w="28%" h="14px" delay={skeletonStagger(i)} />
              <Shimmer w="14%" h="14px" delay={skeletonStagger(i)} />
              <Shimmer w="20%" h="14px" delay={skeletonStagger(i)} />
              <Shimmer w="14%" h="14px" delay={skeletonStagger(i)} />
            </div>
          ))}
        </SkeletonCard>
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton />
      <EscalationsSkeleton />
    </main>
  );
}
