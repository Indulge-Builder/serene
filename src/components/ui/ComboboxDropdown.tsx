'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Search, X, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DROPDOWN_VARIANTS } from '@/lib/constants/motion';
import { Avatar } from './Avatar';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComboboxItem {
  id: string;
  label: string;
  sublabel?: string;
  imageUrl?: string;
}

export interface ComboboxTriggerContext {
  selected: ComboboxItem | null;
  placeholder: string;
  open: boolean;
  hovered: boolean;
  disabled: boolean;
}

export interface ComboboxDropdownProps {
  items: ComboboxItem[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Custom trigger renderer. When provided, replaces the default Avatar + label
   * inline trigger. Lets consumers (e.g. LeadInfoCard) keep a domain-specific look
   * while still benefiting from the panel + search + keyboard nav primitives.
   */
  renderTrigger?: (ctx: ComboboxTriggerContext) => React.ReactNode;
  /** Override the panel's z-index. Defaults to var(--z-dropdown). */
  zIndex?: React.CSSProperties['zIndex'];
}

// ─── Component ────────────────────────────────────────────────────────────────

const PANEL_MIN_HEIGHT = 320; // viewport-flip threshold

export function ComboboxDropdown({
  items,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled = false,
  className,
  style,
  renderTrigger,
  zIndex,
}: ComboboxDropdownProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [flipUp, setFlipUp] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => items.find((it) => it.id === value) ?? null,
    [items, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.sublabel?.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Focus input + measure viewport collision on open.
  useEffect(() => {
    if (!open) {
      setActiveIdx(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 30);

    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setFlipUp(below < PANEL_MIN_HEIGHT && rect.top > below);
    }
    return () => clearTimeout(t);
  }, [open]);

  // Clamp active index when filter shrinks the list.
  useEffect(() => {
    if (activeIdx >= filtered.length) {
      setActiveIdx(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, activeIdx]);

  // Scroll active item into view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLButtonElement>(`[data-idx="${activeIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setQuery('');
    },
    [onChange],
  );

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item) handleSelect(item.id);
    }
  }

  // ─── Default trigger ────────────────────────────────────────────────────────
  function DefaultTrigger() {
    return (
      <span
        style={{
          display:    'inline-flex',
          alignItems: 'center',
          gap:        'var(--space-2)',
          minWidth:   0,
        }}
      >
        {selected ? (
          <>
            <Avatar
              size="xs"
              name={selected.label}
              src={selected.imageUrl ?? null}
            />
            <span
              style={{
                fontSize:    'var(--text-sm)',
                fontFamily:  'var(--font-sans)',
                color:       'var(--theme-text-primary)',
                whiteSpace:  'nowrap',
                overflow:    'hidden',
                textOverflow:'ellipsis',
              }}
            >
              {selected.label}
            </span>
          </>
        ) : (
          <span
            style={{
              fontSize:   'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              color:      'var(--theme-text-tertiary)',
            }}
          >
            {placeholder}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          style={{
            width:       '0.875rem',
            height:      '0.875rem',
            strokeWidth: 1.5,
            color:       'var(--theme-text-tertiary)',
            opacity:     hovered || open ? 1 : 0,
            transform:   open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition:  `opacity var(--duration-fast) var(--ease-in-out), transform var(--duration-fast) var(--ease-in-out)`,
            flexShrink:  0,
          }}
        />
      </span>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', display: 'inline-block', ...style }}
      onKeyDown={handleKey}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background:  'transparent',
          border:      'none',
          padding:     0,
          cursor:      disabled ? 'not-allowed' : 'pointer',
          opacity:     disabled ? 0.5 : 1,
          textAlign:   'left',
          font:        'inherit',
          color:       'inherit',
          outline:     'none',
        }}
      >
        {renderTrigger
          ? renderTrigger({
              selected,
              placeholder,
              open,
              hovered,
              disabled,
            })
          : <DefaultTrigger />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="combobox-panel"
            role="listbox"
            variants={DROPDOWN_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position:     'absolute',
              ...(flipUp
                ? { bottom: 'calc(100% + var(--space-1))' }
                : { top: 'calc(100% + var(--space-1))' }),
              left:         0,
              minWidth:     220,
              maxWidth:     280,
              maxHeight:    320,
              overflowY:    'auto',
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              boxShadow:    'var(--shadow-3)',
              borderRadius: 'var(--radius-md)',
              zIndex:       (zIndex ?? 'var(--z-dropdown)') as React.CSSProperties['zIndex'],
              display:      'flex',
              flexDirection:'column',
            }}
          >
            {/* Search */}
            <div
              style={{
                position:   'sticky',
                top:        0,
                padding:    'var(--space-2)',
                background: 'var(--theme-paper)',
                borderBottom: '1px solid var(--theme-paper-border)',
              }}
            >
              <div style={{ position: 'relative' }}>
                <Search
                  aria-hidden="true"
                  style={{
                    position:    'absolute',
                    left:        'var(--space-2)',
                    top:         '50%',
                    transform:   'translateY(-50%)',
                    width:       14,
                    height:      14,
                    strokeWidth: 1.5,
                    color:       'var(--theme-text-tertiary)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                  placeholder={searchPlaceholder}
                  style={{
                    width:        '100%',
                    height:       '2rem',
                    paddingLeft:  'calc(var(--space-2) + 14px + var(--space-2))',
                    paddingRight: query ? 'calc(var(--space-2) + 14px + var(--space-2))' : 'var(--space-3)',
                    background:   'var(--theme-paper-subtle)',
                    border:       '1px solid var(--theme-paper-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-sm)',
                    color:        'var(--theme-text-primary)',
                    caretColor:   'var(--theme-accent)',
                    outline:      'none',
                    boxSizing:    'border-box',
                  }}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                    aria-label="Clear search"
                    style={{
                      position:    'absolute',
                      right:       'var(--space-2)',
                      top:         '50%',
                      transform:   'translateY(-50%)',
                      background:  'transparent',
                      border:      'none',
                      cursor:      'pointer',
                      padding:     0,
                      display:     'flex',
                      alignItems:  'center',
                      color:       'var(--theme-text-tertiary)',
                    }}
                  >
                    <X style={{ width: 12, height: 12, strokeWidth: 1.5 }} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div ref={listRef} style={{ padding: 'var(--space-1)' }}>
              {filtered.length === 0 ? (
                <p
                  style={{
                    textAlign:  'center',
                    padding:    'var(--space-6) var(--space-3)',
                    fontFamily: 'var(--font-sans)',
                    fontSize:   'var(--text-sm)',
                    color:      'var(--theme-text-tertiary)',
                    margin:     0,
                  }}
                >
                  No results
                </p>
              ) : (
                filtered.map((item, idx) => {
                  const isSelected = item.id === value;
                  const isActive = idx === activeIdx;
                  return (
                    <button
                      key={item.id}
                      data-idx={idx}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(item.id)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      style={{
                        display:      'flex',
                        alignItems:   'center',
                        gap:          'var(--space-2)',
                        width:        '100%',
                        height:       36,
                        padding:      '0 var(--space-2)',
                        background:   isActive ? 'var(--theme-paper-subtle)' : 'transparent',
                        border:       'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor:       'pointer',
                        textAlign:    'left',
                        transition:   `background-color var(--duration-fast) var(--ease-in-out)`,
                      }}
                    >
                      <Avatar size="xs" name={item.label} src={item.imageUrl ?? null} />
                      <span
                        style={{
                          display:       'flex',
                          flexDirection: 'column',
                          flex:          1,
                          minWidth:      0,
                          lineHeight:    1.2,
                        }}
                      >
                        <span
                          style={{
                            fontSize:    'var(--text-sm)',
                            fontFamily:  'var(--font-sans)',
                            color:       'var(--theme-text-primary)',
                            whiteSpace:  'nowrap',
                            overflow:    'hidden',
                            textOverflow:'ellipsis',
                          }}
                        >
                          {item.label}
                        </span>
                        {item.sublabel && (
                          <span
                            style={{
                              fontSize:    'var(--text-xs)',
                              fontFamily:  'var(--font-sans)',
                              color:       'var(--theme-text-secondary)',
                              whiteSpace:  'nowrap',
                              overflow:    'hidden',
                              textOverflow:'ellipsis',
                            }}
                          >
                            {item.sublabel}
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <Check
                          aria-hidden="true"
                          style={{
                            width:       14,
                            height:      14,
                            strokeWidth: 2,
                            color:       'var(--theme-accent)',
                            flexShrink:  0,
                          }}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
