'use client';

import { useState, useCallback, useMemo } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { GripVertical, LayoutDashboard, RotateCcw, Settings } from 'lucide-react';
import { useDashboardLayout, type WidgetPlacement } from '@/hooks/useDashboardLayout';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import {
  GRID_COLS,
  GRID_ROW_HEIGHT,
  GRID_MARGIN,
  WIDGET_MAP,
} from '@/lib/constants/dashboard-widgets';
import { DashboardWidgetSlot, type WidgetProps } from './DashboardWidgetSlot';
import { DashboardDateFilter } from './DashboardDateFilter';
import { AddWidgetMenu } from './AddWidgetMenu';
import { PageControls } from '@/components/layout/PageControls';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import type { DatePreset, DateRange } from '@/lib/utils/date-range';
import type { Notification } from '@/lib/types/database';

// WidthProvider measures the container and feeds `width` to Responsive — no
// manual ResizeObserver, no fixed width. Responsive gives us the mobile-collapse
// breakpoint for free (xs → 1 column). Created once at module scope.
const ResponsiveGridLayout = WidthProvider(Responsive);

// Two breakpoints only: the full 12-col grid on tablet+ and a single stacked
// column below md (a spatial grid is unusable on a phone — widgets stack).
const RGL_BREAKPOINTS = { lg: 768, xs: 0 } as const;
const RGL_COLS = { lg: GRID_COLS, xs: 1 } as const;

type DashboardCanvasProps = WidgetProps & {
  greeting:     string;
  firstName:    string;
  activePreset: DatePreset;
  fromParam:    string | null;
  toParam:      string | null;
  /** Resolved DateRange (from the RSC, computed from preset/params). */
  dateRange:    DateRange;
  /** Streamed notification seed for the title-row bell (TOP_BAR_ENABLED). */
  notificationsPromise?: Promise<Notification[]>;
};

export function DashboardCanvas({
  userId,
  role,
  domain,
  scopeDomain,
  initialData,
  greeting,
  firstName,
  activePreset,
  fromParam,
  toParam,
  dateRange,
  notificationsPromise,
}: DashboardCanvasProps) {
  const isPrivileged = role === 'admin' || role === 'founder';
  const { layout, isHydrated, applyLayout, addWidget, removeWidget, resetToDefaults } =
    useDashboardLayout(userId, role);
  const [editMode, setEditMode] = useState(false);
  const isMobile = useMediaQuery(MQ.mobile);

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

  // RGL emits the full Layout[] on every drag/resize. Map back to our shape and
  // commit (the hook no-ops when nothing actually changed, incl. RGL's mount fire).
  const handleLayoutChange = useCallback(
    (next: Layout[]) => {
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
    [applyLayout, isHydrated],
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
            <span style={{ color: 'var(--theme-accent)' }}>{firstName}</span>
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
          {TOP_BAR_ENABLED && notificationsPromise && (
            <PageControls
              userId={userId}
              isPrivileged={isPrivileged}
              notificationsPromise={notificationsPromise}
            />
          )}

          {editMode && (
            <AddWidgetMenu role={role} placedIds={placedIds} onAdd={addWidget} />
          )}

          {editMode && (
            <button
              type="button"
              onClick={resetToDefaults}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        'var(--space-1)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
                background: 'transparent',
                border:     'none',
                cursor:     'pointer',
                padding:    'var(--space-1) var(--space-2)',
              }}
            >
              <RotateCcw size={12} strokeWidth={1.5} />
              Reset layout
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            aria-pressed={editMode}
            aria-label={editMode ? 'Done editing layout' : 'Edit layout'}
            className="serene-pressable serene-icon-rotate-hover serene-touch"
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            'var(--space-1)',
              fontSize:       'var(--text-xs)',
              fontWeight:     'var(--weight-medium)',
              color:        editMode ? 'var(--theme-accent-fg)' : 'var(--theme-text-secondary)',
              background:   editMode ? 'var(--theme-accent)' : 'var(--theme-paper-subtle)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: isMobile ? 'var(--radius-full)' : 'var(--radius-sm)',
              cursor:       'pointer',
              padding:      isMobile ? 0 : '0 var(--space-3)',
              width:        isMobile ? '32px' : undefined,
              flexShrink:   0,
              height:       '32px',
            }}
          >
            {isMobile ? (
              <Settings size={15} strokeWidth={1.5} />
            ) : (
              <>
                <LayoutDashboard size={12} strokeWidth={1.5} />
                {editMode ? 'Done' : 'Edit layout'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Spatial grid — react-grid-layout owns move/resize/pack/responsive.
          Read-only until edit mode (no accidental drags); only the grip handle
          drags so clicking widget content still works. All chrome is token-styled
          in globals.css (.serene-dashboard-grid …). */}
      <div className={editMode ? 'serene-dashboard-grid is-editing' : 'serene-dashboard-grid'}>
        <ResponsiveGridLayout
          layouts={{ lg: rglLayout, xs: rglLayout }}
          breakpoints={RGL_BREAKPOINTS}
          cols={RGL_COLS}
          rowHeight={GRID_ROW_HEIGHT}
          margin={[GRID_MARGIN, GRID_MARGIN]}
          containerPadding={[0, 0]}
          isDraggable={editMode}
          isResizable={editMode}
          draggableHandle=".serene-widget-drag"
          resizeHandles={['se']}
          compactType="vertical"
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
                      className="serene-widget-drag"
                      aria-label="Drag to move"
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
    </div>
  );
}
