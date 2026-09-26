'use client';

import React from 'react';

/**
 * Checkbox — THE small themed tick box (2026-09-25), promoted from the leads
 * table's private CheckboxCell so no screen falls back to the operating
 * system's blue square. A real <button role="checkbox">, so a wrapping <label>
 * toggles it, Space and Enter toggle it, and the shared keyboard outline
 * (`--neu-focus-edge`) draws on focus. Accent fill with the accent ink when
 * on; `indeterminate` draws the mixed dash.
 *
 * Pass `label` for the ordinary "box + words" row (the words take the
 * caller's colour through `labelStyle`), or render the bare box inside your
 * own <label>. For a done-state tile use CheckTile; for on/off settings use
 * Toggle. Never a native <input type="checkbox">.
 */
export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  /** Edge length in px. 16 in dense tables, 18 in forms. */
  size?: 16 | 18;
  /** Words beside the box. Without them, pass `aria-label`. */
  label?: React.ReactNode;
  'aria-label'?: string;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}

export function Checkbox({
  checked,
  onChange,
  indeterminate = false,
  disabled = false,
  size = 16,
  label,
  'aria-label': ariaLabel,
  id,
  className,
  style,
  labelStyle,
}: CheckboxProps) {
  const active = checked || indeterminate;
  const box = (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label ? undefined : ariaLabel}
      disabled={disabled}
      className={label ? undefined : className}
      onClick={(e) => {
        // Inside a clickable row (a table row that opens a record) the tick
        // must never also open the row.
        e.stopPropagation();
        onChange(!checked);
      }}
      style={{
        width:          size,
        height:         size,
        padding:        0,
        borderRadius:   'var(--radius-xs)',
        border:         `1.5px solid ${active ? 'var(--theme-accent)' : 'var(--neu-edge-strong)'}`,
        background:     active ? 'var(--theme-accent)' : 'var(--neu-input-bg)',
        boxShadow:      active ? 'none' : 'var(--neu-shadow-input)',
        cursor:         disabled ? 'not-allowed' : 'pointer',
        opacity:        disabled ? 0.55 : 1,
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        transition:     'background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)',
        ...(label ? {} : style),
      }}
    >
      {indeterminate && !checked && (
        <svg width={size / 2} height="2" viewBox="0 0 8 2" fill="none" aria-hidden="true">
          <rect x="0" y="0" width="8" height="2" rx="1" fill="var(--theme-accent-fg)" />
        </svg>
      )}
      {checked && (
        <svg width={size / 2} height={size * 0.375} viewBox="0 0 8 6" fill="none" aria-hidden="true">
          <path d="M1 3l2 2 4-4" stroke="var(--theme-accent-fg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );

  if (!label) return box;

  return (
    <label
      className={className}
      style={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        'var(--space-2)',
        fontFamily: 'var(--font-sans)',
        fontSize:   'var(--text-sm)',
        color:      'var(--theme-text-primary)',
        cursor:     disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {box}
      <span style={labelStyle}>{label}</span>
    </label>
  );
}
