'use client';

import React, { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
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
  /** Stretch trigger to container width (form fields) */
  fullWidth?: boolean;
  /** Portal menu to document.body — use inside modals to avoid overflow clipping */
  menuPortal?: boolean;
  /** Hide the numeric active-count badge on the trigger (form selects) */
  hideCountBadge?: boolean;
  /** When false, open state does not switch trigger border to accent (filter bars). */
  accentBorderOnOpen?: boolean;
}

const MENU_ITEM_HEIGHT = 36;
const MENU_PADDING = 8;
const CLEAR_FOOTER_HEIGHT = 40;
/** Cap scroll region so long lists don't flip above the trigger while siblings open below */
const MAX_MENU_SCROLL_HEIGHT = 240;

export function FilterDropdown({
  label,
  icon: TriggerIcon,
  items,
  selected,
  onChange,
  multi = false,
  className,
  style,
  fullWidth = false,
  menuPortal = false,
  hideCountBadge = false,
  accentBorderOnOpen = true,
}: FilterDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, minWidth: 180 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef   = useRef<HTMLButtonElement>(null);
  const menuRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearFooterHeight = selected.length > 0 ? CLEAR_FOOTER_HEIGHT : 0;
  const scrollRegionHeight = Math.min(
    items.length * MENU_ITEM_HEIGHT,
    MAX_MENU_SCROLL_HEIGHT,
  );
  const menuHeight = scrollRegionHeight + clearFooterHeight + MENU_PADDING;

  const updateMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const measuredH = menuRef.current?.offsetHeight ?? menuHeight;
    const menuW = Math.max(180, rect.width);
    const vvLeft = window.visualViewport?.offsetLeft ?? 0;
    const vvTop  = window.visualViewport?.offsetTop  ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom;
    // Prefer opening below; only flip when the capped panel cannot fit underneath.
    const flipUp = spaceBelow < measuredH + 8 && rect.top > spaceBelow;
    const top = flipUp
      ? rect.top - 4 - measuredH
      : rect.bottom + 4;
    const flipLeft = rect.left + menuW > window.innerWidth - 8;
    const left = (flipLeft ? rect.right - menuW : rect.left) - vvLeft;

    setMenuPos({
      top:  top - vvTop,
      left,
      minWidth: menuW,
    });
  }, [menuHeight]);

  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function reposition() { updateMenuPosition(); }

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
    };
  }, [open, updateMenuPosition]);

  useLayoutEffect(() => {
    if (!open || !menuPortal) return;
    updateMenuPosition();
    const id = requestAnimationFrame(() => updateMenuPosition());
    return () => cancelAnimationFrame(id);
  }, [open, menuPortal, updateMenuPosition, items.length, selected.length]);

  function toggleItem(id: string) {
    if (multi) {
      onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else if (selected.includes(id)) {
      setOpen(false);
    } else {
      onChange([id]);
      setOpen(false);
    }
  }

  const activeCount = selected.length;
  const showCountBadge = activeCount > 0 && !hideCountBadge;
  const triggerAccentBorder =
    activeCount > 0 || (accentBorderOnOpen && open);

  const menuPanelStyle: React.CSSProperties = menuPortal
    ? {
        position:       'fixed',
        top:            menuPos.top,
        left:           menuPos.left,
        minWidth:       menuPos.minWidth,
        background:     'var(--theme-paper)',
        border:         '1px solid var(--theme-paper-border)',
        borderRadius:   'var(--radius-md)',
        boxShadow:      'var(--shadow-3)',
        zIndex:         'var(--z-modal-nested)' as React.CSSProperties['zIndex'],
        overflow:       'hidden',
        display:        'flex',
        flexDirection:  'column',
      }
    : {
        position:       'absolute',
        top:            'calc(100% + var(--space-1))',
        left:           0,
        minWidth:       180,
        background:     'var(--theme-paper)',
        border:         '1px solid var(--theme-paper-border)',
        borderRadius:   'var(--radius-md)',
        boxShadow:      'var(--shadow-3)',
        zIndex:         'var(--z-dropdown)' as React.CSSProperties['zIndex'],
        overflow:       'hidden',
        display:        'flex',
        flexDirection:  'column',
      };

  const menuItems = items.map((item) => {
        const isSelected = selected.includes(item.id);
        const ItemIcon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
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
  });

  const clearFooter = activeCount > 0 ? (
    <>
      <div
        role="separator"
        style={{
          height:     1,
          background: 'var(--theme-paper-border)',
          flexShrink: 0,
        }}
      />
      <div
        style={{
          display:        'flex',
          justifyContent: 'flex-end',
          padding:        'var(--space-1) var(--space-3)',
          flexShrink:     0,
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
            background: 'none',
            border:     'none',
            padding:    0,
            fontSize:   'var(--text-xs)',
            fontFamily: 'var(--font-sans)',
            color:      'var(--theme-text-tertiary)',
            cursor:     'pointer',
            transition: 'var(--transition-hover)',
          }}
        >
          Clear
        </button>
      </div>
    </>
  ) : null;

  const menuBody = (
    <>
      <div
        style={{
          overflowY:  'auto',
          maxHeight:  MAX_MENU_SCROLL_HEIGHT,
          padding:    'var(--space-1) 0',
          flexShrink: 1,
          minHeight:  0,
        }}
      >
        {menuItems}
      </div>
      {clearFooter}
    </>
  );

  const menuPopover = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          key="filter-menu"
          role="listbox"
          aria-multiselectable={multi}
          variants={DROPDOWN_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={menuPanelStyle}
        >
          {menuBody}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        display:  fullWidth ? 'flex' : 'inline-flex',
        width:    fullWidth ? '100%' : undefined,
        minWidth: 0,
        ...style,
      }}
    >
      <button
        ref={triggerRef}
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
          border:         `1px solid ${triggerAccentBorder ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
          borderRadius:   'var(--radius-md)',
          fontSize:       'var(--text-sm)',
          fontFamily:     'var(--font-sans)',
          fontWeight:     'var(--weight-medium)',
          color:          activeCount > 0 ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
          cursor:         'pointer',
          transition:     'var(--transition-hover), border-color var(--duration-fast) var(--ease-in-out)',
          whiteSpace:     'nowrap',
          outline:        'none',
          width:          fullWidth ? '100%' : undefined,
          minWidth:       fullWidth ? 0 : undefined,
          justifyContent: fullWidth ? 'space-between' : undefined,
        }}
      >
        <span
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          'var(--space-2)',
            minWidth:     0,
            flex:         fullWidth ? 1 : undefined,
            overflow:     'hidden',
          }}
        >
          {TriggerIcon && (
            <TriggerIcon style={{ width: 14, height: 14, strokeWidth: 1.5, flexShrink: 0 }} aria-hidden="true" />
          )}
          <span
            style={{
              overflow:     'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </span>
          {showCountBadge && (
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
                flexShrink:     0,
              }}
            >
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown
          style={{
            width:       14,
            height:      14,
            strokeWidth: 1.5,
            flexShrink:  0,
            transform:   open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition:  'transform var(--duration-fast) var(--ease-in-out)',
          }}
          aria-hidden="true"
        />
      </button>

      {menuPortal
        ? (mounted ? createPortal(menuPopover, document.body) : null)
        : menuPopover}
    </div>
  );
}
