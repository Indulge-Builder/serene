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
import { GripVertical, LayoutDashboard, RotateCcw } from 'lucide-react';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { WIDGET_MAP, type WidgetSize, type WidgetColSpan } from '@/lib/constants/dashboard-widgets';
import { DashboardWidgetSlot, type WidgetProps } from './DashboardWidgetSlot';

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

/* Below 820 px — all widgets stack full-width */
@media (max-width: 820px) {
  .eia-bento-cell-1,
  .eia-bento-cell-2 { grid-column: span 12; }
}

/* Between 820–1100 px — both half-width widgets stay halves
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
  initialData,
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
        initialData={initialData}
      />
    </div>
  );
}

type DashboardCanvasProps = WidgetProps & {
  greeting:  string;
  firstName: string;
};

export function DashboardCanvas({
  userId,
  role,
  domain,
  initialData,
  greeting,
  firstName,
}: DashboardCanvasProps) {
  const { layout, removeWidget, resizePlacement, reorderWidgets, resetToDefaults } =
    useDashboardLayout(userId, role);
  const [editMode, setEditMode] = useState(false);

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

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          {greeting},{' '}
          <span style={{ color: 'var(--theme-accent)' }}>{firstName}</span>
          <span className="page-title-dot">.</span>
        </h1>

        <div className="flex shrink-0 items-center gap-2">
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
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          'var(--space-1)',
              fontSize:     'var(--text-xs)',
              fontWeight:   'var(--weight-medium)',
              color:        editMode ? 'var(--theme-accent-fg)' : 'var(--theme-text-secondary)',
              background:   editMode ? 'var(--theme-accent)' : 'var(--theme-paper-subtle)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-sm)',
              cursor:       'pointer',
              padding:      '0 var(--space-3)',
              height:       '32px',
            }}
          >
            <LayoutDashboard size={12} strokeWidth={1.5} />
            {editMode ? 'Done' : 'Edit layout'}
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
                initialData={initialData}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
