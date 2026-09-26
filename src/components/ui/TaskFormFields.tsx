'use client';

/**
 * TaskFormFields — THE shared task-creation form field primitives (dry-audit H-3 + L-4).
 *
 * Every task-creation surface composes these instead of re-expressing them:
 *   FieldLabel       — micro form label (.label-micro + block + margin)
 *   FieldError       — inline danger error line
 *   FormChip         — generic pill chip (presets, priorities)
 *   PriorityChipRow  — Urgent / High / Normal row from TASK_PRIORITY
 *                      ('chip' labelled pills, or 'dot' compact 20px circles)
 *   DueDateField     — label + optional IST preset chips + DatePicker
 *   resolveDueAt     — preset/date → UTC ISO via toISTEndOfDay (lib/utils/ist.ts)
 *   TaskTypeField    — TASK_TYPES radio-row list
 *
 * Used by: CreatePersonalTaskModal, CreateGroupTaskModal, CreateGiaTaskModal,
 * leads/CreateLeadTaskModal. Never re-implement a priority chip, due-preset chip,
 * or task-type radio list inline — extend this file.
 */

import { SelectionButton } from '@/components/ui/SelectionButton';
import { DatePicker } from '@/components/ui/DatePicker';
import { TASK_PRIORITY } from '@/lib/constants/task-constants';
import { TASK_TYPES, TASK_TYPE_LABELS } from '@/lib/constants/task-types';
import { toISTEndOfDay } from '@/lib/utils/ist';
import type { TaskPriority, TaskType } from '@/lib/types/database';

// ─── Field label ───────────────────────────────────────────────────────────────

export function FieldLabel({
  children,
  optional,
  required,
  style,
}: {
  children:  React.ReactNode;
  optional?: boolean;
  required?: boolean;
  style?:    React.CSSProperties;
}) {
  return (
    <span
      className="label-micro"
      style={{ display: 'block', marginBottom: 'var(--space-1)', ...style }}
    >
      {children}
      {required && <span style={{ color: "var(--color-danger-text)" }}> *</span>}
      {optional && (
        <span style={{ fontWeight: 'var(--weight-normal)', textTransform: 'none', letterSpacing: 0 }}>
          {' '}(optional)
        </span>
      )}
    </span>
  );
}

// ─── Inline error ──────────────────────────────────────────────────────────────

export function FieldError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p
      style={{
        fontFamily:   'var(--font-sans)',
        fontSize:     'var(--text-xs)',
        color:        "var(--color-danger-text)",
        marginTop:    'var(--space-1)',
        marginBottom: 0,
      }}
    >
      {message}
    </p>
  );
}

// ─── Pill chip ─────────────────────────────────────────────────────────────────
// Generic toggle chip. `color` switches the active treatment from accent to a
// semantic token (priority chips pass TASK_PRIORITY colours).

export function FormChip({
  label,
  active,
  color,
  onClick,
  disabled,
}: {
  label:     string;
  active:    boolean;
  color?:    string;
  onClick:   () => void;
  disabled?: boolean;
}) {
  return (
    <SelectionButton
      tone={color ? { fill: `color-mix(in srgb, ${color} 12%, var(--neu-surface))`, ink: 'var(--neu-text-primary)' } : undefined}
      appearance="choice"
      selected={active}
      aria-pressed={active}
      type="button"
      className="serene-touch"
      onClick={onClick}
      disabled={disabled}
      style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 28,
              padding: '0 var(--space-3)',
              fontSize: 'var(--text-xs)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
          }}
    >
      {label}
    </SelectionButton>
  );
}

// ─── Priority chip row ─────────────────────────────────────────────────────────

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal'];

