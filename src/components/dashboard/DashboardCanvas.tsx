'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, LayoutDashboard, RotateCcw, Settings } from 'lucide-react';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import { WIDGET_MAP, type WidgetSize, type WidgetColSpan } from '@/lib/constants/dashboard-widgets';
import { DashboardWidgetSlot, type WidgetProps } from './DashboardWidgetSlot';
import { DashboardDateFilter } from './DashboardDateFilter';
import type { DatePreset, DateRange } from '@/lib/utils/date-range';

/*
 * Bento grid — 12 equal columns.
 * col-span-1 widgets → 6 columns (half width) on ≥ 768 px, 12 columns (full) below.
 * col-span-2 widgets → 12 columns always (campaign chart needs the room).
 *
 * The grid is 12 columns. Each "design column" is 6 grid columns.
 * This gives us clean halves without fractional arithmetic.
 *
 * Responsive rule lives in the injected <style> block so it works without
 * a Tailwind breakpoint (we use inline styles for the grid).
 */

const GRID_CSS = `
.eia-bento-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-4);
  width: 100%;
  align-items: start;
}
.eia-bento-cell-1 { grid-column: span 6; }
.eia-bento-cell-2 { grid-column: span 12; }

/* Below md — all widgets stack full-width (< --bp-md 768; DNA §9.1: canonical
   breakpoints only, the former 820 was arbitrary — responsive audit F-4) */
@media (max-width: 767.98px) {
  .eia-bento-cell-1,
  .eia-bento-cell-2 { grid-column: span 12; }
}

/* From md up — both half-width widgets stay halves
   but campaign spans full (already 12, no change needed) */
`;

type SortableWidgetProps = WidgetProps & {
  widgetId:  string;
  size:      WidgetSize;
  colSpan:   WidgetColSpan;
  editMode:  boolean;
  onRemove:  (id: string) => void;
  onResize:  (id: string, size: WidgetSize, colSpan: WidgetColSpan) => void;
};

function SortableWidget({
  widgetId,
  size,
  colSpan,
  editMode,
  onRemove,
  onResize,
  userId,
  role,
  domain,
  firstName,
  initialData,
  dateRange,
}: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widgetId, disabled: !editMode });

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.4 : 1,
    zIndex:     isDragging ? 50 : undefined,
  };

  const dragHandle = editMode ? (
    <button
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
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
      }}
    >
      <GripVertical size={14} strokeWidth={1.5} />
    </button>
  ) : undefined;

  return (
    <div
      ref={setNodeRef}
      className={`eia-bento-cell-${colSpan}`}
      style={style}
    >
      <DashboardWidgetSlot
        widgetId={widgetId}
        size={size}
        colSpan={colSpan}
        editMode={editMode}
        onRemove={onRemove}
        onResize={onResize}
        dragHandle={dragHandle}
        userId={userId}
        role={role}
        domain={domain}
        firstName={firstName}
        initialData={initialData}
        dateRange={dateRange}
      />
    </div>
  );
}

type DashboardCanvasProps = WidgetProps & {
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
  initialData,
  greeting,
  firstName,
  activePreset,
  fromParam,
  toParam,
  dateRange,
}: DashboardCanvasProps) {
  const { layout, removeWidget, resizePlacement, reorderWidgets, resetToDefaults } =
    useDashboardLayout(userId, role);
  const [editMode, setEditMode] = useState(false);
  const isMobile = useMediaQuery(MQ.mobile);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldOrder = layout.map((p) => p.widgetId);
      const oldIndex = oldOrder.indexOf(active.id as string);
      const newIndex = oldOrder.indexOf(over.id as string);

      if (oldIndex === -1 || newIndex === -1) return;

      reorderWidgets(arrayMove(oldOrder, oldIndex, newIndex));
    },
    [layout, reorderWidgets],
  );

  const widgetIds = layout.map((p) => p.widgetId);

  return (
    <div>
      {/* Inject bento grid CSS once */}
      <style>{GRID_CSS}</style>

      {/* Page header — one line, always: greeting left, control cluster
          (date filter + edit) right. Below md the greeting truncates and the
          edit control compresses to an icon-only Settings button so all four
          top elements (drawer trigger · title · filter · settings) share the
          title line. Desktop wraps if it must (audit F1). */}
      <div className="flex flex-wrap max-md:flex-nowrap items-center justify-between gap-x-4 gap-y-3 mb-4">
        <h1 className="type-page-title m-0 max-md:min-w-0 max-md:truncate">
          {greeting},{' '}
          <span style={{ color: 'var(--theme-accent)' }}>{firstName}</span>
          <span className="page-title-dot">.</span>
        </h1>

        <div className="flex shrink-0 items-center gap-2">
          {/* Global date filter — only shown to manager/admin/founder roles */}
          {(role === 'manager' || role === 'admin' || role === 'founder') && (
            <DashboardDateFilter
              activePreset={activePreset}
              fromParam={fromParam}
              toParam={toParam}
            />
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
            className="eia-pressable eia-icon-rotate-hover eia-touch"
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

      {/* Bento grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgetIds} strategy={verticalListSortingStrategy}>
          <div className="eia-bento-grid">
            {layout.map((placement) => (
              <SortableWidget
                key={placement.widgetId}
                widgetId={placement.widgetId}
                size={placement.size}
                colSpan={placement.colSpan ?? (WIDGET_MAP[placement.widgetId]?.colSpan ?? 1)}
                editMode={editMode}
                onRemove={removeWidget}
                onResize={resizePlacement}
                userId={userId}
                role={role}
                domain={domain}
                firstName={firstName}
                initialData={initialData}
                dateRange={dateRange}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
