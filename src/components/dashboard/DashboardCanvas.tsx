'use client';

import { Button } from '@/components/ui/Button';
import { Suspense, useState, useCallback, useMemo } from 'react';
import { Await } from '@/components/ui/Await';
import { DashboardGridSkeleton } from './DashboardGridSkeleton';
import type { DashboardSummary } from '@/lib/types';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { GripVertical, LayoutDashboard, RotateCcw } from 'lucide-react';
import { useDashboardLayout, type WidgetPlacement } from '@/hooks/useDashboardLayout';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import {
  GRID_COLS,
  GRID_ROW_HEIGHT,
  GRID_MARGIN,
  GRID_MOBILE_BREAKPOINT,
  WIDGET_MAP,
} from '@/lib/constants/dashboard-widgets';
import { DashboardWidgetSlot, type WidgetProps } from './DashboardWidgetSlot';
import { DashboardDateFilter } from './DashboardDateFilter';
import { AddWidgetMenu } from './AddWidgetMenu';
import { PageControls } from '@/components/layout/PageControls';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import type { DatePreset, DateRange } from '@/lib/utils/date-range';

// WidthProvider measures the container and feeds `width` to Responsive — no
// manual ResizeObserver, no fixed width. Responsive gives us the mobile-collapse
// breakpoint for free (xs → 1 column). Created once at module scope.
const ResponsiveGridLayout = WidthProvider(Responsive);

// Two breakpoints only: the full 12-col grid on tablet+ and a single stacked
// column below md (a spatial grid is unusable on a phone — widgets stack).
const RGL_BREAKPOINTS = { lg: GRID_MOBILE_BREAKPOINT, xs: 0 } as const;
const RGL_COLS = { lg: GRID_COLS, xs: 1 } as const;

type DashboardCanvasProps = Omit<WidgetProps, 'initialData'> & {
  /** The widget seed as a PROMISE (2026-09-16, perf: the dashboard no longer
   *  blocks on its fetches). The RSC starts the seven-call Promise.all and
   *  hands it over un-awaited; the header (greeting, date filter, controls)
   *  paints immediately and the grid resolves it behind its own Suspense via
   *  <Await>. Never rejects — the page catches to an empty summary. */
  initialDataPromise: Promise<DashboardSummary>;
  greeting:     string;
  firstName:    string;
  activePreset: DatePreset;
  fromParam:    string | null;
  toParam:      string | null;
  /** Resolved DateRange (from the RSC, computed from preset/params). */
  dateRange:    DateRange;
};

