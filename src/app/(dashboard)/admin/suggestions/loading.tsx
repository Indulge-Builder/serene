// loading.tsx — /admin/suggestions. Page header + status tabs + a few report-card
// placeholders while getCurrentProfile() + getSuggestionsForInbox() resolve
// server-side. Composes the shared PageSkeletons scaffold (never hand-roll chrome).

import { PageHeaderSkeleton, SkeletonCard, Shimmer } from "@/components/ui/PageSkeletons";

export default function AdminSuggestionsLoading() {
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={180} />

      {/* Status tabs placeholder. */}
      <div className="mt-4">
        <Shimmer w={240} h={36} r="var(--radius-xl)" />
      </div>

      {/* Report-card placeholders. */}
      <div className="mt-4 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} style={{ display: "block", padding: 0 }}>
            <Shimmer w="100%" h={120} r="var(--radius-lg)" delay={i * 80} />
          </SkeletonCard>
        ))}
      </div>
    </main>
  );
}
