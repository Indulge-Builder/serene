export const JUNK_REASONS = [
  { id: 'wrong_number',  label: 'Wrong number'  },
  { id: 'spam_bot',      label: 'Spam / bot'    },
  { id: 'duplicate',     label: 'Duplicate'     },
  { id: 'out_of_area',   label: 'Out of area'   },
  { id: 'test_lead',     label: 'Test lead'     },
  { id: 'other',         label: 'Other'         },
] as const;

export const LOST_REASONS = [
  { id: 'chose_competitor', label: 'Chose a competitor' },
  { id: 'budget',           label: 'Budget'             },
  { id: 'unresponsive',     label: 'Unresponsive'       },
  { id: 'wrong_service',    label: 'Wrong service'      },
  { id: 'not_ready',        label: 'Not ready'          },
  { id: 'other',            label: 'Other'              },
] as const;

export const RESOLUTION_REASON_LABELS: Record<string, string> = {
  ...Object.fromEntries([...JUNK_REASONS, ...LOST_REASONS].map(({ id, label }) => [id, label])),
  other: 'Other',
};
