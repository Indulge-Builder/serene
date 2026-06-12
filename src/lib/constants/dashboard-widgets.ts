// Widget registry — pure data. No component references here.
// IDs are stable localStorage keys — never rename after shipping.

import type { UserRole, AppDomain } from '@/lib/types/database';

export type WidgetSize = 'sm' | 'md' | 'lg' | 'xl';

// Single source of truth for widget container heights.
// Widgets read their container height from this map via the `size` prop.
// WidgetSkeleton uses the same values for skeleton sizing.
export const WIDGET_HEIGHT_BY_SIZE: Record<WidgetSize, string> = {
  sm:  '200px',
  md:  '300px',
  lg:  '420px',
  xl:  '540px',
};

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  sm: 'Compact',
  md: 'Standard',
  lg: 'Tall',
  xl: 'Full',
};
export type WidgetColSpan = 1 | 2;

export type WidgetModule = 'gia' | 'finance' | 'ops' | 'marketing' | 'tech';

export type WidgetDefinition = {
  id:           string;
  label:        string;
  description:  string;
  roles:        UserRole[];
  domains:      AppDomain[] | '*';
  defaultSize:  WidgetSize;
  colSpan:      WidgetColSpan;
  module:       WidgetModule;
};

export const DASHBOARD_WIDGETS: WidgetDefinition[] = [
  {
    id:          'agent-tasks',
    label:       'My Tasks',
    description: 'Open tasks, follow-ups, and new leads assigned to you.',
    roles:       ['agent', 'manager', 'admin', 'founder'],
    domains:     '*',
    defaultSize: 'md',
    colSpan:     1,
    module:      'gia',
  },
  {
    id:          'agent-activity',
    label:       'Recent Activity',
    description: 'A live feed of lead activity — calls, notes, status moves.',
    roles:       ['agent', 'manager', 'admin', 'founder'],
    domains:     '*',
    defaultSize: 'lg',
    colSpan:     1,
    module:      'gia',
  },
  {
    id:          'agent-pending-calls',
    label:       'Pending Calls',
    description: 'Open Gia follow-up calls on your plate. Live count — the date filter never applies.',
    roles:       ['agent'],
    domains:     '*',
    defaultSize: 'sm',
    colSpan:     1,
    module:      'gia',
  },
  {
    id:          'agent-new-leads',
    label:       'New Leads',
    description: 'Your leads still at New, waiting for a first call. Live count — the date filter never applies.',
    roles:       ['agent'],
    domains:     '*',
    defaultSize: 'sm',
    colSpan:     1,
    module:      'gia',
  },
  {
    id:          'elaya-presence',
    label:       'Elaya',
    description: 'Elaya’s seat on your dashboard — greeting now, the full Elaya layer arrives here.',
    roles:       ['agent'],
    domains:     '*',
    defaultSize: 'md',
    colSpan:     1,
    module:      'gia',
  },
  {
    id:          'manager-lead-status',
    label:       'Lead Pipeline',
    description: 'Lead counts by status across your domain, broken down by agent.',
    roles:       ['manager', 'admin', 'founder'],
    domains:     '*',
    defaultSize: 'lg',
    colSpan:     1,
    module:      'gia',
  },
  {
    id:          'manager-lead-volume',
    label:       'Lead Volume',
    description: 'Incoming leads over time — today, this week, this month, or this quarter.',
    roles:       ['manager', 'admin', 'founder'],
    domains:     '*',
    defaultSize: 'lg',
    colSpan:     1,
    module:      'gia',
  },
  {
    id:          'manager-campaigns',
    label:       'Campaign Performance',
    description: 'Leads per campaign, broken down by status mix.',
    roles:       ['manager', 'admin', 'founder'],
    domains:     '*',
    defaultSize: 'xl',
    colSpan:     2,
    module:      'gia',
  },
  {
    id:          'manager-cold-leads',
    label:       'Going Cold',
    description: 'Leads with no activity in the last 5 days.',
    roles:       ['manager', 'admin', 'founder'],
    domains:     '*',
    defaultSize: 'sm',
    colSpan:     1,
    module:      'gia',
  },
  {
    id:          'manager-budget',
    label:       'Campaign Budget',
    description: 'Ad spend joined to lead and deal outcomes for the period.',
    roles:       ['manager', 'admin', 'founder'],
    domains:     '*',
    defaultSize: 'sm',
    colSpan:     1,
    module:      'gia',
  },
];

export const WIDGET_MAP: Record<string, WidgetDefinition> = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => [w.id, w]),
);

export function isValidWidgetId(id: string): id is string {
  return id in WIDGET_MAP;
}

// Default layout per role — ordered list of widget ids.
// Manager mirrors the founder layout (+ the budget widget, domain-pinned
// server-side). Agent first screen: tasks left / Elaya right, the two live
// snapshot counts, then the tall activity feed.
export const DEFAULT_LAYOUT_BY_ROLE: Record<UserRole, string[]> = {
  founder: [
    'agent-tasks',
    'agent-activity',
    'manager-lead-status',
    'manager-lead-volume',
    'manager-campaigns',
    'manager-cold-leads',
    'manager-budget',
  ],
  admin: [
    'agent-tasks',
    'agent-activity',
    'manager-lead-status',
    'manager-lead-volume',
    'manager-campaigns',
    'manager-cold-leads',
    'manager-budget',
  ],
  manager: [
    'agent-tasks',
    'agent-activity',
    'manager-lead-status',
    'manager-lead-volume',
    'manager-campaigns',
    'manager-cold-leads',
    'manager-budget',
  ],
  agent: [
    'agent-tasks',
    'elaya-presence',
    'agent-pending-calls',
    'agent-new-leads',
    'agent-activity',
  ],
  guest: [],
};
