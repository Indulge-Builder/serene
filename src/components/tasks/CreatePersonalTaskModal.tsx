'use client';

/**
 * CreatePersonalTaskModal — Full-featured personal task creation modal.
 *
 * Composes ui/modal.tsx for all chrome. No form tag — onClick/onChange throughout.
 *
 * Fields:
 *   Title*         — autofocus, grows 1→3 lines
 *   Due date       — preset chips (Today / Tomorrow / Next week) + specific date toggle
 *   Priority       — Urgent / High / Normal chips (default: Normal)
 *   Tags           — free-text chip input; persisted to tasks.tags (migration 0024)
 *   Notes          — collapsed "+ Add notes" toggle
 *
 * Due date IST end-of-day:
 *   toUTC() from dates.ts wraps new Date(date).toISOString() — it is a
 *   UTC passthrough, not an IST end-of-day calculator. IST end-of-day is
 *   computed here by building a local midnight in IST (UTC+5:30) and converting
 *   to UTC. IST offset = UTC+5:30 = +330 minutes.
 */

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  useCallback,
  KeyboardEvent,
} from 'react';
import { Plus, X, ChevronDown } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { createPersonalTaskAction } from '@/lib/actions/tasks';
import { toast } from '@/lib/toast';
import { CreatePersonalTaskSchema } from '@/lib/validations/task-schemas';
import { TASK_PRIORITY } from '@/lib/constants/task-constants';
import type { Task, TaskPriority } from '@/lib/types/database';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface CreatePersonalTaskModalProps {
  open:      boolean;
  onClose:   () => void;
  onCreated: (task: Task) => void;
}

// ─── IST end-of-day helper ─────────────────────────────────────────────────────
// IST is UTC+5:30 (+330 minutes).
// This returns a UTC ISO string representing 23:59:59.999 of `dayOffset` days
// from today in the IST timezone.
// We do NOT use toUTC() from dates.ts because that function is a UTC passthrough
// and does not handle timezone-aware end-of-day calculation.
// The explicit +330 offset is documented here and not considered a magic number —
// it represents the immutable IST timezone definition (Asia/Kolkata).

function istEndOfDay(dayOffset: number): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h 30m in ms

  // Build today's midnight in IST
  const nowUTC       = Date.now();
  const nowIST       = nowUTC + IST_OFFSET_MS;
  const istMidnight  = nowIST - (nowIST % (24 * 60 * 60 * 1000)); // floor to day
  const targetISTMs  = istMidnight + dayOffset * 24 * 60 * 60 * 1000;
  // End of that IST day = IST midnight + 23h 59m 59.999s
  const istEodMs     = targetISTMs + 24 * 60 * 60 * 1000 - 1;
  // Convert back to UTC
  const utcEodMs     = istEodMs - IST_OFFSET_MS;
  return new Date(utcEodMs).toISOString();
}

// ─── Pill chip button ──────────────────────────────────────────────────────────

function PillChip({
  label,
  active,
  color,
  onClick,
}: {
  label:   string;
  active:  boolean;
  color?:  string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        padding:      '4px var(--space-3)',
        borderRadius: 'var(--radius-full)',
        border:       active
          ? `1.5px solid ${color ?? 'var(--theme-accent)'}`
          : '1px solid var(--theme-paper-border)',
        background:   active
          ? (color
              ? `color-mix(in srgb, ${color} 12%, transparent)`
              : 'var(--theme-accent-surface)')
          : 'transparent',
        color:        active
          ? (color ?? 'var(--theme-accent)')
          : 'var(--theme-text-secondary)',
        fontFamily:   'var(--font-sans)',
        fontSize:     'var(--text-xs)',
        fontWeight:   active ? 'var(--weight-semibold)' : 'var(--weight-normal)',
        cursor:       'pointer',
        transition:   'var(--transition-hover)',
        flexShrink:   0,
      }}
    >
      {label}
    </button>
  );
}

