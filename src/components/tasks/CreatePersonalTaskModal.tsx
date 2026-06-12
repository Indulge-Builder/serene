'use client';

/**
 * CreatePersonalTaskModal — Full-featured personal task creation modal.
 *
 * Composes ui/modal.tsx for all chrome. No form tag — onClick/onChange throughout.
 * Field primitives (labels, errors, priority chips, due presets) come from
 * ui/TaskFormFields.tsx — never re-declared here (dry-audit H-3 + L-4).
 *
 * Fields:
 *   Title*         — autofocus, grows 1→3 lines
 *   Due date       — preset chips (Today / Tomorrow / Next week) + specific date toggle
 *   Priority       — Urgent / High / Normal chips (default: Normal)
 *   Tags           — free-text chip input; persisted to tasks.tags (migration 0024)
 *   Notes          — collapsed "+ Add notes" toggle
 *
 * Due date IST end-of-day: resolveDueAt() from TaskFormFields owns the preset →
 * toISTEndOfDay() math (toUTC() from dates.ts is a UTC passthrough, not an IST
 * end-of-day calculator).
 */

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  useCallback,
  KeyboardEvent,
} from 'react';
import { Plus, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import {
  FieldLabel,
  FieldError,
  PriorityChipRow,
  DueDateField,
  resolveDueAt,
  type DuePreset,
} from '@/components/ui/TaskFormFields';
import { createPersonalTaskAction } from '@/lib/actions/tasks';
import { toast } from '@/lib/toast';
import { CreatePersonalTaskSchema } from '@/lib/validations/task-schemas';
import type { Task, TaskPriority } from '@/lib/types/database';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface CreatePersonalTaskModalProps {
  open:      boolean;
  onClose:   () => void;
  onCreated: (task: Task) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CreatePersonalTaskModal({
  open,
  onClose,
  onCreated,
}: CreatePersonalTaskModalProps) {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [title,      setTitle]      = useState('');
  const [titleError, setTitleError] = useState('');
  const [priority,   setPriority]   = useState<TaskPriority>('normal');
  const [duePreset,  setDuePreset]  = useState<DuePreset | null>(null);
  const [dueDate,    setDueDate]    = useState<Date | null>(null);
  const [notes,      setNotes]      = useState('');
  const [showNotes,  setShowNotes]  = useState(false);

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
      setDueDate(null);
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
      due_at:      resolveDueAt(duePreset, dueDate),
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
      // without a re-fetch. Server returns assignee ids from the insert.
      const syntheticTask: Task = {
        id:            result.data!.taskId,
        title:         parsed.data.title,
        description:   parsed.data.description ?? null,
        priority:      parsed.data.priority,
        status:        'to_do',
        due_at:        parsed.data.due_at ?? null,
        assigned_to:   result.data!.assignedTo,
        created_by:    result.data!.createdBy,
        group_id:      null,
        task_category: 'personal',
        task_type:     'other',
        module:        'gia',
        completed_at:  null,
        overdue_at:    null,
        attachments:   [],
        tags:          parsed.data.tags,
        created_at:    new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      };

      onCreated(syntheticTask);
      onClose();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, title, priority, duePreset, dueDate, notes, tags]);

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleSubmit}
        loading={isPending}
        disabled={isPending || !title.trim()}
        iconLeft={Plus}
      >
        {isPending ? 'Creating…' : 'Create Task'}
      </Button>
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
        <DueDateField
          preset={duePreset}
          onPresetChange={setDuePreset}
          date={dueDate}
          onDateChange={setDueDate}
          placeholder="Or pick a specific date & time…"
          disabled={isPending}
        />
      </div>

      {/* ─── Priority ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel>Priority</FieldLabel>
        <PriorityChipRow
          value={priority}
          onChange={setPriority}
          disabled={isPending}
          deselectNonNormal
        />
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel optional>Tags</FieldLabel>
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
