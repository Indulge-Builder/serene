// Skeleton — /oversight/[domain] (Tier 2, one team). Back link + domain title,
// then the shared oversight card grid. Its own file (not the parent's) so a
// Tier 1 → Tier 2 navigation shows a skeleton too: Next only re-shows the
// nearest loading boundary ABOVE the segment that changed.
import { PageHeaderSkeleton } from '@/components/ui/PageSkeletons';
import { OversightSkeleton } from '../OversightSkeleton';

export default function OversightDomainLoading() {
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={220} />
      <OversightSkeleton />
    </main>
  );
}
