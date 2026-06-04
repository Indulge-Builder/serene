'use client';

import { useEffect } from 'react';
import type { DateRange } from '@/lib/utils/date-range';

/**
 * Dashboard date-filter changes navigate with router.push → the page RSC re-fetches
 * and passes fresh initialData. Cohort widgets (pipeline, campaigns, volume) must
 * apply that payload instead of firing parallel server actions.
 */
export function useDashboardCohortSync<T>(
  rscData: T | null | undefined,
  dateRange: DateRange | undefined,
  rscMatchesView: boolean,
  apply: (data: T) => void,
): void {
  useEffect(() => {
    if (!rscMatchesView || rscData == null) return;
    apply(rscData);
  }, [
    rscData,
    rscMatchesView,
    dateRange?.from,
    dateRange?.to,
    apply,
  ]);
}
