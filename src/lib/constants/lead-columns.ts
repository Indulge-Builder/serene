// Column registry — single source of truth for every toggleable column in the leads table.
// IDs are stable keys used in localStorage. NEVER rename an id once shipped.
// Columns derived from the leads table shape in database.ts.

export type LeadColumnId =
  | 'status'
  | 'name'
  | 'phone'
  | 'email'
  | 'campaign'
  | 'source'
  | 'medium'
  | 'assigned_to'
  | 'created_at'
  | 'last_call_outcome'
  | 'call_count'
  | 'domain';

export type LeadColumnDef = {
  id: LeadColumnId;
  label: string;
  defaultVisible: boolean;
  locked: boolean; // true = always visible, cannot be toggled off or reordered
};

export const LEAD_COLUMNS: LeadColumnDef[] = [
  { id: 'status',            label: 'Status',        defaultVisible: true,  locked: true  },
  { id: 'name',              label: 'Name',           defaultVisible: true,  locked: true  },
  { id: 'phone',             label: 'Phone',          defaultVisible: true,  locked: false },
  { id: 'email',             label: 'Email',          defaultVisible: false, locked: false },
  { id: 'campaign',          label: 'Campaign',       defaultVisible: true,  locked: false },
  { id: 'source',            label: 'Source',         defaultVisible: false, locked: false },
  { id: 'medium',            label: 'Medium',         defaultVisible: false, locked: false },
  { id: 'assigned_to',       label: 'Assigned To',    defaultVisible: false, locked: false },
  { id: 'created_at',        label: 'Created',        defaultVisible: true,  locked: false },
  { id: 'last_call_outcome', label: 'Last Outcome',   defaultVisible: true,  locked: false },
  { id: 'call_count',        label: 'Calls',          defaultVisible: false, locked: false },
  { id: 'domain',            label: 'Domain',         defaultVisible: false, locked: false },
];

// Stable ordered list of all column ids (default order)
export const DEFAULT_COLUMN_ORDER: LeadColumnId[] = LEAD_COLUMNS.map((c) => c.id);

// Map for O(1) lookup
export const LEAD_COLUMN_MAP: Record<LeadColumnId, LeadColumnDef> = Object.fromEntries(
  LEAD_COLUMNS.map((c) => [c.id, c]),
) as Record<LeadColumnId, LeadColumnDef>;

// Guard: validate a stored column id against the registry
export function isValidLeadColumnId(id: string): id is LeadColumnId {
  return id in LEAD_COLUMN_MAP;
}
