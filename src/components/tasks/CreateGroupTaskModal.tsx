'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Plus, X, User, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import {
  FieldLabel,
  FieldError,
  PriorityChipRow,
  DueDateField,
} from '@/components/ui/TaskFormFields';
import { createGroupTaskAction, createSubtaskAction } from '@/lib/actions/tasks';
import { getAssignableUsersAction } from '@/lib/actions/profiles';
import { toast } from '@/lib/toast';
import { CreateGroupTaskSchema } from '@/lib/validations/task-schemas';
import * as LucideIcons from 'lucide-react';
import { GROUP_TASK_ACCENT_COLORS, GROUP_TASK_ICONS } from '@/lib/constants/task-constants';
import { DOMAIN_LABELS, GIA_DOMAINS } from '@/lib/constants/domains';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { TaskGroup, TaskPriority, AppDomain, UserRole } from '@/lib/types/database';
import type { AssignableUser } from '@/lib/types';

// ─── Extended group type — accent/icon are UI-only until migration adds DB cols ─

export type GroupTaskWithMeta = TaskGroup & {
  accent_color?: string;
  icon_key?:     string;
};

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface CreateGroupTaskModalProps {
  open:          boolean;
  onClose:       () => void;
  onCreated:     (group: GroupTaskWithMeta) => void;
  callerRole:    UserRole;
  callerDomain:  AppDomain;
}

// ─── Subtask draft ─────────────────────────────────────────────────────────────

interface SubtaskDraft {
  id:         string;
  title:      string;
  priority:   TaskPriority;
  assignee:   AssignableUser | null;
  dueAt:      Date | null;
}

const INPUT_BASE: React.CSSProperties = {
  display:      'block',
  width:        '100%',
  boxSizing:    'border-box',
  height:       36,
  border:       '1px solid var(--theme-paper-border)',
  borderRadius: 'var(--radius-sm)',
  background:   'var(--theme-paper)',
  padding:      '0 var(--space-3)',
  fontFamily:   'var(--font-sans)',
  fontSize:     'var(--text-sm)',
  color:        'var(--theme-text-primary)',
  caretColor:   'var(--theme-accent)',
  outline:      'none',
  transition:   'border-color var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)',
};

function useInputFocus() {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = 'var(--theme-accent)';
      e.currentTarget.style.boxShadow   = '0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = 'var(--theme-paper-border)';
      e.currentTarget.style.boxShadow   = '';
    },
  };
}

// ─── Assignee chip (inline) ────────────────────────────────────────────────────

