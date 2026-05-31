export const DEAL_TYPES = ['membership', 'retail'] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  membership: 'Membership',
  retail:     'Retail',
};

export const DEAL_DURATIONS = ['3_months', '6_months', '1_year'] as const;
export type DealDuration = (typeof DEAL_DURATIONS)[number];

export const DEAL_DURATION_LABELS: Record<DealDuration, string> = {
  '3_months': '3 Months',
  '6_months': '6 Months',
  '1_year':   '1 Year',
};
