import {
  PageHeaderSkeleton,
  FilterBarSkeleton,
  Shimmer,
  skeletonStagger,
} from "@/components/ui/PageSkeletons";

export default function SubscriptionsLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={180} actionWidth={150} />

      {/* One strip: the view switcher leads it, then search + filters */}
      <FilterBarSkeleton leading={228} icon searchWidth="flex" chips={[110, 80, 90]} />

      {/* Table */}
      <div
        style={{
          border: "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-1)",
          background: "var(--theme-paper)",
          padding: "var(--space-4)",
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-4)",
              padding: "var(--space-3) 0",
              borderBottom: i < 7 ? "1px solid var(--theme-paper-border)" : "none",
            }}
          >
            <Shimmer w={160} h={16} delay={skeletonStagger(i)} />
            <Shimmer w={120} h={16} delay={skeletonStagger(i)} />
            <div style={{ flex: 1 }} />
            <Shimmer w={72} h={20} r="var(--radius-full)" delay={skeletonStagger(i)} />
          </div>
        ))}
      </div>
    </main>
  );
}
