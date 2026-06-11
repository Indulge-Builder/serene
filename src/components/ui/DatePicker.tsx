'use client';

import React, { useRef, useEffect, useLayoutEffect, useMemo, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Calendar } from './Calendar';
import { TimePickerWheelPanel, type Meridiem } from './TimePicker';
import {
  DROPDOWN_VARIANTS,
  DROPDOWN_VARIANTS_UP,
  FLIP_UP_TRANSFORM_TEMPLATE,
} from '@/lib/constants/motion';
import { toUTC, formatDate } from '@/lib/utils/dates';

export interface DatePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  /**
   * When true, renders a time picker beside the calendar (calendar left, time right).
   * Hours 1–12, minutes 00–59 (scroll wheel), AM/PM toggle. Default false (date-only).
   * showTime=false behaviour is identical to the legacy implementation.
   */
  showTime?: boolean;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

function to12Hour(d: Date): { hour: number; minute: number; meridiem: Meridiem } {
  const h24 = d.getHours();
  const meridiem: Meridiem = h24 >= 12 ? 'PM' : 'AM';
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour, minute: d.getMinutes(), meridiem };
}

function combine(date: Date, hour: number, minute: number, meridiem: Meridiem): Date {
  const h24 = meridiem === 'AM'
    ? (hour === 12 ? 0 : hour)
    : (hour === 12 ? 12 : hour + 12);
  const next = new Date(date);
  next.setHours(h24, minute, 0, 0);
  return next;
}

// Approximate panel dimensions for viewport flip detection.
// Calendar is 260px + 32px padding; time wheel column adds ~148px when showTime.
const PANEL_WIDTH_DATE_ONLY = 292;
const PANEL_WIDTH_WITH_TIME = 448;
const PANEL_HEIGHT = 320;

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date…',
  minDate,
  maxDate,
  disabled = false,
  showTime = false,
  className,
  style,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, flipUp: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef   = useRef<HTMLButtonElement>(null);
  const panelRef     = useRef<HTMLDivElement>(null);

  const panelWidth = showTime ? PANEL_WIDTH_WITH_TIME : PANEL_WIDTH_DATE_ONLY;

  const updatePanelPosition = useCallback((panelW?: number, panelH?: number) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const w = panelW ?? panelWidth;
    const h = panelH ?? PANEL_HEIGHT;
    const vvLeft = window.visualViewport?.offsetLeft ?? 0;
    const vvTop  = window.visualViewport?.offsetTop  ?? 0;
    const flipLeft = rect.left + w > window.innerWidth - 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < h && rect.top > spaceBelow;
    const left = (flipLeft ? rect.right - w : rect.left) - vvLeft;
    const top  = (flipUp ? rect.top - 4 : rect.bottom + 4) - vvTop;
    setPanelPos({ top, left, flipUp });
  }, [panelWidth]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Draft date held only while the panel is open in showTime mode — lets the user
  // pick a calendar day without committing until they also pick a time. In date-only
  // mode this state is unused; calendar selection commits and closes immediately.
  const [draftDate, setDraftDate] = useState<Date | null>(value ?? null);

  // Sync draft when value changes externally (parent overrides).
  useEffect(() => {
    setDraftDate(value ?? null);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function reposition() { updatePanelPosition(); }
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
    };
  }, [open, updatePanelPosition]);

  // Re-measure panel after AnimatePresence commits the node to correct any flip error.
  useLayoutEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (!panelRef.current) return;
      const { width, height } = panelRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) updatePanelPosition(width, height);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, updatePanelPosition]);

  // Derive current time-picker state from draftDate (or value, or now).
  const seed = draftDate ?? value ?? null;
  const { hour: selHour, minute: selMinuteRaw, meridiem: selMeridiem } = useMemo(() => {
    if (seed) return to12Hour(seed);
    return { hour: 9, minute: 0, meridiem: 'AM' as Meridiem };
  }, [seed]);
  const selMinute = Math.min(59, Math.max(0, selMinuteRaw));

  function commit(next: Date) {
    onChange(toUTC(next));
  }

  function handleCalendarSelect(date: Date) {
    if (!showTime) {
      commit(date);
      setOpen(false);
      return;
    }
    // Carry forward the previously-selected time when changing the calendar day,
    // otherwise default to 09:00 AM. This avoids surprising the user with 00:00.
    const base = draftDate
      ? combine(date, selHour, selMinute, selMeridiem)
      : combine(date, 9, 0, 'AM');
    setDraftDate(base);
    commit(base);
  }

  function handleTimeChange(nextHour: number, nextMinute: number, nextMeridiem: Meridiem) {
    const base = draftDate ?? value ?? new Date();
    const merged = combine(base, nextHour, nextMinute, nextMeridiem);
    setDraftDate(merged);
    commit(merged);
  }

  const triggerLabel = value
    ? (showTime
        ? formatDate(value, 'dd MMM yyyy, h:mm a')
        : formatDate(value, 'dd MMM yyyy'))
    : placeholder;

  const popover = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          key="datepicker-popover"
          role="dialog"
          aria-label="Calendar"
          variants={panelPos.flipUp ? DROPDOWN_VARIANTS_UP : DROPDOWN_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          // flip-up shift via transformTemplate — a style.transform string
          // would be clobbered by the animated y (see motion.ts)
          transformTemplate={panelPos.flipUp ? FLIP_UP_TRANSFORM_TEMPLATE : undefined}
          style={{
            position:     'fixed',
            top:          panelPos.top,
            left:         panelPos.left,
            zIndex:       'var(--z-modal-nested)' as React.CSSProperties['zIndex'],
            boxShadow:    'var(--shadow-3)',
            borderRadius: 'var(--radius-md)',
            border:       '1px solid var(--theme-paper-border)',
            overflow:     'hidden',
            background:   'var(--theme-paper)',
          }}
        >
          <div
            data-datepicker-panel="true"
            style={{
              display:    'flex',
              flexDirection: 'row',
              alignItems: 'stretch',
            }}
          >
            <Calendar
              value={draftDate ?? value}
              onSelect={handleCalendarSelect}
              minDate={minDate}
              maxDate={maxDate}
              style={
                showTime
                  ? { borderRadius: 'var(--radius-md) 0 0 var(--radius-md)' }
                  : undefined
              }
            />

            {showTime && (
              <TimePickerWheelPanel
                variant="embedded"
                hour={selHour}
                minute={selMinute}
                meridiem={selMeridiem}
                onChange={handleTimeChange}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
    >
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel ?? 'Date picker'}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display:     'inline-flex',
          alignItems:  'center',
          gap:         'var(--space-2)',
          height:      '2.25rem',
          padding:     'var(--space-2) var(--space-3)',
          background:  'var(--theme-paper-subtle)',
          border:      `1px solid ${focused || open ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
          borderRadius:'var(--radius-md)',
          fontSize:    'var(--text-sm)',
          fontFamily:  'var(--font-sans)',
          color:       value ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
          cursor:      disabled ? 'not-allowed' : 'pointer',
          opacity:     disabled ? 0.5 : 1,
          boxShadow:   focused || open ? 'var(--shadow-focus)' : 'none',
          transition:  'var(--transition-hover)',
          outline:     'none',
          whiteSpace:  'nowrap',
        }}
      >
        <CalendarIcon
          style={{ width: 14, height: 14, strokeWidth: 1.5, color: 'var(--theme-text-tertiary)' }}
          aria-hidden="true"
        />
        {triggerLabel}
      </button>

      {mounted && typeof document !== 'undefined' ? createPortal(popover, document.body) : null}
    </div>
  );
}

