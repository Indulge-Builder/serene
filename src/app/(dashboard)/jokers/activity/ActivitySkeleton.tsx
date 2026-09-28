import { FilterBarSkeleton, Shimmer, SkeletonCard } from "@/components/ui/PageSkeletons";

/** The Activity page while its one read runs: the filter strip, then the widget grid's shape. */
export function ActivitySkeleton() {
  return (
    <>
      <FilterBarSkeleton icon searchWidth={0} chips={[104, 88, 124, 128]} countWidth={150} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {[6, 6, 6, 6, 6, 6].map((span, i) => (
          <SkeletonCard key={i} className={span === 6 ? "lg:col-span-6" : "lg:col-span-12"} style={{ display: "block", minHeight: 300 }}>
            <Shimmer w={180} h={16} delay={i * 40} />
            <Shimmer h={220} delay={i * 40} style={{ marginTop: "var(--space-4)" }} />
          </SkeletonCard>
        ))}
      </div>
    </>
  );
}
