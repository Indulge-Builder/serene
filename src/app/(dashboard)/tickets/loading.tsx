import { PageHeaderSkeleton, FilterBarSkeleton } from '@/components/ui/PageSkeletons';
import { TicketsTableSkeleton } from '@/components/tickets/TicketsTableSkeleton';
export default function TicketsLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={110} actionWidth={120} />
      <FilterBarSkeleton chips={[80, 96, 72, 88]} />
      <TicketsTableSkeleton />
    </main>
  );
}