export function DashboardCanvas({
  userId,
  role,
  domain,
  scopeDomain,
  initialDataPromise,
  greeting,
  firstName,
  activePreset,
  fromParam,
  toParam,
  dateRange,
}: DashboardCanvasProps) {
  const isPrivileged = role === 'admin' || role === 'founder';
  const { layout, isHydrated, applyLayout, addWidget, removeWidget, resetToDefaults } =
    useDashboardLayout(userId, role);
  const [editMode, setEditMode] = useState(false);
  const isMobile = useMediaQuery(MQ.mobile);
  const [activeBp, setActiveBp] = useState<'lg' | 'xs'>('lg');

  // Widget ids currently on the canvas — drives the Add-widget picker's
  // "what's been removed" set (anything role-available but not here).
  const placedIds = useMemo(() => new Set(layout.map((p) => p.widgetId)), [layout]);

  // Our placements → RGL's Layout[] (the `i` key carries the widgetId, and we
  // pin per-widget min sizes so a chart can't be dragged below a usable cell).
  const rglLayout: Layout[] = useMemo(
    () =>
      layout.map((p) => {
        const def = WIDGET_MAP[p.widgetId];
        return {
          i: p.widgetId,
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
          minW: def?.defaultGrid.minW,
          minH: def?.defaultGrid.minH,
        };
      }),
    [layout],
  );

  // The phone (xs) layout is DERIVED from the same placements, never persisted:
  // sort by (y, x), then force a single stacked column (x:0, w:1) with a per-widget
  // mobileH row override. compactType="vertical" packs the real y from the running
  // stack order, and `static` keeps every widget read-only on phones.
  const xsLayout: Layout[] = useMemo(
    () =>
      [...layout]
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((p, i) => {
          const def = WIDGET_MAP[p.widgetId];
          return {
            i: p.widgetId,
            x: 0,
            y: i, // compactType="vertical" packs the real y
            w: 1,
            h: def?.mobileH ?? p.h,
            minW: 1,
            static: true, // read-only on phones
          };
        }),
    [layout],
  );

  // RGL emits the full Layout[] on every drag/resize. Map back to our shape and
  // commit (the hook no-ops when nothing actually changed, incl. RGL's mount fire).
  const handleLayoutChange = useCallback(
    (next: Layout[]) => {
      if (activeBp !== 'lg') return; // phone layout is derived + read-only; never persist it
      // Ignore RGL's pre-hydration echo: before localStorage settles, `layout`
      // is the synchronous default — persisting RGL's mount layout here would
      // overwrite the user's saved layout with the default. Wait for hydration.
      if (!isHydrated) return;
      const placements: WidgetPlacement[] = next.map((l) => ({
        widgetId: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
      }));
      applyLayout(placements);
    },
    [applyLayout, isHydrated, activeBp],
  );

  return (
    <div>
      {/* Page header — greeting left, control cluster (date filter, domain
          selector, bell, edit) right. Mobile: ONE row (`flex-nowrap`) — every
          control is icon-compact there (icon-only domain chip + edit gear, ~36px
          each), so the whole cluster fits beside the greeting instead of dropping
          to a second row. The greeting `h1` shrinks (`min-w-0`) and drops the
          name to its own LINE within the title (`max-md:block` — vertical space
          inside the h1, not a new flex row). Desktop (`md:flex-wrap`): the
          labelled controls are wider, so the row may wrap if it must (audit F1). */}
      <div className="flex flex-nowrap md:flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-4">
        <h1 className="type-page-title m-0 min-w-0">
          {greeting},{' '}
          <span className="max-md:block">
            <span style={{ color: "var(--neu-accent-deep)" }}>{firstName}</span>
            <span className="page-title-dot">.</span>
          </span>
        </h1>

        <div className="flex flex-nowrap shrink-0 items-center justify-end gap-2">
          {/* Global date filter — only shown to manager/admin/founder roles */}
          {(role === 'manager' || role === 'admin' || role === 'founder') && (
            <DashboardDateFilter
              activePreset={activePreset}
              fromParam={fromParam}
              toParam={toParam}
            />
          )}

          {/* Notification bell + global domain selector (TOP_BAR_ENABLED) —
              dashboard has no standard server title row, so they ride the canvas
              header cluster. admin/founder get the SAME serene-domain selector
              the list pages use: a pick writes ?domain= (+ cookie), the page RSC
              re-seeds every cohort widget for that scope (no per-widget tabs). */}
          {TOP_BAR_ENABLED && (
            <PageControls isPrivileged={isPrivileged} />
          )}

          {editMode && (
            <AddWidgetMenu role={role} placedIds={placedIds} onAdd={addWidget} />
          )}

          {editMode && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={resetToDefaults}
            >
              <RotateCcw size={12} strokeWidth={1.5} />
              Reset layout
            </Button>
          )}
          {/* Edit mode is disabled below 768px — the phone layout is derived +
              read-only, so the toggle is hidden entirely there. */}
          {!isMobile && (
            <Button
              variant="control"
              active={editMode}
              type="button"
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
              aria-label={editMode ? 'Done editing layout' : 'Edit layout'}
            >
              <LayoutDashboard size={12} strokeWidth={1.5} />
              {editMode ? 'Done' : 'Edit layout'}
            </Button>
          )}
        </div>
      </div>

      {/* Spatial grid — react-grid-layout owns move/resize/pack/responsive.
          Read-only until edit mode (no accidental drags); only the grip handle
          drags so clicking widget content still works. All chrome is token-styled
          in globals.css (.serene-dashboard-grid …). */}
      {/* The grid waits for the widget seed; the header above never does. On a
          date/scope change the RSC hands over a NEW promise — React keeps the
          current grid visible through the transition (the widgets' own
          deps-driven refetch shows per-widget pending state), so no `key`. */}
      <Suspense fallback={<DashboardGridSkeleton />}>
      <Await promise={initialDataPromise}>
      {(initialData) => (
      <div className={editMode ? 'serene-dashboard-grid is-editing' : 'serene-dashboard-grid'}>
        <ResponsiveGridLayout
          layouts={{ lg: rglLayout, xs: xsLayout }}
          breakpoints={RGL_BREAKPOINTS}
          cols={RGL_COLS}
          rowHeight={GRID_ROW_HEIGHT}
          margin={{ lg: [GRID_MARGIN, GRID_MARGIN], xs: [12, 12] }}
          containerPadding={[0, 0]}
          isDraggable={editMode && !isMobile}
          isResizable={editMode && !isMobile}
          draggableHandle=".serene-widget-drag"
          resizeHandles={['se']}
          compactType="vertical"
          onBreakpointChange={(bp) => setActiveBp(bp as 'lg' | 'xs')}
          onLayoutChange={handleLayoutChange}
          // measureBeforeMount MUST stay false: WidthProvider measures its own
          // node's offsetWidth on mount, and mounting with the pre-measure width
          // (0) collapses every widget to a sliver on the left. The chart -1
          // problem is handled independently by the slot's `measured` render gate
          // (useWidgetDensity) — not by this flag.
          useCSSTransforms
          measureBeforeMount={false}
          style={{ width: '100%' }}
        >
          {layout.map((placement) => (
            <div key={placement.widgetId}>
              <DashboardWidgetSlot
                widgetId={placement.widgetId}
                size={WIDGET_MAP[placement.widgetId]?.defaultSize ?? 'md'}
                editMode={editMode}
                onRemove={removeWidget}
                dragHandle={
                  editMode ? (
                    <button
                      type="button"
                      className="serene-widget-drag"
                      aria-label="Move widget; use arrow keys or drag"
                      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                      onKeyDown={(event) => {
                        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                        event.preventDefault();
                        applyLayout(layout.map(item => item.widgetId !== placement.widgetId ? item : {
                          ...item,
                          x: Math.max(0, Math.min(GRID_COLS - item.w, item.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))),
                          y: Math.max(0, item.y + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)),
                        }));
                      }}
                      style={{
                        cursor:         'grab',
                        width:          '24px',
                        height:         '24px',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        color:          'var(--theme-text-tertiary)',
                        background:     'var(--theme-paper)',
                        border:         '1px solid var(--theme-paper-border)',
                        borderRadius:   'var(--radius-sm)',
                        touchAction:    'none',
                      }}
                    >
                      <GripVertical size={14} strokeWidth={1.5} />
                    </button>
                  ) : undefined
                }
                userId={userId}
                role={role}
                domain={domain}
                firstName={firstName}
                initialData={initialData}
                dateRange={dateRange}
                scopeDomain={scopeDomain}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>
      )}
      </Await>
      </Suspense>
    </div>
  );
}
