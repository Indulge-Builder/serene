// Skeleton — /oversight (Tier 1, the team grid). Header + the shared oversight
// card grid; the same OversightSkeleton the page's Suspense fallback uses, so
// the click-to-skeleton and the skeleton-to-content hand-offs look identical.
import { PageHeaderSkeleton } from '@/components/ui/PageSkeletons';
import { OversightSkeleton } from './OversightSkeleton';

export default function OversightLoading() {
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={130} />
      <OversightSkeleton />
    </main>
  );
}
