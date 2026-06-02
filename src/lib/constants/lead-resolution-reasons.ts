export const JUNK_REASONS = [
  { id: 'rnr',          label: 'RNR'           },
  { id: 'switched_off', label: 'Switched off'  },
  { id: 'not_our_tg',   label: 'Not our TG'   },
  { id: 'other',        label: 'Other'         },
] as const;

export const LOST_REASONS = [
  { id: 'chose_competitor', label: 'Chose a competitor' },
  { id: 'budget',           label: 'Budget'             },
  { id: 'unresponsive',     label: 'Unresponsive'       },
  { id: 'wrong_service',    label: 'Wrong service'      },
  { id: 'not_ready',        label: 'Not ready'          },
  { id: 'other',            label: 'Other'              },
] as const;

export const RESOLUTION_REASON_LABELS: Record<string, string> = Object.fromEntries(
  [...JUNK_REASONS, ...LOST_REASONS].map(({ id, label }) => [id, label]),
);