function AssigneeInlinePicker({
  value,
  users,
  onChange,
  disabled,
  warn,
}: {
  value:    AssignableUser | null;
  users:    AssignableUser[];
  onChange: (u: AssignableUser | null) => void;
  disabled?: boolean;
  warn?:     boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropId = useId();
  const filtered = users.filter((u) =>
    !query.trim() || u.full_name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((o) => !o); setQuery(''); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            'var(--space-2)',
          height:         30,
          padding:        '0 var(--space-2)',
          borderRadius:   'var(--radius-sm)',
          border:         value
            ? '1px solid var(--theme-accent)'
            : warn
              ? '1px dashed var(--color-warning-text)'
              : '1px dashed var(--theme-paper-border)',
          background:     value ? 'var(--theme-accent-surface)' : 'transparent',
          color:          value ? 'var(--theme-accent)' : warn ? 'var(--color-warning-text)' : 'var(--theme-text-tertiary)',
          fontFamily:     'var(--font-sans)',
          fontSize:       'var(--text-xs)',
          cursor:         disabled ? 'not-allowed' : 'pointer',
          opacity:        disabled ? 0.6 : 1,
          whiteSpace:     'nowrap',
          transition:     'var(--transition-hover)',
          maxWidth:       120,
        }}
      >
        {value ? (
          <>
            <Avatar
              src={value.avatar_url}
              name={value.full_name}
              size="xs"
              style={{ width: 16, height: 16, minWidth: 16, borderRadius: 'var(--radius-full)' }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {value.full_name.split(' ')[0]}
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear assignee"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(null); } }}
              style={{ display: 'flex', color: 'var(--theme-accent)', flexShrink: 0 }}
            >
              <X style={{ width: 10, height: 10, strokeWidth: 2 }} />
            </span>
          </>
        ) : (
          <>
            <User style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
            Assign
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={dropId}
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
            style={{
              position:     'absolute',
              top:          'calc(100% + 4px)',
              left:         0,
              zIndex:       'var(--z-dropdown)' as unknown as number,
              minWidth:     200,
              maxWidth:     240,
              maxHeight:    220,
              overflowY:    'auto',
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow:    'var(--shadow-3)',
              display:      'flex',
              flexDirection: 'column',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {/* Search */}
            <div style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--theme-paper-border)', flexShrink: 0 }}>
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                style={{
                  ...INPUT_BASE,
                  height:     28,
                  fontSize:   'var(--text-xs)',
                  background: 'var(--theme-paper-subtle)',
                }}
              />
            </div>

            {/* Options */}
            {filtered.length === 0 ? (
              <div style={{ padding: 'var(--space-3)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', fontStyle: 'italic', textAlign: 'center' }}>
                No users found
              </div>
            ) : (
              filtered.map((u) => {
                const isSelected = value?.id === u.id;
                return (
                  <button
                    key={u.id}
                    role="option"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => { onChange(u); setOpen(false); }}
                    style={{
                      display:     'flex',
                      alignItems:  'center',
                      gap:         'var(--space-2)',
                      width:       '100%',
                      padding:     'var(--space-2) var(--space-3)',
                      border:      'none',
                      background:  isSelected ? 'var(--theme-accent-surface)' : 'transparent',
                      cursor:      'pointer',
                      textAlign:   'left',
                      transition:  'background var(--duration-fast) var(--ease-in-out)',
                      flexShrink:  0,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <Avatar
                      src={u.avatar_url}
                      name={u.full_name}
                      size="xs"
                      style={{ width: 20, height: 20, minWidth: 20, borderRadius: 'var(--radius-full)' }}
                    />
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.full_name}
                    </span>
                  </button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click-outside close */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 'calc(var(--z-dropdown) - 1)' as unknown as number }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Subtask row ────────────────────────────────────────────────────────────────

function SubtaskRow({
  draft,
  users,
  onTitleChange,
  onPriorityChange,
  onAssigneeChange,
  onDueChange,
  onRemove,
  autoFocus,
  disabled,
}: {
  draft:            SubtaskDraft;
  users:            AssignableUser[];
  onTitleChange:    (v: string) => void;
  onPriorityChange: (p: TaskPriority) => void;
  onAssigneeChange: (u: AssignableUser | null) => void;
  onDueChange:      (d: Date | null) => void;
  onRemove:         () => void;
  autoFocus?:       boolean;
  disabled?:        boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusHandlers = useInputFocus();

  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 30);
  }, [autoFocus]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, height: 0 }}
      transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
      style={{
        display:       'grid',
        gridTemplateColumns: '1fr auto auto auto auto',
        gap:           'var(--space-2)',
        alignItems:    'center',
        padding:       'var(--space-2) var(--space-3)',
        borderRadius:  'var(--radius-sm)',
        background:    'var(--theme-paper-subtle)',
        border:        '1px solid var(--theme-paper-border)',
      }}
    >
      {/* Title */}
      <input
        ref={inputRef}
        type="text"
        value={draft.title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Subtask title…"
        disabled={disabled}
        style={{
          border:       'none',
          background:   'transparent',
          outline:      'none',
          fontFamily:   'var(--font-sans)',
          fontSize:     'var(--text-sm)',
          color:        'var(--theme-text-primary)',
          caretColor:   'var(--theme-accent)',
          minWidth:     0,
          width:        '100%',
        }}
        {...focusHandlers}
      />

      {/* Priority inline */}
      <PriorityChipRow
        variant="dot"
        value={draft.priority}
        onChange={onPriorityChange}
        disabled={disabled}
      />

      {/* Assignee — warn when title is filled but no assignee (subtask will be skipped) */}
      <AssigneeInlinePicker
        value={draft.assignee}
        users={users}
        onChange={onAssigneeChange}
        disabled={disabled}
        warn={!!draft.title.trim() && !draft.assignee}
      />

      {/* Due date */}
      <DatePicker
        value={draft.dueAt}
        onChange={onDueChange}
        disabled={disabled}
        placeholder="Due date"
        style={{ height: 30, minWidth: 100, fontSize: 'var(--text-xs)' }}
        aria-label="Due date"
      />

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove subtask"
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          width:          24,
          height:         24,
          borderRadius:   'var(--radius-sm)',
          border:         'none',
          background:     'transparent',
          color:          'var(--theme-text-tertiary)',
          cursor:         disabled ? 'not-allowed' : 'pointer',
          flexShrink:     0,
          transition:     'color var(--duration-fast) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color      = 'var(--color-danger-text)';
          (e.currentTarget as HTMLElement).style.background = 'var(--color-danger-light)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color      = 'var(--theme-text-tertiary)';
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        <Trash2 style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
      </button>
    </motion.div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CreateGroupTaskModal({
  open,
  onClose,
  onCreated,
  callerRole,
  callerDomain,
}: CreateGroupTaskModalProps) {
  // Group fields
  const [title,       setTitle]       = useState('');
  const [titleError,  setTitleError]  = useState('');
  const [description, setDescription] = useState('');
  const [domain,      setDomain]      = useState<AppDomain | ''>(
    callerRole === 'manager' ? callerDomain : '',
  );
  const [domainError,  setDomainError]  = useState('');
  const [priority,     setPriority]     = useState<TaskPriority>('normal');
  const [dueAt,        setDueAt]        = useState<Date | null>(null);
  const [accentColor,  setAccentColor]  = useState<string>(GROUP_TASK_ACCENT_COLORS[0].hex);
  const [iconKey,      setIconKey]      = useState<string>(GROUP_TASK_ICONS[0].id);

  // Subtask drafts
  const [drafts,        setDrafts]        = useState<SubtaskDraft[]>([]);
  const [lastAddedId,   setLastAddedId]   = useState<string | null>(null);

  // Assignable users — fetched when domain changes
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);

  const titleRef = useRef<HTMLInputElement>(null);
  const descRef  = useRef<HTMLTextAreaElement>(null);
  const focusHandlers = useInputFocus();

  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState<'idle' | 'creating-group' | 'creating-subtasks'>('idle');

  const isManagerLocked = !['admin', 'founder'].includes(callerRole);

  // Fetch agents when domain changes (or on open for managers)
  useEffect(() => {
    const d = isManagerLocked ? callerDomain : domain;
    if (!d) { setAssignableUsers([]); return; }
    let cancelled = false;
    getAssignableUsersAction(d as AppDomain).then((r) => {
      if (cancelled || !r.data) return;
      setAssignableUsers(r.data);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, isManagerLocked]);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setTitleError('');
    setDescription('');
    setDomain(callerRole === 'manager' ? callerDomain : '');
    setDomainError('');
    setPriority('normal');
    setDueAt(null);
    setAccentColor(GROUP_TASK_ACCENT_COLORS[0].hex);
    setIconKey(GROUP_TASK_ICONS[0].id);
    setDrafts([]);
    setLastAddedId(null);
    setPhase('idle');
    setTimeout(() => titleRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function addDraft() {
    const newId = crypto.randomUUID();
    setDrafts((prev) => [...prev, { id: newId, title: '', priority: 'normal', assignee: null, dueAt: null }]);
    setLastAddedId(newId);
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  function updateDraft(id: string, patch: Partial<SubtaskDraft>) {
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d));
  }

  const canSubmit = title.trim().length > 0 && (isManagerLocked || domain !== '') && !isPending;


  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;

    let hasError = false;
    if (!title.trim())             { setTitleError('Title is required.'); titleRef.current?.focus(); hasError = true; }
    if (!isManagerLocked && !domain) { setDomainError('Domain is required.'); hasError = true; }
    if (hasError) return;

    const resolvedDomain = isManagerLocked ? callerDomain : domain as AppDomain;

    const parsed = CreateGroupTaskSchema.safeParse({
      title:       title.trim(),
      description: description.trim() || undefined,
      priority,
      due_at:      dueAt ? dueAt.toISOString() : null,
      domain:      resolvedDomain,
    });

    if (!parsed.success) {
      toast.danger('Please check the form', { message: 'Some fields are invalid.' });
      return;
    }

    setTitleError('');
    setDomainError('');

    // Only drafts with a title AND an assignee can be sent to createSubtaskAction
    // (assigned_to is a required UUID field in CreateSubtaskSchema)
    const validDrafts = drafts.filter((d) => d.title.trim() && d.assignee?.id);

    startTransition(async () => {
      // 1. Create the group
      setPhase('creating-group');
      const groupResult = await createGroupTaskAction({
        title:       parsed.data.title,
        description: parsed.data.description ?? undefined,
        priority:    parsed.data.priority,
        due_at:      parsed.data.due_at ?? null,
        domain:      resolvedDomain,
      });

      if (groupResult.error) {
        toast.danger('Could not create group task', { message: groupResult.error });
        setPhase('idle');
        return;
      }

      const groupId = groupResult.data!.groupId;

      // 2. Create subtasks (parallel, best-effort)
      let createdCount = 0;
      if (validDrafts.length > 0) {
        setPhase('creating-subtasks');
        const results = await Promise.allSettled(
          validDrafts.map((d) =>
            createSubtaskAction({
              group_id:    groupId,
              title:       d.title.trim(),
              priority:    d.priority,
              due_at:      d.dueAt ? d.dueAt.toISOString() : null,
              assigned_to: d.assignee!.id,
            }),
          ),
        );
        createdCount = results.filter(
          (r) => r.status === 'fulfilled' && !r.value.error,
        ).length;
      }

      const count = createdCount;
      toast.success(
        `Group task created${count > 0 ? ` with ${count} subtask${count > 1 ? 's' : ''}` : ''}`,
      );

      const syntheticGroup: GroupTaskWithMeta = {
        id:           groupId,
        title:        parsed.data.title,
        description:  parsed.data.description ?? null,
        priority:     parsed.data.priority,
        status:       'to_do',
        due_at:       parsed.data.due_at ?? null,
        created_by:   '',
        domain:       resolvedDomain,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
        accent_color: accentColor,
        icon_key:     iconKey,
      };

      setPhase('idle');
      onCreated(syntheticGroup);
      onClose();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSubmit, title, description, domain, priority, dueAt, drafts, isManagerLocked, callerDomain]);

  // ── Footer ───────────────────────────────────────────────────────────────────
  const submitLabel = isPending
    ? phase === 'creating-subtasks'
      ? 'Adding subtasks…'
      : 'Creating…'
    : 'Create Group Task';

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleSubmit}
        loading={isPending}
        disabled={!canSubmit}
        iconLeft={Plus}
      >
        {submitLabel}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Group Task"
      footer={footer}
      maxWidth="max-w-2xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

        {/* ── Section A: Group details ────────────────────────────────────── */}

        {/* Title */}
        <div>
          <FieldLabel required>Title</FieldLabel>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); if (titleError && e.target.value.trim()) setTitleError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="What is this group task called?"
            disabled={isPending}
            style={{
              ...INPUT_BASE,
              borderColor: titleError ? 'var(--color-danger)' : undefined,
              boxShadow:   titleError ? '0 0 0 3px var(--color-danger-light)' : undefined,
            }}
            {...focusHandlers}
          />
          <FieldError message={titleError || undefined} />
        </div>

        {/* Description */}
        <div>
          <FieldLabel>Description</FieldLabel>
          <textarea
            ref={descRef}
            value={description}
            onChange={(e) => { setDescription(e.target.value); autoGrow(e.target); }}
            placeholder="Brief objective or context…"
            rows={2}
            disabled={isPending}
            style={{
              display:      'block',
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
              resize:       'none',
              lineHeight:   'var(--leading-relaxed)',
              minHeight:    60,
              maxHeight:    100,
              outline:      'none',
              opacity:      isPending ? 0.6 : 1,
              transition:   'border-color var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)',
            }}
            {...focusHandlers}
          />
        </div>

        {/* Domain + Priority + Due date — one row */}
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: isManagerLocked ? '1fr 1fr' : '1fr 1fr 1fr',
            gap:                 'var(--space-4)',
            alignItems:          'end',
          }}
        >
          {/* Domain — hidden for managers (locked to their domain) */}
          {!isManagerLocked && (
            <div>
              <FieldLabel required>Domain</FieldLabel>
              <div style={{ position: 'relative' }}>
                <select
                  value={domain}
                  onChange={(e) => { setDomain(e.target.value as AppDomain | ''); if (domainError && e.target.value) setDomainError(''); setDrafts([]); }}
                  disabled={isPending}
                  style={{
                    ...INPUT_BASE,
                    appearance:       'none',
                    WebkitAppearance: 'none',
                    paddingRight:     'var(--space-8)',
                    color:            domain ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
                    borderColor:      domainError ? 'var(--color-danger)' : undefined,
                    boxShadow:        domainError ? '0 0 0 3px var(--color-danger-light)' : undefined,
                    cursor:           isPending ? 'not-allowed' : 'pointer',
                  }}
                  {...focusHandlers}
                >
                  <option value="" disabled>Select domain</option>
                  {GIA_DOMAINS.map((d) => (
                    <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
                  ))}
                </select>
                <svg
                  viewBox="0 0 12 12"
                  style={{ position: 'absolute', right: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, pointerEvents: 'none', color: 'var(--theme-text-tertiary)' }}
                  stroke="currentColor" fill="none" strokeWidth="1.5"
                >
                  <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <FieldError message={domainError || undefined} />
            </div>
          )}

          {/* Priority */}
          <div>
            <FieldLabel>Priority</FieldLabel>
            <PriorityChipRow value={priority} onChange={setPriority} disabled={isPending} />
          </div>

          {/* Due date */}
          <DueDateField
            label="Due Date"
            date={dueAt}
            onDateChange={setDueAt}
            disabled={isPending}
            placeholder="Optional"
            pickerStyle={{ width: '100%' }}
          />
        </div>

        {/* ── Section: Appearance (colour + icon) ─────────────────────────── */}
        <div
          style={{
            display:      'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:          'var(--space-4)',
          }}
        >
          {/* Accent colour */}
          <div>
            <FieldLabel>Accent colour</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              {GROUP_TASK_ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => setAccentColor(c.hex)}
                  style={{
                    width:        22,
                    height:       22,
                    borderRadius: 'var(--radius-full)',
                    background:   c.hex,
                    border:       accentColor === c.hex
                      ? `2px solid var(--theme-text-primary)`
                      : '2px solid transparent',
                    outline:      accentColor === c.hex
                      ? `2px solid ${c.hex}`
                      : 'none',
                    outlineOffset: 2,
                    cursor:       'pointer',
                    flexShrink:   0,
                    transition:   'border 0.12s, outline 0.12s',
                    boxSizing:    'border-box',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div>
            <FieldLabel>Icon</FieldLabel>
            <div
              style={{
                display:   'flex',
                flexWrap:  'wrap',
                gap:       'var(--space-1)',
                marginTop: 'var(--space-1)',
                maxHeight: 80,
                overflowY: 'auto',
              }}
            >
              {GROUP_TASK_ICONS.map((ic) => {
                const IconComp = (LucideIcons as unknown as Record<string, React.ComponentType<{ style?: React.CSSProperties }>>)[ic.id];
                if (!IconComp) return null;
                const isActive = iconKey === ic.id;
                return (
                  <button
                    key={ic.id}
                    type="button"
                    title={ic.label}
                    aria-label={ic.label}
                    onClick={() => setIconKey(ic.id)}
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      width:          26,
                      height:         26,
                      borderRadius:   'var(--radius-xs)',
                      border:         isActive ? `1.5px solid ${accentColor}` : '1.5px solid transparent',
                      background:     isActive ? `color-mix(in srgb, ${accentColor} 16%, transparent)` : 'transparent',
                      color:          isActive ? accentColor : 'var(--theme-text-secondary)',
                      cursor:         'pointer',
                      flexShrink:     0,
                      transition:     'background 0.12s, border 0.12s, color 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <IconComp style={{ width: 13, height: 13, strokeWidth: 1.5 } as React.CSSProperties} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--theme-paper-border)' }} />
          <span
            style={{
              fontFamily:    'var(--font-sans)',
              fontSize:      'var(--text-2xs)',
              fontWeight:    'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-widest)',
              textTransform: 'uppercase',
              color:         'var(--theme-text-tertiary)',
              whiteSpace:    'nowrap',
            }}
          >
            Subtasks
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--theme-paper-border)' }} />
        </div>

        {/* ── Section B: Subtasks ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>

          {/* Column headers — only show when there are drafts */}
          {drafts.length > 0 && (
            <div
              style={{
                display:             'grid',
                gridTemplateColumns: '1fr auto auto auto auto',
                gap:                 'var(--space-2)',
                padding:             '0 var(--space-3)',
                alignItems:          'center',
              }}
            >
              <FieldLabel style={{ marginBottom: 0 }}>Title</FieldLabel>
              <FieldLabel style={{ marginBottom: 0, minWidth: 68 }}>Priority</FieldLabel>
              <FieldLabel style={{ marginBottom: 0, minWidth: 72 }}>Assignee</FieldLabel>
              <FieldLabel style={{ marginBottom: 0, minWidth: 100 }}>Due</FieldLabel>
              <span style={{ width: 24 }} />
            </div>
          )}

          <AnimatePresence initial={false}>
            {drafts.map((d) => (
              <SubtaskRow
                key={d.id}
                draft={d}
                users={assignableUsers}
                onTitleChange={(v) => updateDraft(d.id, { title: v })}
                onPriorityChange={(p) => updateDraft(d.id, { priority: p })}
                onAssigneeChange={(u) => updateDraft(d.id, { assignee: u })}
                onDueChange={(dt) => updateDraft(d.id, { dueAt: dt })}
                onRemove={() => removeDraft(d.id)}
                autoFocus={d.id === lastAddedId}
                disabled={isPending}
              />
            ))}
          </AnimatePresence>

          {/* Add subtask trigger */}
          <button
            type="button"
            onClick={addDraft}
            disabled={isPending || (!isManagerLocked && !domain)}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          'var(--space-2)',
              padding:      'var(--space-2) var(--space-3)',
              border:       '1px dashed var(--theme-paper-border)',
              borderRadius: 'var(--radius-sm)',
              background:   'transparent',
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-tertiary)',
              cursor:       (isPending || (!isManagerLocked && !domain)) ? 'not-allowed' : 'pointer',
              opacity:      (isPending || (!isManagerLocked && !domain)) ? 0.5 : 1,
              width:        '100%',
              transition:   'color var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)',
            }}
            onMouseEnter={(e) => {
              if (!isPending && (isManagerLocked || domain)) {
                (e.currentTarget as HTMLElement).style.color        = 'var(--theme-accent)';
                (e.currentTarget as HTMLElement).style.borderColor  = 'var(--theme-accent)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color       = 'var(--theme-text-tertiary)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-paper-border)';
            }}
          >
            <Plus style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
            {drafts.length === 0 ? 'Add a subtask' : 'Add another subtask'}
          </button>

          {!isManagerLocked && !domain ? (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
                fontStyle:  'italic',
                margin:     0,
                textAlign:  'center',
              }}
            >
              Select a domain above to add subtasks and assign them to people.
            </p>
          ) : drafts.length > 0 && (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
                margin:     0,
              }}
            >
              Subtasks without an assignee will be skipped — assign each one before creating.
            </p>
          )}
        </div>

      </div>
    </Modal>
  );
}