// ─── Field label ───────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display:       'block',
        fontFamily:    'var(--font-sans)',
        fontSize:      'var(--text-2xs)',
        fontWeight:    'var(--weight-semibold)',
        letterSpacing: 'var(--tracking-widest)',
        textTransform: 'uppercase',
        color:         'var(--theme-text-tertiary)',
        marginBottom:  'var(--space-1)',
      }}
    >
      {children}
    </span>
  );
}

// ─── Inline error ──────────────────────────────────────────────────────────────

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p
      style={{
        fontFamily:  'var(--font-sans)',
        fontSize:    'var(--text-xs)',
        color:       'var(--color-danger)',
        marginTop:   'var(--space-1)',
        marginBottom: 0,
      }}
    >
      {message}
    </p>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CreatePersonalTaskModal({
  open,
  onClose,
  onCreated,
}: CreatePersonalTaskModalProps) {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [title,          setTitle]          = useState('');
  const [titleError,     setTitleError]     = useState('');
  const [priority,       setPriority]       = useState<TaskPriority>('normal');
  const [duePreset,      setDuePreset]      = useState<'today' | 'tomorrow' | 'next-week' | null>(null);
  const [dueSpecific,    setDueSpecific]    = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes,          setNotes]          = useState('');
  const [showNotes,      setShowNotes]      = useState(false);

  const [tags,       setTags]       = useState<string[]>([]);
  const [tagInput,   setTagInput]   = useState('');

  const titleRef    = useRef<HTMLTextAreaElement>(null);
  const notesRef    = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();

  // ── Reset state on open ────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTitle('');
      setTitleError('');
      setPriority('normal');
      setDuePreset(null);
      setDueSpecific('');
      setShowDatePicker(false);
      setNotes('');
      setShowNotes(false);
      setTags([]);
      setTagInput('');
      // Autofocus title on open (50ms delay matches quick-add pattern)
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open]);

  // ── Auto-grow textarea height ──────────────────────────────────────────────
  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // ── Resolve due_at from preset or specific ─────────────────────────────────
  function getResolvedDueAt(): string | null {
    if (dueSpecific) {
      // Native datetime-local value is "YYYY-MM-DDTHH:mm" in local time
      return new Date(dueSpecific).toISOString();
    }
    if (duePreset === 'today')     return istEndOfDay(0);
    if (duePreset === 'tomorrow')  return istEndOfDay(1);
    if (duePreset === 'next-week') return istEndOfDay(7);
    return null;
  }

  // ── Preset chip handler ────────────────────────────────────────────────────
  function handlePresetClick(preset: 'today' | 'tomorrow' | 'next-week') {
    setDuePreset((prev) => prev === preset ? null : preset);
    setDueSpecific('');       // deselect specific when preset chosen
    setShowDatePicker(false); // collapse picker
  }

  // ── Specific date change ───────────────────────────────────────────────────
  function handleSpecificDateChange(value: string) {
    setDueSpecific(value);
    if (value) setDuePreset(null); // deselect preset when specific date chosen
  }

  // ── Tag input ──────────────────────────────────────────────────────────────
  function commitTag(raw: string) {
    const cleaned = raw.trim().replace(/,$/, '').trim();
    if (!cleaned) return;
    if (tags.length >= 10) return; // max 10 tags
    if (tags.includes(cleaned)) return; // no duplicates
    setTags((prev) => [...prev, cleaned]);
    setTagInput('');
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag(tagInput);
    }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function handleTagInputChange(value: string) {
    // If user types a comma, commit immediately
    if (value.endsWith(',')) {
      commitTag(value);
    } else {
      setTagInput(value);
    }
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (isPending) return;

    // Client-side Zod validation — show inline error on title
    const parsed = CreatePersonalTaskSchema.safeParse({
      title:       title.trim(),
      priority,
      due_at:      getResolvedDueAt(),
      description: notes.trim() || undefined,
      tags,
    });

    if (!parsed.success) {
      const titleIssue = parsed.error.issues.find(
        (i) => i.path[0] === 'title',
      );
      if (titleIssue) {
        setTitleError('Title is required.');
        titleRef.current?.focus();
        return;
      }
      toast.danger('Please check the form', { message: 'Some fields are invalid.' });
      return;
    }

    setTitleError('');

    startTransition(async () => {
      const result = await createPersonalTaskAction({
        title:       parsed.data.title,
        priority:    parsed.data.priority,
        due_at:      parsed.data.due_at ?? null,
        description: parsed.data.description ?? undefined,
        tags:        parsed.data.tags,
      });

      if (result.error) {
        toast.danger('Could not create task', { message: result.error });
        return;
      }

      toast.success('Task created');

      // Build a Task-shaped object from known fields so parent can prepend
      // without a re-fetch. Server returns only taskId; remaining fields
      // are filled with defaults matching what the DB insert would produce.
      // assigned_to and created_by are non-nullable in the Task type — the
      // server action assigns them to the caller's id; we use an empty string
      // as a safe placeholder since the parent only reads title/priority/status.
      const syntheticTask: Task = {
        id:            result.data!.taskId,
        title:         parsed.data.title,
        description:   parsed.data.description ?? null,
        priority:      parsed.data.priority,
        status:        'to_do',
        due_at:        parsed.data.due_at ?? null,
        assigned_to:   '',
        created_by:    '',
        group_id:      null,
        task_category: 'personal',
        task_type:     'general_follow_up',
        module:        'gia',
        completed_at:  null,
        attachments:   [],
        tags:          parsed.data.tags,
        created_at:    new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      };

      onCreated(syntheticTask);
      onClose();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, title, priority, duePreset, dueSpecific, notes, tags]);

  // ── Priority colours (from TASK_PRIORITY constants) ────────────────────────
  const PRIORITY_CHIPS: { value: TaskPriority; label: string; color: string }[] = [
    { value: 'urgent', label: 'Urgent', color: TASK_PRIORITY.urgent.color },
    { value: 'high',   label: 'High',   color: TASK_PRIORITY.high.color   },
    { value: 'normal', label: 'Normal', color: TASK_PRIORITY.normal.color },
  ];

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={isPending}
        style={{
          padding:      'var(--space-2) var(--space-4)',
          borderRadius: 'var(--radius-sm)',
          border:       '1px solid var(--theme-paper-border)',
          background:   'transparent',
          color:        'var(--theme-text-secondary)',
          fontFamily:   'var(--font-sans)',
          fontSize:     'var(--text-sm)',
          fontWeight:   'var(--weight-semibold)',
          cursor:       isPending ? 'not-allowed' : 'pointer',
          opacity:      isPending ? 0.5 : 1,
          transition:   'var(--transition-hover)',
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || !title.trim()}
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          padding:      'var(--space-2) var(--space-4)',
          borderRadius: 'var(--radius-sm)',
          border:       'none',
          background:   isPending || !title.trim()
            ? 'var(--theme-paper-border)'
            : 'var(--theme-accent)',
          color:        isPending || !title.trim()
            ? 'var(--theme-text-tertiary)'
            : 'var(--theme-accent-fg)',
          fontFamily:   'var(--font-sans)',
          fontSize:     'var(--text-sm)',
          fontWeight:   'var(--weight-semibold)',
          cursor:       isPending || !title.trim() ? 'not-allowed' : 'pointer',
          transition:   'var(--transition-interactive)',
        }}
      >
        {isPending ? (
          'Creating…'
        ) : (
          <>
            <Plus style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
            Create Task
          </>
        )}
      </button>
    </>
  );

  // ── Modal header custom content (subtitle below title) ─────────────────────
  // Modal.tsx renders a single title string. We need to inject a subtitle.
  // We pass a custom header-area subtitle as the first child of the body slot,
  // visually flush above the separator line, using negative margin to pull it up.

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Task"
      footer={footer}
      maxWidth="max-w-[480px]"
    >
      {/* ─── Title ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel>Title</FieldLabel>
        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleError && e.target.value.trim()) setTitleError('');
            autoGrow(e.target);
          }}
          onKeyDown={(e) => {
            // Submit on Enter without Shift; Shift+Enter = newline
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="What needs to be done?"
          rows={1}
          disabled={isPending}
          style={{
            width:        '100%',
            boxSizing:    'border-box',
            border:       titleError
              ? '1px solid var(--color-danger)'
              : '1px solid var(--theme-paper-border)',
            boxShadow:    titleError
              ? '0 0 0 3px var(--color-danger-light)'
              : undefined,
            borderRadius: 'var(--radius-sm)',
            background:   'var(--theme-paper)',
            padding:      'var(--space-2) var(--space-3)',
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-sm)',
            color:        'var(--theme-text-primary)',
            caretColor:   'var(--theme-accent)',
            resize:       'none',
            overflow:     'hidden',
            lineHeight:   'var(--leading-relaxed)',
            minHeight:    36,
            maxHeight:    80,  // ~3 lines
            outline:      'none',
            opacity:      isPending ? 0.6 : 1,
            transition:   'border-color var(--duration-fast) var(--ease-in-out)',
          }}
          onFocus={(e) => {
            if (!titleError) {
              e.target.style.borderColor = 'var(--theme-accent)';
              e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent)';
            }
          }}
          onBlur={(e) => {
            if (!titleError) {
              e.target.style.borderColor = 'var(--theme-paper-border)';
              e.target.style.boxShadow = '';
            }
          }}
        />
        <FieldError message={titleError} />
      </div>

      {/* ─── Due date ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel>Due date</FieldLabel>

        {/* Preset chips */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <PillChip
            label="Today"
            active={duePreset === 'today'}
            onClick={() => handlePresetClick('today')}
          />
          <PillChip
            label="Tomorrow"
            active={duePreset === 'tomorrow'}
            onClick={() => handlePresetClick('tomorrow')}
          />
          <PillChip
            label="Next week"
            active={duePreset === 'next-week'}
            onClick={() => handlePresetClick('next-week')}
          />
        </div>

        {/* "Or pick a specific date & time" toggle */}
        <button
          type="button"
          onClick={() => setShowDatePicker((prev) => !prev)}
          style={{
            display:     'inline-flex',
            alignItems:  'center',
            gap:         'var(--space-1)',
            marginTop:   'var(--space-2)',
            background:  'none',
            border:      'none',
            padding:     0,
            fontFamily:  'var(--font-sans)',
            fontSize:    'var(--text-xs)',
            color:       'var(--theme-text-tertiary)',
            cursor:      'pointer',
            transition:  'color var(--duration-fast) var(--ease-in-out)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-secondary)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-tertiary)'; }}
        >
          <ChevronDown
            style={{
              width:     12,
              height:    12,
              strokeWidth: 1.5,
              transform: showDatePicker ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform var(--duration-base) var(--ease-out-expo)',
            }}
          />
          Or pick a specific date &amp; time…
        </button>

        {/* Specific datetime input */}
        {showDatePicker && (
          <input
            type="datetime-local"
            value={dueSpecific}
            onChange={(e) => handleSpecificDateChange(e.target.value)}
            style={{
              display:      'block',
              marginTop:    'var(--space-2)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-sm)',
              background:   'var(--theme-paper)',
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-primary)',
              padding:      'var(--space-2) var(--space-3)',
              outline:      'none',
              caretColor:   'var(--theme-accent)',
              width:        '100%',
              boxSizing:    'border-box',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--theme-accent)';
              e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--theme-paper-border)';
              e.target.style.boxShadow = '';
            }}
          />
        )}
      </div>

      {/* ─── Priority ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel>Priority</FieldLabel>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {PRIORITY_CHIPS.map(({ value, label, color }) => (
            <PillChip
              key={value}
              label={label}
              active={priority === value}
              color={color}
              onClick={() => {
                // Clicking the active Normal chip has no effect (Normal is the fallback)
                // Clicking any other active chip deselects it → falls back to Normal
                if (priority === value && value !== 'normal') {
                  setPriority('normal');
                } else {
                  setPriority(value);
                }
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel>Tags <span style={{ fontWeight: 'var(--weight-normal)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></FieldLabel>
        <div
          style={{
            display:      'flex',
            flexWrap:     'wrap',
            alignItems:   'center',
            gap:          'var(--space-1)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-sm)',
            background:   'var(--theme-paper)',
            padding:      'var(--space-1) var(--space-2)',
            minHeight:    36,
            cursor:       'text',
            transition:   'border-color var(--duration-fast) var(--ease-in-out)',
          }}
          onClick={() => {
            document.getElementById('tag-input-field')?.focus();
          }}
          onFocus={() => {
            const el = document.querySelector<HTMLElement>('[data-tag-container]');
            if (el) {
              el.style.borderColor = 'var(--theme-accent)';
              el.style.boxShadow   = '0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent)';
            }
          }}
          onBlur={() => {
            const el = document.querySelector<HTMLElement>('[data-tag-container]');
            if (el) {
              el.style.borderColor = 'var(--theme-paper-border)';
              el.style.boxShadow   = '';
            }
          }}
          data-tag-container=""
        >
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          'var(--space-1)',
                padding:      '2px var(--space-2)',
                borderRadius: 'var(--radius-full)',
                background:   'var(--theme-accent-surface)',
                border:       '1px solid var(--theme-paper-border)',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-xs)',
                color:        'var(--theme-accent)',
                fontWeight:   'var(--weight-semibold)',
                userSelect:   'none',
              }}
            >
              {tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                aria-label={`Remove tag ${tag}`}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  background:     'none',
                  border:         'none',
                  padding:        0,
                  cursor:         'pointer',
                  color:          'var(--theme-accent)',
                  lineHeight:     1,
                }}
              >
                <X style={{ width: 10, height: 10, strokeWidth: 2 }} />
              </button>
            </span>
          ))}
          {tags.length < 10 && (
            <input
              id="tag-input-field"
              type="text"
              value={tagInput}
              onChange={(e) => handleTagInputChange(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => { if (tagInput.trim()) commitTag(tagInput); }}
              placeholder={tags.length === 0 ? 'Type and press Enter…' : ''}
              disabled={isPending}
              style={{
                flex:       '1 1 80px',
                minWidth:   80,
                border:     'none',
                outline:    'none',
                background: 'transparent',
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-primary)',
                caretColor: 'var(--theme-accent)',
                padding:    '2px var(--space-1)',
              }}
            />
          )}
        </div>
        <p
          style={{
            fontFamily:  'var(--font-sans)',
            fontSize:    'var(--text-xs)',
            color:       'var(--theme-text-tertiary)',
            marginTop:   'var(--space-1)',
            marginBottom: 0,
          }}
        >
          Press Enter or comma to add · Max 10 tags
        </p>
      </div>

      {/* ─── Notes (collapsed toggle) ─────────────────────────────────────── */}
      <div>
        {!showNotes ? (
          <button
            type="button"
            onClick={() => {
              setShowNotes(true);
              setTimeout(() => {
                notesRef.current?.focus();
              }, 50);
            }}
            style={{
              background: 'none',
              border:     'none',
              padding:    0,
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-sm)',
              color:      'var(--theme-accent)',
              cursor:     'pointer',
              transition: 'opacity var(--duration-fast) var(--ease-in-out)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            + Add notes
          </button>
        ) : (
          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                autoGrow(e.target);
              }}
              placeholder="Any context or details…"
              rows={3}
              disabled={isPending}
              style={{
                width:        '100%',
                boxSizing:    'border-box',
                border:       '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-sm)',
                background:   'var(--theme-paper)',
                padding:      'var(--space-2) var(--space-3)',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-sm)',
                color:        'var(--theme-text-primary)',
                caretColor:   'var(--theme-accent)',
                resize:       'vertical',
                lineHeight:   'var(--leading-relaxed)',
                minHeight:    80,
                maxHeight:    240,
                outline:      'none',
                opacity:      isPending ? 0.6 : 1,
                transition:   'border-color var(--duration-fast) var(--ease-in-out)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--theme-accent)';
                e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--theme-paper-border)';
                e.target.style.boxShadow = '';
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