export function PriorityChipRow({
  value,
  onChange,
  disabled,
  deselectNonNormal,
  variant = 'chip',
}: {
  value:    TaskPriority;
  onChange: (p: TaskPriority) => void;
  disabled?: boolean;
  /** Clicking the active urgent/high chip falls back to 'normal' (Normal itself never deselects). */
  deselectNonNormal?: boolean;
  /** 'chip' = labelled pills; 'dot' = compact 20px circles for inline rows. */
  variant?: 'chip' | 'dot';
}) {
  function handleClick(p: TaskPriority) {
    if (deselectNonNormal && value === p && p !== 'normal') {
      onChange('normal');
    } else {
      onChange(p);
    }
  }

  if (variant === 'dot') {
    return (
      <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
        {PRIORITIES.map((p) => {
          const cfg      = TASK_PRIORITY[p];
          const isActive = value === p;
          return (
            <button
              key={p}
              type="button"
              title={cfg.label}
              aria-pressed={isActive}
              aria-label={cfg.label}
              disabled={disabled}
              className="serene-touch-hit"
              onClick={() => handleClick(p)}
              style={{
                width:          20,
                height:         20,
                borderRadius:   'var(--radius-full)',
                border:         '1.5px solid var(--theme-paper-border)',
                background:     isActive ? `color-mix(in srgb, ${cfg.color} 14%, var(--neu-surface))` : 'transparent',
                boxShadow:      isActive ? 'var(--neu-shadow-chip)' : 'none',
                cursor:         disabled ? 'not-allowed' : 'pointer',
                flexShrink:     0,
                transition:     'var(--transition-hover)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
              }}
            >
              {isActive && (
                <span
                  style={{
                    width:        6,
                    height:       6,
                    borderRadius: 'var(--radius-full)',
                    background:   cfg.color,
                    display:      'block',
                    flexShrink:   0,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      {PRIORITIES.map((p) => (
        <FormChip
          key={p}
          label={TASK_PRIORITY[p].label}
          active={value === p}
          color={TASK_PRIORITY[p].color}
          disabled={disabled}
          onClick={() => handleClick(p)}
        />
      ))}
    </div>
  );
}

// ─── Due date field ────────────────────────────────────────────────────────────

export type DuePreset = 'today' | 'tomorrow' | 'next-week';

const DUE_PRESETS: { id: DuePreset; label: string; dayOffset: number }[] = [
  { id: 'today',     label: 'Today',     dayOffset: 0 },
  { id: 'tomorrow',  label: 'Tomorrow',  dayOffset: 1 },
  { id: 'next-week', label: 'Next week', dayOffset: 7 },
];

// IST has no DST, so adding whole days in absolute time lands on the right
// IST calendar day; toISTEndOfDay() owns the boundary math (dry-audit H-7).
export function resolveDueAt(preset: DuePreset | null, date: Date | null): string | null {
  if (date) return date.toISOString();
  if (!preset) return null;
  const offset = DUE_PRESETS.find((p) => p.id === preset)!.dayOffset;
  return toISTEndOfDay(new Date(Date.now() + offset * 24 * 60 * 60 * 1000)).toISOString();
}

export function DueDateField({
  label = 'Due date',
  optional,
  preset,
  onPresetChange,
  date,
  onDateChange,
  showTime = true,
  placeholder,
  disabled,
  pickerStyle,
}: {
  label?:    string;
  optional?: boolean;
  /** Pass preset + onPresetChange to render the Today / Tomorrow / Next week chips. */
  preset?:         DuePreset | null;
  onPresetChange?: (p: DuePreset | null) => void;
  date:            Date | null;
  onDateChange:    (d: Date | null) => void;
  showTime?:       boolean;
  placeholder?:    string;
  disabled?:       boolean;
  /** Forwarded to the DatePicker trigger (e.g. width: 100% inside grids). */
  pickerStyle?:    React.CSSProperties;
}) {
  const hasPresets = onPresetChange !== undefined;

  return (
    <div>
      <FieldLabel optional={optional}>{label}</FieldLabel>

      {hasPresets && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
          {DUE_PRESETS.map((p) => (
            <FormChip
              key={p.id}
              label={p.label}
              active={preset === p.id}
              disabled={disabled}
              onClick={() => {
                // Toggling a preset clears the specific date; they are mutually exclusive.
                onPresetChange(preset === p.id ? null : p.id);
                onDateChange(null);
              }}
            />
          ))}
        </div>
      )}

      <DatePicker
        value={date}
        onChange={(d) => {
          onDateChange(d);
          if (d) onPresetChange?.(null);
        }}
        showTime={showTime}
        placeholder={placeholder}
        disabled={disabled}
        style={pickerStyle}
        aria-label={label}
      />
    </div>
  );
}

// ─── Task type field ───────────────────────────────────────────────────────────
// RadioGroup-style row list over TASK_TYPES / TASK_TYPE_LABELS.

export function TaskTypeField({
  value,
  onChange,
  disabled,
}: {
  value:    TaskType;
  onChange: (t: TaskType) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {TASK_TYPES.map((type) => (
        <label
          key={type}
          className="serene-radio-row"
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-3)',
            cursor:       disabled ? 'not-allowed' : 'pointer',
            padding:      'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            // Selected row FLOATS on an accent wash + chip shadow (never a coloured border).
            background:   value === type
              ? 'color-mix(in srgb, var(--theme-accent) 12%, var(--neu-surface))'
              : 'var(--theme-paper-subtle)',
            border:     '1px solid var(--theme-paper-border)',
            boxShadow:  value === type ? 'var(--neu-shadow-chip)' : 'none',
            opacity:    disabled ? 0.6 : 1,
            transition: 'background var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)',
          }}
        >
          {/* The native radio stays for the keyboard (arrow keys walk the group)
              but is visually hidden; the dot beside it is drawn in the theme. */}
          <input
            type="radio"
            name="taskType"
            value={type}
            checked={value === type}
            disabled={disabled}
            onChange={() => onChange(type)}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            style={{
              width:          16,
              height:         16,
              borderRadius:   'var(--radius-full)',
              border:         `1.5px solid ${value === type ? 'var(--theme-accent)' : 'var(--neu-edge-strong)'}`,
              background:     'var(--neu-input-bg)',
              boxShadow:      'var(--neu-shadow-input)',
              display:        'grid',
              placeItems:     'center',
              flexShrink:     0,
              transition:     'border-color var(--duration-fast) var(--ease-in-out)',
            }}
          >
            {value === type && (
              <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--theme-accent)' }} />
            )}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-sm)',
              color:      value === type
                ? 'var(--neu-accent-deep)'
                : 'var(--theme-text-primary)',
              fontWeight: value === type ? 'var(--weight-semibold)' : 'var(--weight-normal)',
            }}
          >
            {TASK_TYPE_LABELS[type]}
          </span>
        </label>
      ))}
    </div>
  );
}
