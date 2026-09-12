// Skeleton — /vendors chrome: header + filter strip + table.

import { PageHeaderSkeleton, FilterBarSkeleton } from '@/components/ui/PageSkeletons';
import { VendorsTableSkeleton } from '@/components/vendors/VendorsTableSkeleton';

export default function VendorsLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={96} actionWidth={128} />
      <FilterBarSkeleton chips={[96]} />
      <VendorsTableSkeleton />
    </main>
  );
}
