import type { LeadStatus } from "@/lib/types/database";

export const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'touched',
  'in_discussion',
  'won',
  'nurturing',
  'lost',
  'junk',
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new:           'New',
  touched:       'Touched',
  in_discussion: 'In Discussion',
  won:           'Won',
  nurturing:     'Nurturing',
  lost:          'Lost',
  junk:          'Junk',
};

// Badge variant for each status — maps to design system badge variants
export const LEAD_STATUS_BADGE: Record<LeadStatus, 'neutral' | 'info' | 'warning' | 'success' | 'accent' | 'danger'> = {
  new:           'neutral',
  touched:       'info',
  in_discussion: 'warning',
  won:           'success',
  nurturing:     'accent',
  lost:          'danger',
  junk:          'neutral',
};

export const JOURNEY_STATUSES: LeadStatus[] = ['new', 'touched', 'in_discussion', 'won'];
export const RESOLUTION_STATUSES: LeadStatus[] = ['nurturing', 'lost', 'junk'];
