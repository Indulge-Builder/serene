// Column map for the lead export workbook.
// Lead sheet columns in declaration order.
// Never use raw ISO strings — all dates formatted via formatDate().

export type ExportHeader = {
  key:   string;
  label: string;
};

export const LEAD_EXPORT_HEADERS: ExportHeader[] = [
  { key: 'id',               label: 'ID'               },
  { key: 'full_name',        label: 'Full Name'         },
  { key: 'phone',            label: 'Phone'             },
  { key: 'email',            label: 'Email'             },
  { key: 'domain',           label: 'Domain'            },
  { key: 'status',           label: 'Status'            },
  { key: 'lead_intent',      label: 'Intent'            },
  { key: 'source',           label: 'Source'            },
  { key: 'utm_campaign',     label: 'Campaign'          },
  { key: 'assigned_to_name', label: 'Assigned To'       },
  { key: 'call_count',       label: 'Call Count'        },
  { key: 'last_call_outcome',label: 'Last Outcome'      },
  { key: 'deal_amount',      label: 'Deal Amount'       },
  { key: 'deal_type',        label: 'Deal Type'         },
  { key: 'deal_duration',    label: 'Deal Duration'     },
  { key: 'city',             label: 'City'              },
  { key: 'company',          label: 'Company'           },
  { key: 'created_at',       label: 'Created At'        },
  { key: 'status_changed_at',label: 'Status Changed At' },
];

export const ACTIVITY_EXPORT_HEADERS: ExportHeader[] = [
  { key: 'lead_id',     label: 'Lead ID'     },
  { key: 'action_type', label: 'Action'      },
  { key: 'actor_name',  label: 'Actor'       },
  { key: 'details',     label: 'Details'     },
  { key: 'created_at',  label: 'Created At'  },
];

export const NOTE_EXPORT_HEADERS: ExportHeader[] = [
  { key: 'lead_id',      label: 'Lead ID'      },
  { key: 'content',      label: 'Content'      },
  { key: 'call_outcome', label: 'Call Outcome' },
  { key: 'author_name',  label: 'Author'       },
  { key: 'created_at',   label: 'Created At'   },
];
