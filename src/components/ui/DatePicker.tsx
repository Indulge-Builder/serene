'use client';

import React, { useRef, useEffect } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar } from './Calendar';
import { DROPDOWN_VARIANTS } from '@/lib/constants/motion';

export interface DatePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date…',
  minDate,
  maxDate,
  disabled = false,
  className,
  style,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  function handleSelect(date: Date) {
    onChange(date);
    setOpen(false);
  }

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
        {value ? formatDate(value) : placeholder}
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
            }}
          >
            <Calendar
              value={value}
              onSelect={handleSelect}
              minDate={minDate}
              maxDate={maxDate}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
