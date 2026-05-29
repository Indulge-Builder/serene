'use client';

/**
 * CreateGroupTaskModal — Group task creation with live preview.
 *
 * Layout: Two-column on desktop (preview left | form right).
 *         Stacks vertically on mobile (preview hidden, form full-width).
 *
 * accent_color + icon_key: NOT passed to createGroupTaskAction — task_groups
 * has no such columns as of migration 0017.
 * TODO: add `accent_color text` and `icon_key text` columns (new migration).
 *
 * Member search: searchProfilesAction does not exist yet.
 * TODO: implement searchProfilesAction in src/lib/actions/profiles.ts.
 *
 * memberIds: NOT passed to createGroupTaskAction — no task_group_members table.
 * TODO: add task_group_members table + wire memberIds once the table exists.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import * as LucideIcons from 'lucide-react';
import { Plus, X, ChevronDown, Search, Users } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { createGroupTaskAction } from '@/lib/actions/tasks';
import { toast } from '@/lib/toast';
import { CreateGroupTaskSchema } from '@/lib/validations/task-schemas';
import {
  GROUP_TASK_ACCENT_COLORS,
  GROUP_TASK_ICONS,
  TASK_PRIORITY,
} from '@/lib/constants/task-constants';
import { APP_DOMAINS, DOMAIN_LABELS } from '@/lib/constants/domains';
import { Avatar } from '@/components/ui/Avatar';
import type { TaskGroup, TaskPriority, AppDomain } from '@/lib/types/database';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface CreateGroupTaskModalProps {
  open:      boolean;
  onClose:   () => void;
  onCreated: (group: TaskGroup) => void;
}

// ─── Lucide icon renderer ──────────────────────────────────────────────────────
// Cast through unknown to bridge IconComponentProps → { style } type gap.

type AnyLucideIcon = React.FC<{ style?: React.CSSProperties }>;

function TaskIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = (LucideIcons as unknown as Record<string, AnyLucideIcon>)[name];
  if (!Icon) return null;
  return <Icon style={{ width: size, height: size, strokeWidth: 1.5 }} />;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────


// ─── Field label ───────────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   'var(--space-1)',
      }}
    >
      <span
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-widest)',
          textTransform: 'uppercase',
          color:         'var(--theme-text-tertiary)',
        }}
      >
        {children}
      </span>
      {required && (
        <span
          style={{
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-2xs)',
            fontWeight:   'var(--weight-medium)',
            background:   'var(--theme-paper-subtle)',
            border:       '1px solid var(--theme-paper-border)',
            color:        'var(--theme-text-tertiary)',
            borderRadius: 'var(--radius-full)',
            padding:      'var(--space-px) var(--space-2)',
          }}
        >
          Required
        </span>
      )}
    </div>
  );
}

// ─── Inline error ──────────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      style={{
        fontFamily:   'var(--font-sans)',
        fontSize:     'var(--text-xs)',
        color:        'var(--color-danger)',
        marginTop:    'var(--space-1)',
        marginBottom: 0,
        lineHeight:   'var(--leading-normal)',
      }}
    >
      {message}
    </p>
  );
}

// ─── Member chip type ──────────────────────────────────────────────────────────

interface MemberChip {
  id:         string;
  full_name:  string;
  avatar_url: string | null;
  role:       string;
}

// ─── Live preview card ─────────────────────────────────────────────────────────

function PreviewCard({
  title,
  accentHex,
  iconName,
}: {
  title:     string;
  accentHex: string;
  iconName:  string;
}) {
  const displayTitle = title.trim() || 'Group task title';
  const isEmpty      = !title.trim();

  return (
    <div>
      <p
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase',
          color:         'var(--theme-text-tertiary)',
          margin:        '0 0 var(--space-2)',
        }}
      >
        Preview
      </p>

      <div
        style={{
          borderRadius: 'var(--radius-md)',
          border:       '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper)',
          boxShadow:    'var(--shadow-1)',
          overflow:     'hidden',
        }}
      >
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        'var(--space-3)',
            padding:    'var(--space-3) var(--space-4)',
            borderLeft: `3px solid ${accentHex}`,
          }}
        >
          <span
            style={{
              flexShrink: 0,
              display:    'flex',
              color:      'var(--theme-text-secondary)',
            }}
          >
            <TaskIcon name={iconName} size={20} />
          </span>

          <span
            style={{
              flex:         1,
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-sm)',
              fontWeight:   'var(--weight-semibold)',
              color:        isEmpty ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)',
              fontStyle:    isEmpty ? 'italic' : 'normal',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
              minWidth:     0,
            }}
          >
            {displayTitle}
          </span>

          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize:   'var(--text-xs)',
              color:      'var(--theme-text-tertiary)',
              flexShrink: 0,
            }}
          >
            0/0
          </span>
        </div>
      </div>

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize:   'var(--text-xs)',
          color:      'var(--theme-text-tertiary)',
          fontStyle:  'italic',
          margin:     'var(--space-2) 0 0',
        }}
      >
        How it appears in Group Tasks.
      </p>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CreateGroupTaskModal({
  open,
  onClose,
  onCreated,
}: CreateGroupTaskModalProps) {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [title,       setTitle]       = useState('');
  const [titleError,  setTitleError]  = useState('');
  const [description, setDescription] = useState('');
  const [domain,      setDomain]      = useState<AppDomain | ''>('');
  const [domainError, setDomainError] = useState('');
  const [priority,    setPriority]    = useState<TaskPriority>('normal');
  const [dueAt,       setDueAt]       = useState('');

  // Accent colour — UI only, no DB column yet
  const [accentId, setAccentId] = useState(GROUP_TASK_ACCENT_COLORS[0].id);
  // Icon — UI only, no DB column yet
  const [iconId, setIconId]     = useState(GROUP_TASK_ICONS[0].id);

  // Member search — stubbed, no searchProfilesAction yet
  const [memberQuery,          setMemberQuery]          = useState('');
  const [memberSearchPending,  setMemberSearchPending]  = useState(false);
  const [memberResults,        setMemberResults]        = useState<MemberChip[]>([]);
  const [members,              setMembers]              = useState<MemberChip[]>([]);

  const titleRef = useRef<HTMLInputElement>(null);
  const descRef  = useRef<HTMLTextAreaElement>(null);

  const [isPending, startTransition] = useTransition();

  const accentHex = GROUP_TASK_ACCENT_COLORS.find((c) => c.id === accentId)?.hex
    ?? GROUP_TASK_ACCENT_COLORS[0].hex;

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setTitleError('');
    setDescription('');
    setDomain('');
    setDomainError('');
    setPriority('normal');
    setDueAt('');
    setAccentId(GROUP_TASK_ACCENT_COLORS[0].id);
    setIconId(GROUP_TASK_ICONS[0].id);
    setMemberQuery('');
    setMemberResults([]);
    setMembers([]);
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [open]);

  // ── Auto-grow textarea ─────────────────────────────────────────────────────
  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // ── Member search stub ─────────────────────────────────────────────────────
  // TODO: wire to searchProfilesAction once it exists in src/lib/actions/profiles.ts
  useEffect(() => {
    if (memberQuery.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    setMemberSearchPending(true);
    const t = setTimeout(() => {
      setMemberResults([]);
      setMemberSearchPending(false);
    }, 150);
    return () => clearTimeout(t);
  }, [memberQuery]);

  function addMember(m: MemberChip) {
    if (members.some((x) => x.id === m.id)) return;
    setMembers((prev) => [...prev, m]);
    setMemberQuery('');
    setMemberResults([]);
  }

  function removeMember(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (isPending) return;

    let hasError = false;
    if (!title.trim()) { setTitleError('Title is required.'); titleRef.current?.focus(); hasError = true; }
    if (!domain)        { setDomainError('Domain is required.'); hasError = true; }
    if (hasError) return;

    const parsed = CreateGroupTaskSchema.safeParse({
      title:       title.trim(),
      description: description.trim() || undefined,
      priority,
      due_at:      dueAt ? new Date(dueAt).toISOString() : null,
      domain,
    });

    if (!parsed.success) {
      toast.danger('Please check the form', { message: 'Some fields are invalid.' });
      return;
    }

    setTitleError('');
    setDomainError('');

    startTransition(async () => {
      // accent_color, icon_key, memberIds NOT passed — no DB columns yet.
      // TODO: wire all three once migrations add the columns + junction table.
      const result = await createGroupTaskAction({
        title:       parsed.data.title,
        description: parsed.data.description ?? undefined,
        priority:    parsed.data.priority,
        due_at:      parsed.data.due_at ?? null,
        domain:      parsed.data.domain,
      });

      if (result.error) {
        toast.danger('Could not create group task', { message: result.error });
        return;
      }

      toast.success('Group task created');

      const syntheticGroup: TaskGroup = {
        id:          result.data!.groupId,
        title:       parsed.data.title,
        description: parsed.data.description ?? null,
        priority:    parsed.data.priority,
        status:      'to_do',
        due_at:      parsed.data.due_at ?? null,
        created_by:  '',
        domain:      parsed.data.domain,
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      };

      onCreated(syntheticGroup);
      onClose();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, title, description, domain, priority, dueAt]);

  const canSubmit = title.trim().length > 0 && domain !== '' && !isPending;

  // ── Shared input focus/blur handlers ──────────────────────────────────────
  const inputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--theme-accent)';
    e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent)';
  };
  const inputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--theme-paper-border)';
    e.target.style.boxShadow = '';
  };
  const inputFocusError = (e: React.FocusEvent<HTMLInputElement>) => {
    // Keep error ring on focus when field is in error state — don't overwrite
  };

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={isPending}
        style={{
          height:       36,
          padding:      '0 var(--space-4)',
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
        disabled={!canSubmit}
        style={{
          height:       36,
          display:      'inline-flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          padding:      '0 var(--space-4)',
          borderRadius: 'var(--radius-sm)',
          border:       'none',
          background:   canSubmit ? 'var(--theme-accent)' : 'var(--theme-paper-border)',
          color:        canSubmit ? 'var(--theme-accent-fg)' : 'var(--theme-text-tertiary)',
          fontFamily:   'var(--font-sans)',
          fontSize:     'var(--text-sm)',
          fontWeight:   'var(--weight-semibold)',
          cursor:       canSubmit ? 'pointer' : 'not-allowed',
          transition:   'var(--transition-interactive)',
        }}
      >
        {isPending ? 'Creating…' : (
          <>
            <Plus style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
            Create Group Task
          </>
        )}
      </button>
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
      {/*
        Two-column layout inside Modal body.
        Desktop: preview (200px fixed) | gap (space-6) | form (flex-1)
        Mobile: form only — preview hides at ≤640px via data attribute + CSS below
      */}
      <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-start' }}>

        {/* ── Left: Live preview ──────────────────────────────────────── */}
        <div
          data-preview-col=""
          style={{
            width:      200,
            flexShrink: 0,
          }}
        >
          <PreviewCard title={title} accentHex={accentHex} iconName={iconId} />
        </div>

        {/* ── Right: Form ─────────────────────────────────────────────── */}
        <div
          style={{
            flex:          1,
            minWidth:      0,
            display:       'flex',
            flexDirection: 'column',
            gap:           'var(--space-5)',
          }}
        >

          {/* Title */}
          <div>
            <FieldLabel required>Title</FieldLabel>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (titleError && e.target.value.trim()) setTitleError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="Group task title"
              disabled={isPending}
              style={{
                display:      'block',
                width:        '100%',
                boxSizing:    'border-box',
                height:       36,
                border:       titleError ? '1px solid var(--color-danger)' : '1px solid var(--theme-paper-border)',
                boxShadow:    titleError ? '0 0 0 3px var(--color-danger-light)' : 'none',
                borderRadius: 'var(--radius-sm)',
                background:   'var(--theme-paper)',
                padding:      '0 var(--space-3)',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-sm)',
                color:        'var(--theme-text-primary)',
                caretColor:   'var(--theme-accent)',
                outline:      'none',
                opacity:      isPending ? 0.6 : 1,
                transition:   'var(--transition-hover)',
              }}
              onFocus={(e) => { if (!titleError) inputFocus(e); else inputFocusError(e); }}
              onBlur={(e) => { if (!titleError) inputBlur(e); }}
            />
            <FieldError message={titleError} />
          </div>

          {/* Description */}
          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              ref={descRef}
              value={description}
              onChange={(e) => { setDescription(e.target.value); autoGrow(e.target); }}
              placeholder="What is this group task about?"
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
                resize:       'vertical',
                lineHeight:   'var(--leading-relaxed)',
                minHeight:    60,
                maxHeight:    120,
                outline:      'none',
                opacity:      isPending ? 0.6 : 1,
                transition:   'var(--transition-hover)',
              }}
              onFocus={inputFocus}
              onBlur={inputBlur}
            />
          </div>

          {/* Domain */}
          <div>
            <FieldLabel required>Domain</FieldLabel>
            <div style={{ position: 'relative' }}>
              <select
                value={domain}
                onChange={(e) => { setDomain(e.target.value as AppDomain | ''); if (domainError && e.target.value) setDomainError(''); }}
                disabled={isPending}
                style={{
                  display:          'block',
                  width:            '100%',
                  boxSizing:        'border-box',
                  height:           36,
                  appearance:       'none',
                  WebkitAppearance: 'none',
                  border:           domainError ? '1px solid var(--color-danger)' : '1px solid var(--theme-paper-border)',
                  boxShadow:        domainError ? '0 0 0 3px var(--color-danger-light)' : 'none',
                  borderRadius:     'var(--radius-sm)',
                  background:       'var(--theme-paper)',
                  paddingLeft:      'var(--space-3)',
                  paddingRight:     'var(--space-8)',
                  fontFamily:       'var(--font-sans)',
                  fontSize:         'var(--text-sm)',
                  color:            domain ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
                  outline:          'none',
                  cursor:           isPending ? 'not-allowed' : 'pointer',
                  opacity:          isPending ? 0.6 : 1,
                  transition:       'var(--transition-hover)',
                }}
                onFocus={(e) => { if (!domainError) inputFocus(e); }}
                onBlur={(e) => { if (!domainError) inputBlur(e); }}
              >
                <option value="" disabled>Select domain</option>
                {APP_DOMAINS.map((d) => (
                  <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
                ))}
              </select>
              <ChevronDown
                style={{
                  position:      'absolute',
                  right:         'var(--space-3)',
                  top:           '50%',
                  transform:     'translateY(-50%)',
                  width:         14,
                  height:        14,
                  strokeWidth:   1.5,
                  color:         'var(--theme-text-tertiary)',
                  pointerEvents: 'none',
                  flexShrink:    0,
                }}
              />
            </div>
            <FieldError message={domainError} />
          </div>

          {/* Accent Colour — UI only, no DB column yet */}
          {/* TODO: wire to task_groups.accent_color once column is added via migration */}
          <div>
            <FieldLabel>Accent Colour</FieldLabel>
            <div
              style={{
                display:             'grid',
                gridTemplateColumns: 'repeat(10, 1fr)',
                gap:                 'var(--space-2)',
              }}
            >
              {GROUP_TASK_ACCENT_COLORS.map((c) => {
                const isSelected = accentId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    aria-label={`${c.label}${isSelected ? ' (selected)' : ''}`}
                    onClick={() => setAccentId(c.id)}
                    style={{
                      aspectRatio:  '1',
                      borderRadius: 'var(--radius-xs)',
                      background:   c.hex,
                      border:       isSelected ? `2px solid var(--theme-paper)` : '2px solid transparent',
                      outline:      isSelected ? `2px solid ${c.hex}` : '2px solid transparent',
                      outlineOffset: '1px',
                      cursor:       'pointer',
                      transition:   'outline var(--duration-fast) var(--ease-in-out)',
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Icon — UI only, no DB column yet */}
          {/* TODO: wire to task_groups.icon_key once column is added via migration */}
          <div>
            <FieldLabel>Icon</FieldLabel>
            <div
              style={{
                display:             'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap:                 'var(--space-1)',
              }}
            >
              {GROUP_TASK_ICONS.map((ic) => {
                const isSelected = iconId === ic.id;
                return (
                  <button
                    key={ic.id}
                    type="button"
                    title={ic.label}
                    aria-label={`${ic.label} icon${isSelected ? ' (selected)' : ''}`}
                    onClick={() => setIconId(ic.id)}
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      height:         32,
                      borderRadius:   'var(--radius-sm)',
                      border:         '1px solid',
                      borderColor:    isSelected ? 'var(--theme-accent)' : 'transparent',
                      background:     isSelected ? 'var(--theme-accent)' : 'transparent',
                      color:          isSelected ? 'var(--theme-accent-fg)' : 'var(--theme-text-secondary)',
                      cursor:         'pointer',
                      transition:     'var(--transition-hover)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.background   = 'var(--theme-paper-subtle)';
                        (e.currentTarget as HTMLElement).style.borderColor  = 'var(--theme-paper-border)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.background  = 'transparent';
                        (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                      }
                    }}
                  >
                    <span style={{ color: isSelected ? 'var(--theme-accent-fg)' : 'var(--theme-text-secondary)', display: 'flex' }}>
                      <TaskIcon name={ic.id} size={15} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height:     1,
              background: 'var(--theme-paper-border)',
            }}
          />

          {/* Priority */}
          <div>
            <FieldLabel>Priority</FieldLabel>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(['urgent', 'high', 'normal'] as TaskPriority[]).map((p) => {
                const cfg      = TASK_PRIORITY[p];
                const isActive = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { if (isActive && p !== 'normal') setPriority('normal'); else setPriority(p); }}
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      height:       28,
                      padding:      '0 var(--space-3)',
                      borderRadius: 'var(--radius-full)',
                      border:       isActive
                        ? `1.5px solid ${cfg.color}`
                        : '1px solid var(--theme-paper-border)',
                      background:   isActive
                        ? `color-mix(in srgb, ${cfg.color} 12%, transparent)`
                        : 'transparent',
                      color:        isActive ? cfg.color : 'var(--theme-text-secondary)',
                      fontFamily:   'var(--font-sans)',
                      fontSize:     'var(--text-xs)',
                      fontWeight:   isActive ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                      cursor:       'pointer',
                      transition:   'var(--transition-hover)',
                      whiteSpace:   'nowrap',
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <FieldLabel>Due Date (Optional)</FieldLabel>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              disabled={isPending}
              style={{
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
                color:        dueAt ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
                outline:      'none',
                caretColor:   'var(--theme-accent)',
                opacity:      isPending ? 0.6 : 1,
                transition:   'var(--transition-hover)',
              }}
              onFocus={inputFocus}
              onBlur={inputBlur}
            />
          </div>

          {/* Add Members */}
          {/* TODO: wire to searchProfilesAction once it exists in src/lib/actions/profiles.ts */}
          {/* TODO: wire memberIds to createGroupTaskAction once task_group_members table is added */}
          <div>
            <FieldLabel>Add Members (Optional)</FieldLabel>

            {/* Member chips */}
            {members.length > 0 && (
              <div
                style={{
                  display:      'flex',
                  flexWrap:     'wrap',
                  gap:          'var(--space-1)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {members.map((m) => (
                  <span
                    key={m.id}
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          'var(--space-1)',
                      padding:      'var(--space-1) var(--space-2)',
                      borderRadius: 'var(--radius-full)',
                      background:   'var(--theme-accent-surface)',
                      border:       '1px solid var(--theme-paper-border)',
                      fontFamily:   'var(--font-sans)',
                      fontSize:     'var(--text-xs)',
                      color:        'var(--theme-text-primary)',
                    }}
                  >
                    <Avatar src={m.avatar_url} name={m.full_name} size="xs" style={{ width: 20, height: 20, minWidth: 20, borderRadius: 'var(--radius-full)' }} />
                    {m.full_name}
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      aria-label={`Remove ${m.full_name}`}
                      style={{
                        display:    'flex',
                        alignItems: 'center',
                        background: 'none',
                        border:     'none',
                        padding:    0,
                        cursor:     'pointer',
                        color:      'var(--theme-text-tertiary)',
                      }}
                    >
                      <X style={{ width: 10, height: 10, strokeWidth: 2 }} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
            <div style={{ position: 'relative' }}>
              <Search
                style={{
                  position:      'absolute',
                  left:          'var(--space-3)',
                  top:           '50%',
                  transform:     'translateY(-50%)',
                  width:         14,
                  height:        14,
                  strokeWidth:   1.5,
                  color:         'var(--theme-text-tertiary)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Search by name… (min 2 characters)"
                style={{
                  display:      'block',
                  width:        '100%',
                  boxSizing:    'border-box',
                  height:       36,
                  border:       '1px solid var(--theme-paper-border)',
                  borderRadius: 'var(--radius-sm)',
                  background:   'var(--theme-paper-subtle)',
                  paddingLeft:  'var(--space-8)',
                  paddingRight: 'var(--space-3)',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-sm)',
                  color:        'var(--theme-text-primary)',
                  caretColor:   'var(--theme-accent)',
                  outline:      'none',
                  transition:   'var(--transition-hover)',
                }}
                onFocus={inputFocus}
                onBlur={inputBlur}
              />
            </div>

            {/* Search results */}
            {memberQuery.trim().length >= 2 && (
              <div
                style={{
                  marginTop:    'var(--space-1)',
                  border:       '1px solid var(--theme-paper-border)',
                  borderRadius: 'var(--radius-md)',
                  background:   'var(--theme-paper)',
                  boxShadow:    'var(--shadow-2)',
                  overflow:     'hidden',
                }}
              >
                {memberSearchPending ? (
                  <div
                    style={{
                      padding:    'var(--space-3) var(--space-4)',
                      fontFamily: 'var(--font-sans)',
                      fontSize:   'var(--text-xs)',
                      color:      'var(--theme-text-tertiary)',
                    }}
                  >
                    Searching…
                  </div>
                ) : memberResults.length === 0 ? (
                  <div
                    style={{
                      display:    'flex',
                      alignItems: 'center',
                      gap:        'var(--space-2)',
                      padding:    'var(--space-3) var(--space-4)',
                    }}
                  >
                    <Users style={{ width: 14, height: 14, strokeWidth: 1.5, color: 'var(--theme-text-tertiary)', flexShrink: 0 }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize:   'var(--text-xs)',
                        color:      'var(--theme-text-tertiary)',
                        fontStyle:  'italic',
                      }}
                    >
                      Member search is pending — searchProfilesAction not yet implemented.
                    </span>
                  </div>
                ) : (
                  memberResults.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => addMember(m)}
                      style={{
                        display:      'flex',
                        alignItems:   'center',
                        gap:          'var(--space-3)',
                        width:        '100%',
                        padding:      'var(--space-2) var(--space-4)',
                        border:       'none',
                        borderBottom: '1px solid var(--theme-paper-border)',
                        background:   'transparent',
                        cursor:       'pointer',
                        textAlign:    'left',
                        transition:   'background var(--duration-fast) var(--ease-in-out)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <Avatar src={m.avatar_url} name={m.full_name} size="xs" style={{ width: 24, height: 24, minWidth: 24, borderRadius: 'var(--radius-sm)' }} />
                      <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)' }}>
                        {m.full_name}
                      </span>
                      <span
                        style={{
                          padding:      'var(--space-px) var(--space-2)',
                          borderRadius: 'var(--radius-full)',
                          background:   'var(--theme-paper-subtle)',
                          border:       '1px solid var(--theme-paper-border)',
                          fontFamily:   'var(--font-sans)',
                          fontSize:     'var(--text-2xs)',
                          color:        'var(--theme-text-tertiary)',
                          flexShrink:   0,
                        }}
                      >
                        {m.role}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/*
        Hide preview column below 640px.
        Inlined here as a scoped style — the data attribute selector is
        specific enough that it won't bleed into other components.
      */}
      <style>{`@media(max-width:640px){[data-preview-col]{display:none!important}}`}</style>
    </Modal>
  );
}
