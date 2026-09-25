'use client';

import { useModalScope } from '@/hooks/useModalFocus';
import { SelectionButton } from '@/components/ui/SelectionButton';
import { Button } from '@/components/ui/Button';
import { filterTriggerStyle } from './material-styles';

import React, { useRef, useEffect, useLayoutEffect, useCallback, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { DROPDOWN_VARIANTS } from '@/lib/constants/motion';

export interface FilterDropdownItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

export interface FilterDropdownProps {
  label: string;
  disabled?: boolean;
  clearable?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  invalid?: boolean;
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
  /**
   * Collapse the trigger to a square icon-only button (label + chevron hidden;
   * `icon` required). When something is selected, an accent dot replaces the
   * numeric count badge. The menu still opens with full text labels. Used on
   * mobile where the labelled trigger has no room (e.g. the domain selector).
   * `aria-label` is taken from `label` so the control stays accessible.
   */
  iconOnly?: boolean;
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
  iconOnly = false,
  disabled = false,
  clearable = true,
  ariaLabel,
  ariaDescribedBy,
  invalid = false,
}: FilterDropdownProps) {
  const modalScope = useModalScope();
  const menuId = useId();
  const [requestedOpen, setOpen] = React.useState(false);
  const open = requestedOpen && !disabled;
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, minWidth: 180 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef   = useRef<HTMLButtonElement>(null);
  const menuRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus the selected option (or first option) on open. Keep keyboard focus
  // attached to the trigger after selection/Escape, including portaled menus.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const selectedOption = menuRef.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]');
      (selectedOption ?? menuRef.current?.querySelector<HTMLButtonElement>('[role="option"]'))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  const clearFooterHeight = clearable && selected.length > 0 ? CLEAR_FOOTER_HEIGHT : 0;
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
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
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
      closeMenu();
    } else {
      onChange([id]);
      closeMenu();
    }
  }

  const activeCount = selected.length;
  const showCountBadge = activeCount > 0 && !hideCountBadge;

  const menuPanelStyle: React.CSSProperties = menuPortal
    ? {
        position:       'fixed',
        top:            menuPos.top,
        left:           menuPos.left,
        minWidth:       menuPos.minWidth,
        background:     'var(--neu-surface-high)',
        border:         '1px solid var(--neu-edge)',
        borderRadius:   'var(--neu-radius-panel)',
        boxShadow:      'var(--neu-shadow-raised-lg)',
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
        background:     'var(--neu-surface-high)',
        border:         '1px solid var(--neu-edge)',
        borderRadius:   'var(--neu-radius-panel)',
        boxShadow:      'var(--neu-shadow-raised-lg)',
        zIndex:         'var(--z-dropdown)' as React.CSSProperties['zIndex'],
        overflow:       'hidden',
        display:        'flex',
        flexDirection:  'column',
      };

  const menuItems = items.map((item) => {
        const isSelected = selected.includes(item.id);
        const ItemIcon = item.icon;
        return (
          <SelectionButton
            appearance="option"
            selected={isSelected}
            key={item.id}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={isSelected}
            onClick={() => toggleItem(item.id)}
            style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    width: 'calc(100% - var(--space-2))',
                    margin: '0 var(--space-1)',
                    padding: 'var(--space-2) var(--space-2)',
                    fontSize: 'var(--text-sm)',
                    textAlign: 'left',
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
                  border:         `1px solid ${isSelected ? 'transparent' : 'var(--neu-edge-strong)'}`,
                  borderRadius:   'var(--radius-xs)',
                  background:     isSelected ? 'var(--neu-accent-gradient)' : 'var(--neu-surface)',
                  boxShadow:      isSelected ? 'var(--neu-shadow-chip)' : 'var(--neu-shadow-raised-sm)',
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
          </SelectionButton>
        );
  });

  const clearFooter = clearable && activeCount > 0 ? (
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
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => {
                  onChange([]);
                  if (!multi)
                      closeMenu();
              }}
        >
          Clear
        </Button>
      </div>
    </>
  ) : null;

  const menuBody = (
    <>
      <div
        role="listbox"
        aria-invalid={invalid || undefined}
        id={menuId}
        aria-label={label}
        aria-multiselectable={multi}
        style={{
          overflowY:  'auto',
          maxHeight:  MAX_MENU_SCROLL_HEIGHT,
          padding:    'var(--space-1) 0',
          flexShrink: 1,
          minHeight:  0,
        }}
      >
        {menuItems.length ? menuItems : <p className="serene-field-hint" style={{ padding: 'var(--space-3)' }}>No options available.</p>}
      </div>
      {clearFooter}
    </>
  );

  const menuPopover = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          data-modal-owner={modalScope}
          key="filter-menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeMenu();
              return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
            const index = options.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            event.preventDefault();
            options[next]?.focus();
          }}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (!event.currentTarget.contains(next) && !triggerRef.current?.contains(next)) setOpen(false);
          }}
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
        // Chips never shrink in a flex row — required for FilterBar's nowrap
        // scroll layout (mobile + leads), where shrinking items would crush
        // instead of overflowing into the horizontal scroll.
        flexShrink: fullWidth ? undefined : 0,
        ...style,
      }}
    >
      <button
        ref={triggerRef}
        disabled={disabled}
        data-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="serene-filter-trigger"
        aria-label={ariaLabel ?? (iconOnly ? label : undefined)}
        title={iconOnly ? label : undefined}
        style={{
          position:       iconOnly ? 'relative' : undefined,
          display:        'inline-flex',
          alignItems:     'center',
          gap:            iconOnly ? 0 : 'var(--space-2)',
          height:         '2.25rem',
          width:          iconOnly ? '2.25rem' : (fullWidth ? '100%' : undefined),
          padding:        iconOnly ? 0 : 'var(--space-1) var(--space-3)',
          ...filterTriggerStyle(activeCount > 0),
          fontSize:       'var(--text-sm)',
          fontFamily:     'var(--font-sans)',
          fontWeight:     'var(--weight-medium)',
          cursor:         disabled ? 'not-allowed' : 'pointer',
          opacity:        disabled ? 0.6 : 1,
          transition:     'var(--transition-hover), border-color var(--duration-fast) var(--ease-in-out)',
          whiteSpace:     'nowrap',
          outline:        'none',
          minWidth:       fullWidth && !iconOnly ? 0 : undefined,
          justifyContent: iconOnly ? 'center' : (fullWidth ? 'space-between' : undefined),
        }}
      >
        {iconOnly ? (
          <>
            {TriggerIcon && (
              <TriggerIcon style={{ width: 16, height: 16, strokeWidth: 1.5, flexShrink: 0 }} aria-hidden="true" />
            )}
            {/* Accent dot replaces the numeric count — "a domain is scoped". */}
            {showCountBadge && (
              <span
                aria-hidden="true"
                style={{
                  position:     'absolute',
                  top:          4,
                  right:        4,
                  width:        6,
                  height:       6,
                  borderRadius: 'var(--radius-full)',
                  background:   'var(--theme-accent)',
                }}
              />
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </button>

      {menuPortal
        ? (mounted ? createPortal(menuPopover, document.body) : null)
        : menuPopover}
    </div>
  );
}
