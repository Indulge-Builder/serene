import { SkeletonCard, Shimmer, skeletonStagger } from "@/components/ui/PageSkeletons";

// Shared loading scaffold for the oversight tiers — composes the canonical
// PageSkeletons blocks (R-01), never a bespoke shimmer. A responsive card grid
// matching the TeamOverviewGrid / agent-breakdown card layout.
export function OversightSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} style={{ animationDelay: `${skeletonStagger(i)}ms` }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <Shimmer w="55%" h={18} r="var(--radius-sm)" />
            <Shimmer w="35%" h={12} r="var(--radius-sm)" />
            <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-2)" }}>
              <Shimmer w={48} h={40} r="var(--radius-sm)" />
              <Shimmer w={48} h={40} r="var(--radius-sm)" />
              <Shimmer w={48} h={40} r="var(--radius-sm)" />
            </div>
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}
