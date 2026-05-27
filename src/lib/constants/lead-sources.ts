export const LEAD_SOURCES = ['meta', 'google', 'website'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  meta:    'Meta',
  google:  'Google',
  website: 'Website',
};
