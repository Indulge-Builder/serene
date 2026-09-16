// Skeleton — /oversight/[domain]/[agentId] (Tier 3, one agent). Same shape as
// Tier 2; a separate file for the same reason (nearest-boundary rule).
import { PageHeaderSkeleton } from '@/components/ui/PageSkeletons';
import { OversightSkeleton } from '../../OversightSkeleton';

export default function OversightAgentLoading() {
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={240} />
      <OversightSkeleton />
    </main>
  );
}
