'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar } from './Calendar';
import { TabSelector } from './TabSelector';
import { DROPDOWN_VARIANTS } from '@/lib/constants/motion';
import { toUTC, formatDate } from '@/lib/utils/dates';

export interface DatePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  /**
   * When true, renders a time picker below the calendar inside the same panel.
   * Hours 1–12, Minutes [00, 15, 30, 45], AM/PM toggle. Default false (date-only).
   * showTime=false behaviour is identical to the legacy implementation.
   */
  showTime?: boolean;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 15, 30, 45];

type Meridiem = 'AM' | 'PM';

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

function snapMinuteToStep(m: number): number {
  // Round to nearest 15-min step within [0, 15, 30, 45].
  const idx = Math.round(m / 15);
  return MINUTES[Math.min(idx, MINUTES.length - 1)];
}

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
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Draft date held only while the panel is open in showTime mode — lets the user
  // pick a calendar day without committing until they also pick a time. In date-only
  // mode this state is unused; calendar selection commits and closes immediately.
  const [draftDate, setDraftDate] = React.useState<Date | null>(value ?? null);

  // Sync draft when value changes externally (parent overrides).
  useEffect(() => {
    setDraftDate(value ?? null);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Derive current time-picker state from draftDate (or value, or now).
  const seed = draftDate ?? value ?? null;
  const { hour: selHour, minute: selMinuteRaw, meridiem: selMeridiem } = useMemo(() => {
    if (seed) return to12Hour(seed);
    return { hour: 9, minute: 0, meridiem: 'AM' as Meridiem };
  }, [seed]);
  const selMinute = snapMinuteToStep(selMinuteRaw);

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

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
    >
      {/* Trigger */}
      <button
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

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="datepicker-popover"
            role="dialog"
            aria-label="Calendar"
            variants={DROPDOWN_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position:   'absolute',
              top:        'calc(100% + var(--space-1))',
              left:       0,
              zIndex:     'var(--z-dropdown)' as React.CSSProperties['zIndex'],
              boxShadow:  'var(--shadow-3)',
              borderRadius: 'var(--radius-md)',
              border:     '1px solid var(--theme-paper-border)',
              overflow:   'hidden',
              background: 'var(--theme-paper)',
            }}
          >
            <Calendar
              value={draftDate ?? value}
              onSelect={handleCalendarSelect}
              minDate={minDate}
              maxDate={maxDate}
            />

            {showTime && (
              <TimePickerSection
                hour={selHour}
                minute={selMinute}
                meridiem={selMeridiem}
                onChange={handleTimeChange}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Time picker section ──────────────────────────────────────────────────────

interface TimePickerSectionProps {
  hour: number;
  minute: number;
  meridiem: Meridiem;
  onChange: (hour: number, minute: number, meridiem: Meridiem) => void;
}

function TimePickerSection({ hour, minute, meridiem, onChange }: TimePickerSectionProps) {
  return (
    <div
      style={{
        borderTop:  '1px solid var(--theme-paper-border)',
        padding:    'var(--space-3)',
        display:    'flex',
        flexDirection: 'column',
        gap:        'var(--space-3)',
        background: 'var(--theme-paper)',
      }}
    >
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            'var(--space-2)',
          fontSize:       'var(--text-sm)',
          fontFamily:     'var(--font-sans)',
          color:          'var(--theme-text-primary)',
        }}
      >
        <ScrollColumn
          values={HOURS}
          selected={hour}
          format={(h) => String(h).padStart(2, '0')}
          onSelect={(h) => onChange(h, minute, meridiem)}
          ariaLabel="Hours"
        />
        <span
          aria-hidden="true"
          style={{
            color:      'var(--theme-text-tertiary)',
            fontSize:   'var(--text-sm)',
            lineHeight: 1,
          }}
        >
          :
        </span>
        <ScrollColumn
          values={MINUTES}
          selected={minute}
          format={(m) => String(m).padStart(2, '0')}
          onSelect={(m) => onChange(hour, m, meridiem)}
          ariaLabel="Minutes"
        />
      </div>

      <TabSelector
        variant="connected"
        indicatorLayoutId="datepicker-ampm"
        activeTab={meridiem}
        onChange={(id) => onChange(hour, minute, id as Meridiem)}
        tabs={[
          { id: 'AM', label: 'AM' },
          { id: 'PM', label: 'PM' },
        ]}
      />
    </div>
  );
}

interface ScrollColumnProps<T extends number> {
  values: readonly T[];
  selected: T;
  format: (v: T) => string;
  onSelect: (v: T) => void;
  ariaLabel: string;
}

function ScrollColumn<T extends number>({
  values,
  selected,
  format,
  onSelect,
  ariaLabel,
}: ScrollColumnProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll the selected item into view when the column mounts or selection changes.
  // Touch scroll on mobile remains native — we only nudge programmatically.
  useEffect(() => {
    const el = selectedRef.current;
    const list = listRef.current;
    if (!el || !list) return;
    const elTop = el.offsetTop;
    const target = elTop - list.clientHeight / 2 + el.clientHeight / 2;
    list.scrollTo({ top: target, behavior: 'auto' });
  }, [selected]);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={ariaLabel}
      style={{
        maxHeight:    160,
        overflowY:    'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        padding:      'var(--space-1)',
        display:      'flex',
        flexDirection: 'column',
        gap:          'var(--space-1)',
        // Hide WebKit scrollbar without affecting touch-scroll behaviour.
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {values.map((v) => {
        const isSelected = v === selected;
        return (
          <button
            key={v}
            ref={isSelected ? selectedRef : null}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(v)}
            style={{
              minWidth:     'var(--space-9)',
              padding:      'var(--space-1) var(--space-2)',
              background:   isSelected ? 'var(--theme-accent-surface)' : 'transparent',
              border:       'none',
              borderRadius: 'var(--radius-xs)',
              fontSize:     'var(--text-sm)',
              fontFamily:   'var(--font-sans)',
              fontWeight:   isSelected
                ? 'var(--weight-semibold)'
                : 'var(--weight-medium)',
              color:        isSelected
                ? 'var(--theme-accent)'
                : 'var(--theme-text-secondary)',
              cursor:       'pointer',
              textAlign:    'center',
              transition:   'var(--transition-hover)',
              lineHeight:   1.2,
            }}
          >
            {format(v)}
          </button>
        );
      })}
    </div>
  );
}
