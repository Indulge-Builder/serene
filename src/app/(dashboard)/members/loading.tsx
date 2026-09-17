// Skeleton — /members chrome: header + filter strip + table.
import { PageHeaderSkeleton, FilterBarSkeleton } from '@/components/ui/PageSkeletons';
import { MembersTableSkeleton } from '@/components/members/MembersTableSkeleton';

export default function MembersLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={110} actionWidth={120} />
      <FilterBarSkeleton chips={[96, 64, 72, 72, 88]} />
      <MembersTableSkeleton />
    </main>
  );
}
