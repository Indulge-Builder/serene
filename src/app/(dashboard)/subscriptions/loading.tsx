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
        {/* Table rows on md+, card-shaped shimmers below (the phone renders cards). */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="hidden md:flex"
            style={{
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
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={`card-${i}`}
            className="md:hidden"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              padding: "var(--space-3) 0",
              borderBottom: i < 4 ? "1px solid var(--theme-paper-border)" : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
              <Shimmer w={150} h={16} delay={skeletonStagger(i)} />
              <Shimmer w={32} h={32} r="var(--radius-full)" delay={skeletonStagger(i)} />
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Shimmer w={72} h={20} r="var(--radius-full)" delay={skeletonStagger(i)} />
              <Shimmer w={60} h={20} r="var(--radius-full)" delay={skeletonStagger(i)} />
              <Shimmer w={80} h={16} delay={skeletonStagger(i)} />
            </div>
            <Shimmer w={110} h={16} delay={skeletonStagger(i)} />
          </div>
        ))}
      </div>
    </main>
  );
}
