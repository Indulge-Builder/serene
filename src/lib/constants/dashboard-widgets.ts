// Widget registry — pure data. No component references here.
// IDs are stable localStorage keys — never rename after shipping.

import type { UserRole, AppDomain } from '@/lib/types/database';

export type WidgetSize = 'sm' | 'md' | 'lg' | 'xl';

// Legacy size enum → pixel height. As of the continuous-resize model (v3,
// 2026-06-24) height is a FREE pixel value stored per placement (heightPx),
// not one of four buckets. This map survives ONLY as (a) the default seed for
// a widget's initial height (via WIDGET_DEFAULT_HEIGHT) and (b) the one-time
// migration of stored v2 `size` enums → px. Widgets no longer read it — the
// slot owns height. Do not reintroduce a size→height read in a widget body.
export const WIDGET_HEIGHT_BY_SIZE: Record<WidgetSize, number> = {
  sm:  200,
  md:  300,
  lg:  420,
  xl:  540,
};

// Continuous-height clamp — a widget can be dragged anywhere in this range.
// MIN keeps a card from collapsing past its header + one row; MAX keeps a
// single card from dwarfing the dashboard. Tokens are px (drag math is px).
export const WIDGET_MIN_HEIGHT = 160;
export const WIDGET_MAX_HEIGHT = 720;

/** Default pixel height for a freshly-added widget (seeded from its size tier). */
export function widgetDefaultHeight(size: WidgetSize): number {
  return WIDGET_HEIGHT_BY_SIZE[size];
}

export function clampWidgetHeight(px: number): number {
  return Math.min(WIDGET_MAX_HEIGHT, Math.max(WIDGET_MIN_HEIGHT, Math.round(px)));
}

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  sm: 'Compact',
  md: 'Standard',
  lg: 'Tall',
  xl: 'Full',
};

export type WidgetColSpan = 1 | 2;

// ── Spatial grid (v4, 2026-06-24) ──────────────────────────────────────────
// The dashboard is now a true 2-D grid: every widget is an {x,y,w,h} rectangle
// in GRID UNITS, freely placed/resized/auto-packed (react-grid-layout owns the
// geometry). These constants are the shared vocabulary the layout hook, the
// canvas, and the density system all read.
//
// 12 columns matches the existing mental model. ROW_HEIGHT is the px height of
// ONE grid row; a widget of h:8 ≈ 8 * (ROW_HEIGHT + MARGIN) px tall. 38px rows
// give fine vertical granularity (≈ the old sm/md/lg/xl tiers land on h:5/8/11/14)
// without letting a drag feel "steppy".
export const GRID_COLS = 12;
export const GRID_ROW_HEIGHT = 38;
export const GRID_MARGIN = 16; // px gap between cells (matches --space-4)
export const GRID_MIN_H = 4;   // a widget can never be shorter than 4 rows
export const GRID_MIN_W = 3;   // …or narrower than a quarter of the grid

/** Below this px width the canvas collapses to a single stacked column (mobile). */
export const GRID_MOBILE_BREAKPOINT = 768;

/** A widget's footprint in grid units. */
export type WidgetGrid = { w: number; h: number; minW?: number; minH?: number };

// ── Density tiers (content adaptation) ──────────────────────────────────────
// A widget renders one of three content layouts based on the PIXEL size of the
// cell it currently occupies (measured live via ResizeObserver). This is what
// makes the dashboard feel premium: a chart shows a single number when tiny, a
// sparkline when short, the full chart when large — instead of one cramped
// layout scaled to fit. Thresholds are px (the observed cell box), not grid
// units, so they hold across breakpoints.
export type WidgetDensity = 'compact' | 'standard' | 'rich';

export const DENSITY_THRESHOLDS = {
  // height-driven: the dominant axis for "how much can I show"
  compactMaxHeight: 220, // ≤ this tall → compact (headline only)
  richMinHeight: 380,    // ≥ this tall → rich (full content)
  // width floor: a very narrow cell stays compact even if tall
  compactMaxWidth: 240,
} as const;

/** Resolve a density tier from a cell's measured pixel box. */
export function resolveWidgetDensity(width: number, height: number): WidgetDensity {
  if (height <= DENSITY_THRESHOLDS.compactMaxHeight || width <= DENSITY_THRESHOLDS.compactMaxWidth) {
    return 'compact';
  }
  if (height >= DENSITY_THRESHOLDS.richMinHeight) return 'rich';
  return 'standard';
}

export type WidgetModule = 'gia' | 'finance' | 'ops' | 'marketing' | 'tech';

