'use client';

// P-03 guard: if this list ever exceeds ~20 items, replace the map() with a
// virtualised list (e.g. @tanstack/react-virtual). At 11 columns today this is not needed.

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Lock } from 'lucide-react';
import { LEAD_COLUMNS, LEAD_COLUMN_MAP, type LeadColumnId } from '@/lib/constants/lead-columns';
import type { UseLeadColumnPreferencesReturn } from '@/hooks/useLeadColumnPreferences';

type LeadColumnPickerProps = {
  open: boolean;
  onClose: () => void;
  visibleColumns: LeadColumnId[];
  columnOrder: LeadColumnId[];
  toggleColumn: UseLeadColumnPreferencesReturn['toggleColumn'];
  reorderColumns: UseLeadColumnPreferencesReturn['reorderColumns'];
  resetToDefaults: UseLeadColumnPreferencesReturn['resetToDefaults'];
};

// ─────────────────────────────────────────────
// Sortable row item
// ─────────────────────────────────────────────
function SortableColumnRow({
  id,
  isVisible,
  onToggle,
}: {
  id: LeadColumnId;
  isVisible: boolean;
  onToggle: () => void;
}) {
  const col = LEAD_COLUMN_MAP[id];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.5 : 1,
    // Use transform only — never animate width/height/padding (rule M-06)
    zIndex:     isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display:        'flex',
        alignItems:     'center',
        gap:            'var(--space-2)',
        padding:        'var(--space-2) var(--space-3)',
        borderRadius:   'var(--radius-sm)',
        background:     isDragging ? 'var(--theme-paper-subtle)' : 'transparent',
        userSelect:     'none',
      }}
    >
      {/* Drag handle — only for non-locked visible columns */}
      {col.locked ? (
        <span style={{ width: '0.75rem', height: '0.75rem', flexShrink: 0 }} />
      ) : (
        <span
          {...attributes}
          {...listeners}
          style={{
            display:    'flex',
            alignItems: 'center',
            cursor:     'grab',
            color:      'var(--theme-text-tertiary)',
            flexShrink: 0,
            touchAction: 'none',
          }}
        >
          <GripVertical style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
        </span>
      )}

      {/* Label */}
      <span
        style={{
          flex:     1,
          fontSize: 'var(--text-sm)',
          color:    'var(--theme-text-primary)',
        }}
      >
        {col.label}
      </span>

      {/* Checkbox / lock icon */}
      {col.locked ? (
        <span
          title="This column is always visible"
          style={{
            display:    'flex',
            alignItems: 'center',
            color:      'var(--theme-text-tertiary)',
          }}
        >
          <Lock style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
        </span>
      ) : (
        <input
          type="checkbox"
          checked={isVisible}
          onChange={onToggle}
          style={{
            width:  '1rem',
            height: '1rem',
            cursor: 'pointer',
            accentColor: 'var(--theme-accent)',
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Hidden (non-draggable) column row
// ─────────────────────────────────────────────
function HiddenColumnRow({
  id,
  onToggle,
}: {
  id: LeadColumnId;
  onToggle: () => void;
}) {
  const col = LEAD_COLUMN_MAP[id];

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        'var(--space-2)',
        padding:    'var(--space-2) var(--space-3)',
        opacity:    0.5,
      }}
    >
      {/* Spacer in place of drag handle */}
      <span style={{ width: '0.75rem', height: '0.75rem', flexShrink: 0 }} />

      <span
        style={{
          flex:     1,
          fontSize: 'var(--text-sm)',
          color:    'var(--theme-text-secondary)',
        }}
      >
        {col.label}
      </span>

      <input
        type="checkbox"
        checked={false}
        onChange={onToggle}
        style={{
          width:  '1rem',
          height: '1rem',
          cursor: 'pointer',
          accentColor: 'var(--theme-accent)',
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Main picker panel
// ─────────────────────────────────────────────
export function LeadColumnPicker({
  open,
  onClose,
  visibleColumns,
  columnOrder,
  toggleColumn,
  reorderColumns,
  resetToDefaults,
}: LeadColumnPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Visible columns in current order (locked first, then unlocked visible)
  const visibleInOrder = columnOrder.filter((id) => visibleColumns.includes(id));
  // Hidden (non-locked) columns in default registry order
  const hiddenColumns  = LEAD_COLUMNS
    .filter((c) => !c.locked && !visibleColumns.includes(c.id))
    .map((c) => c.id);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = columnOrder.indexOf(active.id as LeadColumnId);
    const newIndex = columnOrder.indexOf(over.id as LeadColumnId);
    if (oldIndex === -1 || newIndex === -1) return;

    reorderColumns(arrayMove(columnOrder, oldIndex, newIndex));
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position:     'absolute',
            top:          'calc(100% + var(--space-1))',
            left:         0,
            zIndex:       'var(--z-dropdown)',
            width:        '240px',
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow:    'var(--shadow-2)',
            overflow:     'hidden',
          }}
          role="dialog"
          aria-label="Column visibility"
        >
          {/* Scrollable body — max 400px */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {/* Visible + draggable section */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleInOrder}
                strategy={verticalListSortingStrategy}
              >
                <div style={{ padding: 'var(--space-2) 0' }}>
                  {visibleInOrder.map((id) => (
                    <SortableColumnRow
                      key={id}
                      id={id}
                      isVisible={true}
                      onToggle={() => toggleColumn(id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Divider + hidden columns */}
            {hiddenColumns.length > 0 && (
              <>
                <div
                  style={{
                    height:     '1px',
                    background: 'var(--theme-paper-border)',
                    margin:     '0 var(--space-3)',
                  }}
                />
                <div style={{ padding: 'var(--space-2) 0' }}>
                  {hiddenColumns.map((id) => (
                    <HiddenColumnRow
                      key={id}
                      id={id}
                      onToggle={() => toggleColumn(id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop:  '1px solid var(--theme-paper-border)',
              padding:    'var(--space-2) var(--space-3)',
              display:    'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={resetToDefaults}
              style={{
                background:  'transparent',
                border:      'none',
                padding:     0,
                cursor:      'pointer',
                fontSize:    'var(--text-xs)',
                color:       'var(--theme-text-tertiary)',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              Reset to defaults
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
