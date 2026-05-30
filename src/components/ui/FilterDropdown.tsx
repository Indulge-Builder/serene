'use client';

import React, { useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DROPDOWN_VARIANTS } from '@/lib/constants/motion';

export interface FilterDropdownItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

export interface FilterDropdownProps {
  label: string;
  icon?: LucideIcon;
  items: FilterDropdownItem[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Allow selecting multiple items */
  multi?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function FilterDropdown({
  label,
  icon: TriggerIcon,
  items,
  selected,
  onChange,
  multi = false,
  className,
  style,
}: FilterDropdownProps) {
  const [open, setOpen] = React.useState(false);
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

  function toggleItem(id: string) {
    if (multi) {
      onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else {
      onChange(selected.includes(id) ? [] : [id]);
      setOpen(false);
    }
  }

  const activeCount = selected.length;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
    >
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            'var(--space-2)',
          height:         '2.25rem',
          padding:        'var(--space-1) var(--space-3)',
          background:     activeCount > 0 ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
          // Open state OR active state → accent border. Color transition lifted onto
          // border-color explicitly so the open→closed change animates per spec.
          border:         `1px solid ${(open || activeCount > 0) ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
          borderRadius:   'var(--radius-md)',
          fontSize:       'var(--text-sm)',
          fontFamily:     'var(--font-sans)',
          fontWeight:     'var(--weight-medium)',
          color:          activeCount > 0 ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
          cursor:         'pointer',
          transition:     'var(--transition-hover), border-color var(--duration-fast) var(--ease-in-out)',
          whiteSpace:     'nowrap',
          outline:        'none',
        }}
      >
        {TriggerIcon && (
          <TriggerIcon style={{ width: 14, height: 14, strokeWidth: 1.5 }} aria-hidden="true" />
        )}
        {label}
        {activeCount > 0 && (
          <span
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              minWidth:       18,
              height:         18,
              padding:        '0 var(--space-1)',
              borderRadius:   'var(--radius-full)',
              background:     'var(--theme-accent)',
              color:          'var(--theme-accent-fg)',
              fontSize:       'var(--text-2xs)',
              fontWeight:     'var(--weight-semibold)',
              lineHeight:     1,
            }}
          >
            {activeCount}
          </span>
        )}
        <ChevronDown
          style={{
            width:      14,
            height:     14,
            strokeWidth: 1.5,
            transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform var(--duration-fast) var(--ease-in-out)',
          }}
          aria-hidden="true"
        />
      </button>

      {/* Menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="filter-menu"
            role="listbox"
            aria-multiselectable={multi}
            variants={DROPDOWN_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position:   'absolute',
              top:        'calc(100% + var(--space-1))',
              left:       0,
              minWidth:   180,
              background: 'var(--theme-paper)',
              border:     '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow:  'var(--shadow-3)',
              zIndex:     'var(--z-dropdown)' as React.CSSProperties['zIndex'],
              overflow:   'hidden',
              padding:    'var(--space-1) 0',
            }}
          >
            {items.map((item) => {
              const isSelected = selected.includes(item.id);
              const ItemIcon = item.icon;
              return (
                <button
                  key={item.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggleItem(item.id)}
                  style={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         'var(--space-2)',
                    width:       '100%',
                    padding:     'var(--space-2) var(--space-3)',
                    background:  isSelected ? 'var(--theme-accent-surface)' : 'transparent',
                    border:      'none',
                    fontSize:    'var(--text-sm)',
                    fontFamily:  'var(--font-sans)',
                    color:       isSelected ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
                    cursor:      'pointer',
                    textAlign:   'left',
                    transition:  'var(--transition-hover)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--theme-paper-subtle)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    }
                  }}
                >
                  {multi ? (
                    <span
                      style={{
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        width:          16,
                        height:         16,
                        border:         `1px solid ${isSelected ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
                        borderRadius:   'var(--radius-xs)',
                        background:     isSelected ? 'var(--theme-accent)' : 'var(--theme-paper)',
                        flexShrink:     0,
                      }}
                    >
                      {isSelected && (
                        <Check style={{ width: 10, height: 10, strokeWidth: 2.5, color: 'var(--theme-accent-fg)' }} />
                      )}
                    </span>
                  ) : (
                    ItemIcon && (
                      <ItemIcon
                        style={{ width: 14, height: 14, strokeWidth: 1.5, flexShrink: 0 }}
                        aria-hidden="true"
                      />
                    )
                  )}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {!multi && isSelected && (
                    <Check style={{ width: 14, height: 14, strokeWidth: 2, flexShrink: 0 }} aria-hidden="true" />
                  )}
                </button>
              );
            })}

            {activeCount > 0 && (
              <>
                <div
                  role="separator"
                  style={{
                    height:          1,
                    background:      'var(--theme-paper-border)',
                    margin:          'var(--space-1) 0',
                  }}
                />
                <div
                  style={{
                    display:         'flex',
                    justifyContent:  'flex-end',
                    padding:         'var(--space-1) var(--space-3)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onChange([]);
                      if (!multi) setOpen(false);
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-accent)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-text-tertiary)';
                    }}
                    style={{
                      background:    'none',
                      border:        'none',
                      padding:       0,
                      fontSize:      'var(--text-xs)',
                      fontFamily:    'var(--font-sans)',
                      color:         'var(--theme-text-tertiary)',
                      cursor:        'pointer',
                      transition:    'var(--transition-hover)',
                    }}
                  >
                    Clear
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
