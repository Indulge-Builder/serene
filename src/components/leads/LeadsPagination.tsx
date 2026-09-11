'use client';

// LeadsPagination — the pager on the leads, deals and campaign lists.
//
// The mechanism (rewrite ONLY `page` on the URL so every other filter param
// survives, drop it on page 1, navigate in a transition) lives in
// ui/Pagination since 2026-09-11, when the vendors list needed the same
// thing. This stays as the leads-flavoured entry point so its three call
// sites did not change — a wrapper, not a fork (R-01 / R-04).

import { Pagination } from '@/components/ui/Pagination';

type LeadsPaginationProps = {
  page:       number;
  pageSize:   number;
  totalCount: number;
};

export function LeadsPagination(props: LeadsPaginationProps) {
  return <Pagination {...props} noun="lead" />;
}
