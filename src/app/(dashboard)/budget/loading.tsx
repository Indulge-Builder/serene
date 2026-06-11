import { PageHeaderSkeleton, FilterBarSkeleton } from "@/components/ui/PageSkeletons";
import { BudgetContentSkeleton } from "./BudgetContentSkeleton";

export default function BudgetLoading() {
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={120} actionWidth={140} />
      <FilterBarSkeleton chips={[220]} />
      <BudgetContentSkeleton />
    </main>
  );
}
