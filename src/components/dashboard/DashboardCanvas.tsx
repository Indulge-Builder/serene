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
import { WIDGET_MAP } from '@/lib/constants/dashboard-widgets';
import { DashboardWidgetSlot, type WidgetProps } from './DashboardWidgetSlot';

type SortableWidgetProps = WidgetProps & {
  widgetId: string;
  editMode: boolean;
  onRemove: (id: string) => void;
};

function SortableWidget({ widgetId, editMode, onRemove, userId, role, domain, initialData }: SortableWidgetProps) {
  const definition = WIDGET_MAP[widgetId];
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
    opacity:    isDragging ? 0.5 : 1,
  };

  const dragHandle = editMode ? (
    <button
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      style={{
        cursor:       'grab',
        width:        '24px',
        height:       '24px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        color:        'var(--theme-text-tertiary)',
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <GripVertical size={14} strokeWidth={1.5} />
    </button>
  ) : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      <DashboardWidgetSlot
        widgetId={widgetId}
        size={definition?.defaultSize ?? 'md'}
        editMode={editMode}
        onRemove={onRemove}
        dragHandle={dragHandle}
        userId={userId}
        role={role}
        domain={domain}
        initialData={initialData}
      />
    </div>
  );
}

type DashboardCanvasProps = WidgetProps;

export function DashboardCanvas({ userId, role, domain, initialData }: DashboardCanvasProps) {
  const { layout, removeWidget, reorderWidgets, resetToDefaults } = useDashboardLayout(userId, role);
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
      {/* Canvas toolbar */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'flex-end',
          gap:            'var(--space-2)',
          marginBottom:   'var(--space-4)',
        }}
      >
        {editMode && (
          <button
            onClick={resetToDefaults}
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         'var(--space-1)',
              fontSize:    'var(--text-xs)',
              color:       'var(--theme-text-tertiary)',
              background:  'transparent',
              border:      'none',
              cursor:      'pointer',
              padding:     'var(--space-1) var(--space-2)',
            }}
          >
            <RotateCcw size={12} strokeWidth={1.5} />
            Reset layout
          </button>
        )}
        <button
          onClick={() => setEditMode((v) => !v)}
          aria-pressed={editMode}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            'var(--space-1)',
            fontSize:       'var(--text-xs)',
            fontWeight:     'var(--weight-medium)',
            color:          editMode ? 'var(--theme-accent-fg)' : 'var(--theme-text-secondary)',
            background:     editMode ? 'var(--theme-accent)' : 'var(--theme-paper-subtle)',
            border:         '1px solid var(--theme-paper-border)',
            borderRadius:   'var(--radius-sm)',
            cursor:         'pointer',
            padding:        '0 var(--space-3)',
            height:         '32px',
          }}
        >
          <LayoutDashboard size={12} strokeWidth={1.5} />
          {editMode ? 'Done' : 'Edit layout'}
        </button>
      </div>

      {/* Widget grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgetIds} strategy={verticalListSortingStrategy}>
          <div
            style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap:                 'var(--space-4)',
            }}
          >
            {layout.map((placement) => (
              <SortableWidget
                key={placement.widgetId}
                widgetId={placement.widgetId}
                editMode={editMode}
                onRemove={removeWidget}
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