export type WidgetDefinition = {
  id:           string;
  label:        string;
  description:  string;
  roles:        UserRole[];
  domains:      AppDomain[] | '*';
  defaultSize:  WidgetSize;
  colSpan:      WidgetColSpan;
  /** Footprint in grid units when first added (v4 spatial model). */
  defaultGrid:  WidgetGrid;
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
    defaultGrid: { w: 6, h: 9, minW: 4, minH: 6 },
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
    defaultGrid: { w: 6, h: 11, minW: 4, minH: 6 },
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
    defaultGrid: { w: 2, h: 2, minW: 2, minH: 2 },
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
    defaultGrid: { w: 2, h: 2, minW: 2, minH: 2 },
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
    defaultGrid: { w: 6, h: 11, minW: 4, minH: 8 },
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
    defaultGrid: { w: 6, h: 11, minW: 4, minH: 7 },
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
    defaultGrid: { w: 6, h: 11, minW: 4, minH: 7 },
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
    defaultGrid: { w: 12, h: 11, minW: 6, minH: 7 },
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
    defaultGrid: { w: 3, h: 5, minW: 3, minH: 4 },
    module:      'gia',
  },
  {
    id:          'manager-budget',
    label:       'Campaign Budget',
    description: 'Ad-account fuel gauge — recharged vs spent, remaining balance, and ROI for the period.',
    // Admin/founder only — mirrors the /budget page access (managers excluded).
    roles:       ['admin', 'founder'],
    domains:     '*',
    defaultSize: 'md',
    colSpan:     2,
    // The fuel gauge needs room to breathe (hero number + tank + stat trio +
    // ROI line). Half-width, 8 rows tall by default; never narrower than 4 cols
    // or the gauge stat trio cramps.
    defaultGrid: { w: 6, h: 8, minW: 4, minH: 5 },
    module:      'finance',
  },
];

export const WIDGET_MAP: Record<string, WidgetDefinition> = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => [w.id, w]),
);

export function isValidWidgetId(id: string): id is string {
  return id in WIDGET_MAP;
}

// ── Spatial default layouts (v4) ────────────────────────────────────────────
// Explicit {x,y,w,h} per role so the first paint reads as a designed bento, not
// an auto-flow. Coordinates are grid units (12-col, GRID_ROW_HEIGHT rows). y is
// the top row; react-grid-layout compacts vertically, so leaving clean rows is
// fine. These are the reset-to-defaults targets too.
export type GridPlacement = {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

// Manager/admin/founder share one designed grid: tasks + recent leads across
// the top, the two cohort charts side-by-side, campaign full-width, then the
// three snapshot counts in a row.
const MANAGER_GRID: GridPlacement[] = [
  { widgetId: 'agent-tasks',         x: 0, y: 0,  w: 6, h: 9  },
  { widgetId: 'agent-activity',      x: 6, y: 0,  w: 6, h: 9  },
  { widgetId: 'manager-lead-status', x: 0, y: 9,  w: 6, h: 11 },
  { widgetId: 'manager-lead-volume', x: 6, y: 9,  w: 6, h: 11 },
  { widgetId: 'manager-campaigns',   x: 0, y: 20, w: 12, h: 11 },
  // Fuel gauge — half-width, its own row so the gauge body has room; cold-leads
  // count sits beside it.
  { widgetId: 'manager-budget',      x: 0, y: 31, w: 6, h: 8  },
  { widgetId: 'manager-cold-leads',  x: 6, y: 31, w: 3, h: 5  },
];

export const DEFAULT_GRID_BY_ROLE: Record<UserRole, GridPlacement[]> = {
  founder: MANAGER_GRID,
  admin:   MANAGER_GRID,
  manager: MANAGER_GRID,
  // Agent first screen: tasks + Elaya across the top, the two live counts,
  // then the tall activity feed full-width beneath.
  agent: [
    { widgetId: 'agent-tasks',          x: 0, y: 0, w: 6, h: 9  },
    { widgetId: 'elaya-presence',       x: 6, y: 0, w: 6, h: 11 },
    { widgetId: 'agent-pending-calls',  x: 0, y: 9, w: 2, h: 2  },
    { widgetId: 'agent-new-leads',      x: 2, y: 9, w: 2, h: 2  },
    { widgetId: 'agent-activity',       x: 0, y: 14, w: 6, h: 11 },
  ],
  guest: [],
};

// Default layout per role — ordered list of widget ids.
// Manager mirrors the founder layout MINUS the budget widget (admin/founder
// only). Agent first screen: tasks left / Elaya right, the two live snapshot
// counts, then the tall activity feed.
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
  // Manager mirrors founder/admin MINUS the budget widget (admin/founder only).
  manager: [
    'agent-tasks',
    'agent-activity',
    'manager-lead-status',
    'manager-lead-volume',
    'manager-campaigns',
    'manager-cold-leads',
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
