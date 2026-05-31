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

// CSS class suffix for each lead status pill — maps to .status-pill--lead-* in design-tokens.css.
// These are FIXED, theme-invariant colours (psychological anchors).
// Never substitute generic badge variants here — the status-specific classes must be used.
export const LEAD_STATUS_BADGE: Record<LeadStatus, string> = {
  new:           'lead-new',
  touched:       'lead-touched',
  in_discussion: 'lead-in-discussion',
  won:           'lead-won',
  nurturing:     'lead-nurturing',
  lost:          'lead-lost',
  junk:          'lead-junk',
};

// Inline style tokens for contexts where CSS classes can't be used (charts, SVG fills, etc.)
export const LEAD_STATUS_COLORS: Record<LeadStatus, { text: string; light: string; border: string }> = {
  new:           { text: 'var(--status-new-text)',           light: 'var(--status-new-light)',           border: 'var(--status-new-border)'           },
  touched:       { text: 'var(--status-touched-text)',       light: 'var(--status-touched-light)',       border: 'var(--status-touched-border)'       },
  in_discussion: { text: 'var(--status-in-discussion-text)', light: 'var(--status-in-discussion-light)', border: 'var(--status-in-discussion-border)' },
  won:           { text: 'var(--status-won-text)',           light: 'var(--status-won-light)',           border: 'var(--status-won-border)'           },
  nurturing:     { text: 'var(--status-nurturing-text)',     light: 'var(--status-nurturing-light)',     border: 'var(--status-nurturing-border)'     },
  lost:          { text: 'var(--status-lost-text)',          light: 'var(--status-lost-light)',          border: 'var(--status-lost-border)'          },
  junk:          { text: 'var(--status-junk-text)',          light: 'var(--status-junk-light)',          border: 'var(--status-junk-border)'          },
};

export const JOURNEY_STATUSES: LeadStatus[] = ['new', 'touched', 'in_discussion', 'won'];
export const RESOLUTION_STATUSES: LeadStatus[] = ['nurturing', 'lost', 'junk'];
