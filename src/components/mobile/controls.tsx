'use client';

import { SelectionButton } from '@/components/ui/SelectionButton';
import { IconKnob } from './buttons';
import type { ReactNode } from 'react';
import { Check, ChevronRight, Minus, Plus, type LucideIcon } from 'lucide-react';

/**
 * Mobile row controls & selection grammar (§02–03).
 * Segmented: inset well track + raised surface thumb (44 cells).
 * Filter chips: 38 pills — selected sinks slightly into the accent
 * wash with an accent border + check; unselected floats raised-sm.
 * Setting rows: 64 r22 on surface-high, with toggle (54×32),
 * stepper (40Ø knobs, Playfair count) or disclosure.
 */

export function MobileSegmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: number;
  onChange: (index: number) => void;
}) {
  return (
    <div
      className="flex gap-1.5 p-[7px] rounded-full"
      style={{ background: 'var(--neu-well)', boxShadow: 'var(--neu-shadow-inset)' }}
      role="tablist"
    >
      {options.map((label, i) => {
        const active = i === value;
        return (
          <button
            key={label}
            type="button"
            role="tab"
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (i + ((event.key === 'ArrowRight') !== rtl ? 1 : -1) + options.length) % options.length;
              onChange(next);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            }}
            aria-selected={active}
            onClick={() => onChange(i)}
            className="neu-m-touch-quiet relative flex-1 h-11 rounded-full flex items-center justify-center"
          >
            {active && (
              <span
                className="absolute inset-0 rounded-full border border-(--neu-edge-strong)"
                style={{
                  background: 'var(--neu-tab-active-bg)',
                  boxShadow: 'var(--neu-shadow-tab-active)',
                }}
              />
            )}
            <span
              className={`relative text-[13px] ${
                active
                  ? 'font-semibold text-(--neu-text-primary)'
                  : 'font-medium text-(--neu-text-tertiary)'
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function FilterChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <SelectionButton
      appearance="choice" selected={selected}
      onClick={onToggle}
      aria-pressed={selected}
      className={`neu-m-touch-quiet h-[38px] px-4 rounded-full flex items-center gap-1.5 shrink-0 ${
        selected
          ? 'bg-(--neu-accent-wash) border border-(--neu-accent) text-xs font-semibold text-(--neu-accent-deep)'
          : 'bg-(--neu-surface) border border-(--neu-edge) text-xs font-medium text-(--neu-text-secondary)'
      }`}
    >
      {selected && <Check size={11} strokeWidth={2.4} />}
      {label}
    </SelectionButton>
  );
}

/** Setting row shell — 64 min, r22, surface-high, raised-sm. */
export function SettingRow({
  title,
  sub,
  icon: Icon,
  iconToken,
  children,
  onClick,
}: {
  title: string;
  sub?: string;
  icon?: LucideIcon;
  iconToken?: string;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`flex items-center justify-between gap-3 min-h-16 px-4 py-2.5 rounded-[22px] bg-(--neu-surface-high) border border-(--neu-edge) w-full text-left ${
        onClick ? 'neu-m-touch-quiet' : ''
      }`}
      style={{ boxShadow: 'var(--neu-shadow-raised-sm)' }}
    >
      <span className="flex items-center gap-3 min-w-0">
        {Icon && (
          <span
            className="w-[38px] h-[38px] shrink-0 rounded-[13px] bg-(--neu-surface) flex items-center justify-center"
            style={{
              color: iconToken ?? 'var(--neu-text-secondary)',
              boxShadow: 'var(--neu-shadow-raised-sm)',
            }}
          >
            <Icon size={15} strokeWidth={1.7} />
          </span>
        )}
        <span className="flex flex-col gap-px min-w-0">
          <span className="text-[13.5px] font-semibold text-(--neu-text-primary)">{title}</span>
          {sub && <span className="text-[11.5px] text-(--neu-text-tertiary)">{sub}</span>}
        </span>
      </span>
      {children ??
        (onClick && (
          <ChevronRight size={13} strokeWidth={2} className="shrink-0 text-(--neu-text-tertiary)" />
        ))}
    </Tag>
  );
}

/** Toggle — 54×32 inset track; on = accent wash track + accent knob at 26. */
export function MobileToggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-[54px] h-8 shrink-0 rounded-full transition-colors duration-[220ms] ${
        on ? 'bg-(--neu-accent-wash)' : 'bg-(--neu-well)'
      }`}
      style={{ boxShadow: 'var(--neu-shadow-inset)' }}
    >
      <span
        className="absolute top-1 w-6 h-6 rounded-full"
        style={{
          left: on ? 26 : 4,
          transition: 'left 220ms cubic-bezier(0.34, 1.3, 0.64, 1)',
          background: on ? 'var(--neu-accent-gradient)' : 'var(--neu-surface)',
          boxShadow: 'var(--neu-shadow-knob)',
        }}
      />
    </button>
  );
}

/** Stepper — 40Ø knobs, Playfair count, min 1 / max 9. */
export function MobileStepper({
  value,
  onChange,
  min = 1,
  max = 9,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <span className="flex items-center gap-3.5 shrink-0">
      <IconKnob size={40}
        aria-label="Fewer"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus size={14} strokeWidth={1.8} />
      </IconKnob>
      <span
        className="min-w-[18px] text-center text-xl font-semibold text-(--neu-text-primary)"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {value}
      </span>
      <IconKnob size={40}
        aria-label="More"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus size={14} strokeWidth={1.8} />
      </IconKnob>
    </span>
  );
}
