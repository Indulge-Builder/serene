'use client';

// P-03 guard: if this list ever exceeds ~20 items, replace the map() with a
// virtualised list (e.g. @tanstack/react-virtual). At 11 columns today this is not needed.

import { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { Check, GripVertical, Lock } from 'lucide-react';
import { LEAD_COLUMNS, LEAD_COLUMN_MAP, type LeadColumnId } from '@/lib/constants/lead-columns';
import { DROPDOWN_VARIANTS, FAST_DURATION, EASE_SPRING } from '@/lib/constants/motion';
import type { UseLeadColumnPreferencesReturn } from '@/hooks/useLeadColumnPreferences';

const PANEL_WIDTH = 240;
/** Matches FilterDropdown MAX_MENU_SCROLL_HEIGHT */
const MAX_LIST_SCROLL_HEIGHT = 240;

// ─────────────────────────────────────────────
// Themed checkbox — design-dna §7.5 (matches FilterDropdown multi-select)
// ─────────────────────────────────────────────
function ColumnCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  const [hovered, setHovered] = useState(false);

  const borderColor = checked || hovered
    ? 'var(--theme-accent)'
    : 'var(--theme-paper-border)';

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Hide ${label} column` : `Show ${label} column`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.85 }}
      transition={{ duration: FAST_DURATION, ease: EASE_SPRING }}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          16,
        height:         16,
        flexShrink:     0,
        border:         `1.5px solid ${borderColor}`,
        borderRadius:   'var(--radius-xs)',
        background:     checked ? 'var(--theme-accent)' : 'transparent',
        cursor:         'pointer',
        padding:        0,
        transition:     'border-color var(--duration-fast) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out)',
        willChange:     'transform',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {checked && (
          <motion.span
            key="check"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.08, ease: EASE_SPRING }}
            style={{ display: 'flex' }}
          >
            <Check
              style={{
                width:       12,
                height:      12,
                strokeWidth: 2.5,
                color:       'var(--theme-accent-fg)',
              }}
              aria-hidden="true"
            />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

type LeadColumnPickerProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
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

      {/* Label — click toggles visibility (design-dna §7.5) */}
      <button
        type="button"
        onClick={col.locked ? undefined : onToggle}
        disabled={col.locked}
        style={{
          flex:       1,
          fontSize:   'var(--text-sm)',
          color:      isVisible ? 'var(--theme-text-secondary)' : 'var(--theme-text-primary)',
          background: 'transparent',
          border:     'none',
          padding:    0,
          textAlign:  'left',
          cursor:     col.locked ? 'default' : 'pointer',
        }}
      >
        {col.label}
      </button>

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
        <ColumnCheckbox checked={isVisible} onToggle={onToggle} label={col.label} />
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

      <button
        type="button"
        onClick={onToggle}
        style={{
          flex:       1,
          fontSize:   'var(--text-sm)',
          color:      'var(--theme-text-secondary)',
          background: 'transparent',
          border:     'none',
          padding:    0,
          textAlign:  'left',
          cursor:     'pointer',
        }}
      >
        {col.label}
      </button>

      <ColumnCheckbox checked={false} onToggle={onToggle} label={col.label} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Main picker panel
// ─────────────────────────────────────────────
export function LeadColumnPicker({
  open,
  onClose,
  anchorRef,
  visibleColumns,
  columnOrder,
  toggleColumn,
  reorderColumns,
  resetToDefaults,
}: LeadColumnPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePanelPosition = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;

    const measuredH = panelRef.current?.offsetHeight ?? 320;
    const vvLeft = window.visualViewport?.offsetLeft ?? 0;
    const vvTop  = window.visualViewport?.offsetTop  ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < measuredH + 8 && rect.top > spaceBelow;
    const flipLeft = rect.right - PANEL_WIDTH < 8;
    const left = (flipLeft ? rect.left : rect.right - PANEL_WIDTH) - vvLeft;
    const top  = (flipUp ? rect.top - 4 - measuredH : rect.bottom + 4) - vvTop;

    setPanelPos({ top, left });
  }, [anchorRef]);

  // Close on outside click + reposition on scroll/resize
  useEffect(() => {
    if (!open) return;

    updatePanelPosition();

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }
    function reposition() { updatePanelPosition(); }

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    window.visualViewport?.addEventListener('resize', reposition);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
    };
  }, [open, onClose, anchorRef, updatePanelPosition]);

  // Re-measure after mount so flip-up/left uses real panel dimensions
  useLayoutEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (!panelRef.current) return;
      const { width, height } = panelRef.current.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vvLeft = window.visualViewport?.offsetLeft ?? 0;
      const vvTop  = window.visualViewport?.offsetTop  ?? 0;
      const flipLeft = rect.right - width < 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < height + 8 && rect.top > spaceBelow;
      const left = (flipLeft ? rect.left : rect.right - width) - vvLeft;
      const top  = (flipUp ? rect.top - 4 - height : rect.bottom + 4) - vvTop;
      setPanelPos({ top, left });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, anchorRef, visibleColumns, columnOrder]);

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

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          key="lead-column-picker"
          variants={DROPDOWN_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{
            position:       'fixed',
            top:            panelPos.top,
            left:           panelPos.left,
            width:          PANEL_WIDTH,
            zIndex:         'var(--z-dropdown)' as React.CSSProperties['zIndex'],
            background:     'var(--theme-paper)',
            border:         '1px solid var(--theme-paper-border)',
            borderRadius:   'var(--radius-md)',
            boxShadow:      'var(--shadow-3)',
            overflow:       'hidden',
            display:        'flex',
            flexDirection:  'column',
          }}
          role="dialog"
          aria-label="Column visibility"
        >
          {/* Scrollable list — matches FilterDropdown scroll region */}
          <div
            style={{
              overflowY:  'auto',
              maxHeight:  MAX_LIST_SCROLL_HEIGHT,
              flexShrink: 1,
              minHeight:  0,
              padding:    'var(--space-1) 0',
            }}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleInOrder}
                strategy={verticalListSortingStrategy}
              >
                <div>
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

            {hiddenColumns.length > 0 && (
              <>
                <div
                  style={{
                    height:     '1px',
                    background: 'var(--theme-paper-border)',
                    margin:     'var(--space-1) var(--space-3)',
                  }}
                />
                <div>
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

          {/* Footer — pinned outside scroll region */}
          <div
            style={{
              borderTop:      '1px solid var(--theme-paper-border)',
              padding:        'var(--space-2) var(--space-3)',
              display:        'flex',
              justifyContent: 'flex-end',
              flexShrink:     0,
            }}
          >
            <button
              type="button"
              onClick={resetToDefaults}
              style={{
                background:          'transparent',
                border:              'none',
                padding:             0,
                cursor:              'pointer',
                fontSize:            'var(--text-xs)',
                color:               'var(--theme-text-tertiary)',
                textDecoration:      'underline',
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

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(panel, document.body);
}
