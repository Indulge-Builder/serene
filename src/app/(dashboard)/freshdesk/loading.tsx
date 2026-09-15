// Skeleton — /freshdesk chrome: header + filter strip + table.

import { PageHeaderSkeleton, FilterBarSkeleton } from '@/components/ui/PageSkeletons';
import { FreshdeskTableSkeleton } from '@/components/freshdesk/FreshdeskTableSkeleton';

export default function FreshdeskLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={120} actionWidth={110} />
      <FilterBarSkeleton chips={[80, 96, 72, 88, 72]} />
      <FreshdeskTableSkeleton />
    </main>
  );
}
