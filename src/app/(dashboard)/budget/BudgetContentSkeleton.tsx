import { SkeletonCard, Shimmer, skeletonStagger } from "@/components/ui/PageSkeletons";

/** Content-area fallback: totals strip + table rows. */
export function BudgetContentSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <SkeletonCard style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap" }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: 1, minWidth: "120px", alignItems: "center" }}>
            <Shimmer w={64} h={24} delay={skeletonStagger(i)} />
            <Shimmer w={80} h={10} delay={skeletonStagger(i)} />
          </div>
        ))}
      </SkeletonCard>
      <SkeletonCard style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "flex", gap: "var(--space-6)", alignItems: "center" }}>
            <Shimmer w="30%" h={14} delay={skeletonStagger(i)} />
            <Shimmer w="60%" h={14} delay={skeletonStagger(i)} />
          </div>
        ))}
      </SkeletonCard>
    </div>
  );
}
