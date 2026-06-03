'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight,
  ChevronRight,
  Plus,
  User,
  Calendar,
  Eye,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { createSubtaskAction, getGroupSubtasksAction, getTaskRemarksAction, deleteGroupTaskAction } from '@/lib/actions/tasks';
import { TaskCompletionCircle } from '@/components/tasks/TaskCompletionCircle';
import { useTaskCompletionToggle } from '@/hooks/useTaskCompletionToggle';
import { canToggleTaskComplete } from '@/lib/utils/task-complete-auth';
import { formatRelativeTime } from '@/lib/utils/dates';
import { toast } from '@/lib/toast';
import { SubTaskModal, type SubTaskModalTaskUpdate } from '@/components/tasks/SubTaskModal';
import { TaskStatusIcon } from '@/components/tasks/TaskStatusIcon';
import { AssigneePickerModal, type AssignableUser } from '@/components/tasks/AssigneePickerModal';
import { CreateGroupTaskModal, type GroupTaskWithMeta } from '@/components/tasks/CreateGroupTaskModal';
import { TASK_STATUS, TASK_PRIORITY, GROUP_TASK_ACCENT_COLORS, GROUP_TASK_ICONS } from '@/lib/constants/task-constants';
import type { TaskGroupRow, SubtaskWithAssignee, TaskRemarkWithAuthor } from '@/lib/services/tasks-service';
import { Avatar } from '@/components/ui/Avatar';
import { AvatarStack } from '@/components/ui/AvatarStack';
import type { Task, TaskGroup, TaskStatus, TaskPriority, UserRole, AppDomain } from '@/lib/types/database';
import { TASK_STATUS_LABELS } from '@/lib/constants/task-types';
import { EASE_OUT_EXPO, ENTER_DURATION, FAST_DURATION } from '@/lib/constants/motion';
import {
  filterGroupRows,
  groupFiltersActiveCount,
  type GroupTaskFiltersState,
} from '@/lib/utils/task-client-filters';

// ─── Extended row type — carries UI-only accent/icon until DB migration ─────────

type GroupTaskRowWithMeta = TaskGroupRow & {
  accent_color?: string;
  icon_key?:     string;
};

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GroupTasksTabProps {
  initialRows:             TaskGroupRow[];
  filters:                 GroupTaskFiltersState;
  currentUserId:           string;
  currentUserName:         string;
  callerRole:              UserRole;
  callerDomain:            AppDomain;
  initialAgents:           AssignableUser[];
  createTrigger?:          number;
  onFilteredCountChange?:  (count: number) => void;
}

// ─── Deterministic fallback accent + icon from row id/title hash ──────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getAccentForRow(row: GroupTaskRowWithMeta): string {
  if (row.accent_color) return row.accent_color;
  return GROUP_TASK_ACCENT_COLORS[hashString(row.id) % GROUP_TASK_ACCENT_COLORS.length].hex;
}
function getIconForRow(row: GroupTaskRowWithMeta): string {
  if (row.icon_key) return row.icon_key;
  return GROUP_TASK_ICONS[hashString(row.title) % GROUP_TASK_ICONS.length].id;
}

// ─── Icon box — 32×32, accent tinted bg + icon ────────────────────────────────

function IconBox({
  accent,
  iconKey,
  highlighted = false,
}: {
  accent: string;
  iconKey: string;
  highlighted?: boolean;
}) {
  const IconComp = (LucideIcons as unknown as Record<string, React.ComponentType<{ style?: React.CSSProperties }>>)[iconKey];
  const bg = `${accent}20`;
  const ring = highlighted
    ? '0 0 0 2px var(--theme-paper), 0 0 0 4px var(--theme-accent)'
    : undefined;

  return (
    <div
      style={{
        width:          32,
        height:         32,
        minWidth:       32,
        borderRadius:   'var(--radius-md)',
        background:     bg,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        boxShadow:      ring,
        transition:     'box-shadow var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {IconComp ? (
        <IconComp style={{ width: 16, height: 16, strokeWidth: 1.5, color: accent } as React.CSSProperties} />
      ) : (
        <span style={{ display: 'block', width: 12, height: 12, borderRadius: '50%', background: accent }} />
      )}
    </div>
  );
}

// ─── Progress bar — 128px wide, h-1.5 track ───────────────────────────────────

function ProgressBar({ progress, accent }: { progress: number; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <div
        style={{
          width:        128,
          height:       6,
          borderRadius: 'var(--radius-full)',
          background:   'var(--theme-paper-border)',
          overflow:     'hidden',
          flexShrink:   0,
        }}
      >
        <div
          style={{
            height:       '100%',
            width:        `${progress}%`,
            borderRadius: 'var(--radius-full)',
            background:   accent,
            transition:   'width 0.5s var(--ease-in-out)',
          }}
        />
      </div>
      <span
        style={{
          fontFamily:    'var(--font-mono)',
          fontSize:      11,
          color:         'var(--theme-text-secondary)',
          width:         36,
          textAlign:     'right',
          flexShrink:    0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {progress}%
      </span>
    </div>
  );
}

// ─── Due date chip ─────────────────────────────────────────────────────────────

function DueDateChip({ dueAt }: { dueAt: string }) {
  const now = new Date();
  const due = new Date(dueAt);
  // strip to day comparison
  const isOverdue = due < now && due.toDateString() !== now.toDateString();
  const isToday   = due.toDateString() === now.toDateString();

  const day   = due.getDate();
  const month = due.toLocaleString('en-IN', { month: 'short' });
  const label = `${day} ${month}`;

  let bg   = 'var(--theme-paper-subtle)';
  let text = 'var(--theme-text-secondary)';
  if (isOverdue) { bg = 'var(--color-danger-light)'; text = 'var(--color-danger-text)'; }
  else if (isToday) { bg = 'var(--theme-accent-surface)'; text = 'var(--theme-accent-hover)'; }

  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          4,
        padding:      '2px 8px',
        borderRadius: 'var(--radius-full)',
        background:   bg,
        fontFamily:   'var(--font-sans)',
        fontSize:     11,
        color:        text,
        flexShrink:   0,
        whiteSpace:   'nowrap',
      }}
    >
      <Calendar style={{ width: 12, height: 12, strokeWidth: 1.5, flexShrink: 0 } as React.CSSProperties} />
      {label}
    </span>
  );
}

// ─── Subtask meta pills (status + priority) — matched height and padding ─────

const SUBTASK_META_PILL: React.CSSProperties = {
  display:        'inline-flex',
  alignItems:     'center',
  justifyContent: 'center',
  gap:            5,
  minHeight:      26,
  padding:        '0 var(--space-2)',
  borderRadius:   'var(--radius-full)',
  fontFamily:     'var(--font-sans)',
  fontSize:       'var(--text-2xs)',
  fontWeight:     'var(--weight-semibold)',
  letterSpacing:  '0.02em',
  whiteSpace:     'nowrap',
  flexShrink:     0,
  lineHeight:     1,
};

function PriorityPill({ priority }: { priority: TaskPriority }) {
  if (priority === 'normal') return null;
  const cfg = TASK_PRIORITY[priority];
  return (
    <span
      style={{
        ...SUBTASK_META_PILL,
        background: 'var(--theme-paper)',
        border:     `1px solid color-mix(in srgb, ${cfg.color} 24%, var(--theme-paper-border))`,
        color:      cfg.color,
      }}
    >
      <span
        style={{
          display:      'block',
          width:        6,
          height:       6,
          borderRadius: 'var(--radius-full)',
          background:   cfg.color,
          flexShrink:   0,
        }}
      />
      {cfg.label}
    </span>
  );
}

// ─── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: TaskStatus }) {
  const cfg = TASK_STATUS[status];
  return (
    <span
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           4,
        padding:       '2px 8px',
        borderRadius:  'var(--radius-full)',
        background:    cfg.pillBg,
        color:         cfg.pillText,
        fontFamily:    'var(--font-sans)',
        fontSize:      10,
        fontWeight:    'var(--weight-semibold)',
        letterSpacing: '0.04em',
        whiteSpace:    'nowrap',
        flexShrink:    0,
      }}
    >
      <TaskStatusIcon status={status} size={9} />
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Subtask status badge — colourful pastels ────────────────────────────────

const SUBTASK_STATUS_PASTEL: Record<TaskStatus, { bg: string; text: string; dot: string }> = {
  to_do:       { bg: 'var(--color-neutral-light)',  text: 'var(--color-neutral-text)',  dot: 'var(--color-neutral)' },
  in_progress: { bg: 'var(--color-warning-light)',  text: 'var(--color-warning-text)',  dot: 'var(--color-warning)' },
  in_review:   { bg: 'var(--color-info-light)',     text: 'var(--color-info-text)',     dot: 'var(--color-info)' },
  completed:   { bg: 'var(--color-success-light)',  text: 'var(--color-success-text)',  dot: 'var(--color-success)' },
  error:       { bg: 'var(--color-danger-light)',   text: 'var(--color-danger-text)',   dot: 'var(--color-danger)' },
  cancelled:   { bg: 'var(--color-neutral-light)',  text: 'var(--color-neutral-text)',  dot: 'var(--color-neutral)' },
};

function SubtaskStatusBadge({ status }: { status: TaskStatus }) {
  const p = SUBTASK_STATUS_PASTEL[status];
  return (
    <span
      style={{
        ...SUBTASK_META_PILL,
        background: p.bg,
        border:     `1px solid color-mix(in srgb, ${p.dot} 18%, transparent)`,
        color:      p.text,
      }}
    >
      <span
        style={{
          display:      'block',
          width:        6,
          height:       6,
          borderRadius: 'var(--radius-full)',
          background:   p.dot,
          flexShrink:   0,
          animation:    status === 'in_progress' ? 'eia-subtask-pulse 2s ease-in-out infinite' : 'none',
        }}
      />
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Group row ─────────────────────────────────────────────────────────────────

interface GroupRowProps {
  group:            GroupTaskRowWithMeta;
  isExpanded:       boolean;
  onToggle:         () => void;
  currentUserId:    string;
  currentUserName:  string;
  callerRole:       UserRole;
  callerDomain:     AppDomain;
  assignableUsers:  AssignableUser[];
  index:            number;
  onGroupCountsChange?: (groupId: string, patch: { completedDelta?: number; subtaskDelta?: number }) => void;
  onGroupDeleted?:      (groupId: string) => void;
}

const HEADER_CLICK_DELAY_MS = 220;

function GroupRow({
  group,
  isExpanded,
  onToggle,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
  assignableUsers,
  index,
  onGroupCountsChange,
  onGroupDeleted,
}: GroupRowProps) {
  const router = useRouter();
  const accent   = getAccentForRow(group);
  const iconKey  = getIconForRow(group);
  const progress = group.subtask_count > 0
    ? Math.round((group.completed_count / group.subtask_count) * 100)
    : 0;

  const headerClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openWorkspace = useCallback(() => {
    router.push(`/tasks/${group.id}`);
  }, [router, group.id]);

  const handleHeaderClick = useCallback(() => {
    if (headerClickTimerRef.current) clearTimeout(headerClickTimerRef.current);
    headerClickTimerRef.current = setTimeout(() => {
      headerClickTimerRef.current = null;
      onToggle();
    }, HEADER_CLICK_DELAY_MS);
  }, [onToggle]);

  const handleHeaderDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (headerClickTimerRef.current) {
      clearTimeout(headerClickTimerRef.current);
      headerClickTimerRef.current = null;
    }
    openWorkspace();
  }, [openWorkspace]);

  useEffect(() => () => {
    if (headerClickTimerRef.current) clearTimeout(headerClickTimerRef.current);
  }, []);

  const [subtasks,           setSubtasks]           = useState<SubtaskWithAssignee[]>([]);
  const [subtasksLoaded,     setSubtasksLoaded]     = useState(false);
  const [isLoadingSubtasks,  setIsLoadingSubtasks]  = useState(false);

  const [showAddSubtask,     setShowAddSubtask]     = useState(false);
  const [subtaskTitle,       setSubtaskTitle]       = useState('');
  const [subtaskAssignee,    setSubtaskAssignee]    = useState<AssignableUser | null>(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [isSaving,           setIsSaving]           = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const [headerHovered,          setHeaderHovered]          = useState(false);
  const [hoveredSubtaskId,       setHoveredSubtaskId]       = useState<string | null>(null);

  const [selectedSubtask,        setSelectedSubtask]        = useState<SubtaskWithAssignee | null>(null);
  const [selectedSubtaskRemarks, setSelectedSubtaskRemarks] = useState<TaskRemarkWithAuthor[] | null>(null);
  const [modalOpen,              setModalOpen]              = useState(false);

  const [moreMenuOpen,      setMoreMenuOpen]      = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting,        setIsDeleting]        = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close more-menu on outside click
  useEffect(() => {
    if (!moreMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreMenuOpen]);

  async function handleDeleteGroup() {
    setIsDeleting(true);
    const result = await deleteGroupTaskAction({ groupId: group.id });
    setIsDeleting(false);
    if (result.error) {
      toast.danger('Failed to delete group task', { message: result.error });
      return;
    }
    toast.success('Group task deleted');
    setConfirmDeleteOpen(false);
    onGroupDeleted?.(group.id);
  }

  const defaultAssignee = useMemo(
    () => assignableUsers.find((u) => u.id === currentUserId) ?? null,
    [assignableUsers, currentUserId],
  );

  function handleOpenSubtask(subtask: SubtaskWithAssignee) {
    setSelectedSubtask(subtask);
    setSelectedSubtaskRemarks(null);
    getTaskRemarksAction(subtask.id).then((r) => {
      setSelectedSubtaskRemarks(r.data ?? []);
    }).catch(() => setSelectedSubtaskRemarks([]));
    setModalOpen(true);
  }

  function handleModalClose() {
    setModalOpen(false);
    setSelectedSubtaskRemarks(null);
    setSelectedSubtask(null);
    if (subtasksLoaded) {
      getGroupSubtasksAction(group.id).then((r) => {
        if (r.data) setSubtasks(r.data);
      }).catch(() => {});
    }
  }

  const handleSubtaskUpdated = useCallback((update: SubTaskModalTaskUpdate) => {
    setSubtasks((prev) => {
      const existing = prev.find((s) => s.id === update.id);
      if (!existing) return prev;

      if (update.status && update.status !== existing.status) {
        const wasCompleted = existing.status === 'completed';
        const isCompleted = update.status === 'completed';
        if (wasCompleted !== isCompleted) {
          onGroupCountsChange?.(group.id, {
            completedDelta: isCompleted ? 1 : -1,
          });
        }
      }

      return prev.map((s) =>
        s.id === update.id ? { ...s, ...update } : s,
      );
    });
    setSelectedSubtask((prev) =>
      prev?.id === update.id ? { ...prev, ...update } : prev,
    );
  }, [group.id, onGroupCountsChange]);

  const handleSubtaskDeleted = useCallback((taskId: string) => {
    setSubtasks((prev) => {
      const removed = prev.find((s) => s.id === taskId);
      if (removed) {
        onGroupCountsChange?.(group.id, {
          subtaskDelta: -1,
          completedDelta: removed.status === 'completed' ? -1 : 0,
        });
      }
      return prev.filter((s) => s.id !== taskId);
    });
    setSelectedSubtask(null);
    setModalOpen(false);
  }, [group.id, onGroupCountsChange]);

  const [, startTransition] = useTransition();
  const { getEffectiveStatus, handleToggle } = useTaskCompletionToggle();
  const caller = { id: currentUserId, role: callerRole, domain: callerDomain };

  useEffect(() => {
    if (!isExpanded || subtasksLoaded) return;
    let cancelled = false;
    setIsLoadingSubtasks(true);
    getGroupSubtasksAction(group.id).then((result) => {
      if (cancelled) return;
      if (result.data) setSubtasks(result.data);
      setSubtasksLoaded(true);
      setIsLoadingSubtasks(false);
    });
    return () => { cancelled = true; };
  }, [isExpanded, subtasksLoaded, group.id]);

  useEffect(() => {
    if (!showAddSubtask) return;
    setSubtaskAssignee(defaultAssignee);
    setTimeout(() => subtaskInputRef.current?.focus(), 60);
  }, [showAddSubtask, defaultAssignee]);

  const handleAddSubtask = useCallback(() => {
    if (!subtaskTitle.trim()) { subtaskInputRef.current?.focus(); return; }
    const assigneeId = subtaskAssignee?.id ?? currentUserId;
    setIsSaving(true);
    startTransition(async () => {
      const result = await createSubtaskAction({
        group_id:    group.id,
        title:       subtaskTitle.trim(),
        priority:    'normal',
        assigned_to: assigneeId,
      });
      setIsSaving(false);
      if (result.error) { toast.danger('Failed to create subtask', { message: result.error }); return; }
      toast.success('Subtask created');
      setSubtaskTitle('');
      setSubtaskAssignee(null);
      setShowAddSubtask(false);
      setSubtasks((prev) => [...prev, result.data!]);
      onGroupCountsChange?.(group.id, { subtaskDelta: 1 });
    });
  }, [subtaskTitle, subtaskAssignee, currentUserId, group.id, startTransition, onGroupCountsChange]);

  function handleSubtaskKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  handleAddSubtask();
    if (e.key === 'Escape') { setShowAddSubtask(false); setSubtaskTitle(''); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, delay: Math.min(index * 0.04, 0.28), ease: EASE_OUT_EXPO }}
      style={{
        borderRadius: '16px',
        overflow:     'hidden',
        background:   'var(--theme-paper)',
        boxShadow:    'var(--shadow-1)',
        border:       '1px solid var(--theme-paper-border)',
        transition:   'box-shadow 0.2s var(--ease-in-out)',
      }}
    >
      {/* ── Collapsed header row ───────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleHeaderClick}
        onDoubleClick={handleHeaderDoubleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        12,
          padding:    '16px 20px',
          cursor:     'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        {/* Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
          style={{ display: 'flex', alignItems: 'center', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}
        >
          <ChevronRight style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
        </motion.div>

        {/* Icon box */}
        <IconBox accent={accent} iconKey={iconKey} highlighted={headerHovered} />

        {/* Title — grows, truncates */}
        <span
          style={{
            flex:           1,
            minWidth:       0,
            fontFamily:     'var(--font-serif)',
            fontSize:       15,
            fontWeight:     600,
            color:          group.status === 'completed' ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)',
            textDecoration: group.status === 'completed' ? 'line-through' : 'none',
            overflow:       'hidden',
            textOverflow:   'ellipsis',
            whiteSpace:     'nowrap',
          }}
        >
          {group.title}
        </span>

        {/* Metrics cluster — stop propagation so clicks don't toggle */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Open workspace — click; row double-click also navigates */}
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openWorkspace();
            }}
            aria-label={`Open ${group.title}`}
            title="Open workspace (double-click row)"
            whileTap={{ scale: 0.92 }}
            transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            5,
              padding:        '5px 11px',
              borderRadius:   'var(--radius-full)',
              border:         '1px solid var(--theme-paper-border)',
              background:     'transparent',
              color:          'var(--theme-text-tertiary)',
              fontFamily:     'var(--font-sans)',
              fontSize:       11,
              fontWeight:     'var(--weight-medium)',
              letterSpacing:  '0.06em',
              textTransform:  'uppercase',
              flexShrink:     0,
              cursor:         'pointer',
            }}
          >
            Open
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <ArrowUpRight style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
            </span>
          </motion.button>

          {/* Member avatars */}
          {group.assignee_previews.length > 0 && (
            <AvatarStack
              users={group.assignee_previews.map((p) => ({
                id:       p.id,
                name:     p.full_name,
                imageUrl: p.avatar_url ?? undefined,
              }))}
              size="xs"
              max={4}
              overlap={6}
            />
          )}

          {/* Progress bar + % */}
          <ProgressBar progress={progress} accent={accent} />

          {/* Done count */}
          <span
            style={{
              fontFamily:         'var(--font-mono)',
              fontSize:           12,
              color:              'var(--theme-text-secondary)',
              width:              64,
              textAlign:          'right',
              flexShrink:         0,
              whiteSpace:         'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {group.completed_count}/{group.subtask_count} done
          </span>

          {/* Due date chip */}
          {group.due_at && <DueDateChip dueAt={group.due_at} />}

          {/* ⋯ more menu — admin/founder only */}
          {(callerRole === 'admin' || callerRole === 'founder') && (
            <div ref={moreMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMoreMenuOpen((v) => !v); }}
                aria-label="More options"
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  width:          28,
                  height:         28,
                  borderRadius:   'var(--radius-sm)',
                  border:         '1px solid var(--theme-paper-border)',
                  background:     moreMenuOpen ? 'var(--theme-paper-subtle)' : 'transparent',
                  color:          'var(--theme-text-tertiary)',
                  cursor:         'pointer',
                  transition:     'var(--transition-hover)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)'; }}
                onMouseLeave={(e) => { if (!moreMenuOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <MoreHorizontal style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
              </button>

              <AnimatePresence>
                {moreMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position:    'absolute',
                      top:         'calc(100% + 4px)',
                      right:       0,
                      zIndex:      'var(--z-dropdown)' as React.CSSProperties['zIndex'],
                      background:  'var(--theme-paper)',
                      border:      '1px solid var(--theme-paper-border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow:   'var(--shadow-3)',
                      minWidth:    148,
                      padding:     'var(--space-1)',
                      overflow:    'hidden',
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMoreMenuOpen(false);
                        setConfirmDeleteOpen(true);
                      }}
                      style={{
                        display:        'flex',
                        alignItems:     'center',
                        gap:            'var(--space-2)',
                        width:          '100%',
                        padding:        'var(--space-2) var(--space-3)',
                        borderRadius:   'var(--radius-sm)',
                        border:         'none',
                        background:     'transparent',
                        color:          'var(--color-danger-text)',
                        fontFamily:     'var(--font-sans)',
                        fontSize:       'var(--text-sm)',
                        cursor:         'pointer',
                        textAlign:      'left',
                        transition:     'var(--transition-hover)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-danger-light)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <Trash2 style={{ width: 14, height: 14, strokeWidth: 1.5, flexShrink: 0 }} />
                      Delete group
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm delete dialog ────────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmDeleteOpen && (
          <>
            <motion.div
              key="delete-group-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => { e.stopPropagation(); if (!isDeleting) setConfirmDeleteOpen(false); }}
              style={{
                position:   'fixed',
                inset:      0,
                background: 'var(--overlay-bg-light)',
                zIndex:     'var(--z-modal-overlay)' as React.CSSProperties['zIndex'],
              }}
            />
            <motion.div
              key="delete-group-dialog"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position:       'fixed',
                top:            '50%',
                left:           '50%',
                transform:      'translate(-50%, -50%)',
                zIndex:         'var(--z-modal)' as React.CSSProperties['zIndex'],
                background:     'var(--theme-paper)',
                borderRadius:   'var(--radius-lg)',
                boxShadow:      'var(--shadow-4)',
                width:          'min(420px, calc(100vw - var(--space-8)))',
                padding:        'var(--space-6)',
              }}
            >
              <h3
                style={{
                  fontFamily:  'var(--font-serif)',
                  fontSize:    'var(--text-lg)',
                  fontWeight:  'var(--weight-semibold)',
                  color:       'var(--theme-text-primary)',
                  margin:      '0 0 var(--space-2)',
                }}
              >
                Delete group task?
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-secondary)',
                  margin:     '0 0 var(--space-5)',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: 'var(--theme-text-primary)' }}>{group.title}</strong> and all its subtasks will be permanently deleted. This cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteOpen(false); }}
                  disabled={isDeleting}
                  style={{
                    padding:      'var(--space-2) var(--space-4)',
                    borderRadius: 'var(--radius-sm)',
                    border:       '1px solid var(--theme-paper-border)',
                    background:   'transparent',
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-sm)',
                    color:        'var(--theme-text-secondary)',
                    cursor:       isDeleting ? 'not-allowed' : 'pointer',
                    opacity:      isDeleting ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteGroup(); }}
                  disabled={isDeleting}
                  style={{
                    padding:      'var(--space-2) var(--space-4)',
                    borderRadius: 'var(--radius-sm)',
                    border:       'none',
                    background:   isDeleting ? 'var(--color-danger-light)' : 'var(--color-danger)',
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-sm)',
                    fontWeight:   'var(--weight-semibold)',
                    color:        isDeleting ? 'var(--color-danger-text)' : 'var(--color-danger-fg, #fff)',
                    cursor:       isDeleting ? 'not-allowed' : 'pointer',
                    transition:   'var(--transition-interactive)',
                  }}
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Expanded subtasks ───────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key={`subtasks-${group.id}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ height: 1, background: 'var(--theme-paper-border)' }} />

            <div style={{ background: 'var(--theme-paper-subtle)' }}>

              {isLoadingSubtasks && (
                <div style={{ padding: 'var(--space-3) var(--space-5) var(--space-2)' }}>
                  {[80, 55, 70].map((w, i) => (
                    <div
                      key={i}
                      style={{
                        height:       10,
                        width:        `${w}%`,
                        borderRadius: 'var(--radius-full)',
                        background:   'var(--theme-paper-border)',
                        marginBottom: i < 2 ? 'var(--space-3)' : 0,
                        animation:    `pulse 1.5s ${i * 0.1}s ease-in-out infinite`,
                      }}
                    />
                  ))}
                </div>
              )}

              {!isLoadingSubtasks && subtasks.length === 0 && !showAddSubtask && (
                <div style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
                  <p
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontStyle:  'italic',
                      fontSize:   'var(--text-sm)',
                      color:      'var(--theme-text-tertiary)',
                      margin:     0,
                    }}
                  >
                    No subtasks yet.
                  </p>
                </div>
              )}

              {!isLoadingSubtasks && subtasks.map((subtask, i) => {
                const effectiveStatus = getEffectiveStatus(subtask.id, subtask.status);
                const isSubComplete =
                  effectiveStatus === 'completed' ||
                  effectiveStatus === 'cancelled';
                const canComplete =
                  canToggleTaskComplete(subtask, caller, group.domain) &&
                  effectiveStatus !== 'cancelled' &&
                  effectiveStatus !== 'error';

                return (
                  <motion.div
                    key={subtask.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(i * 0.035, 0.2), ease: EASE_OUT_EXPO }}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenSubtask(subtask)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleOpenSubtask(subtask);
                    }}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      gap:          'var(--space-3)',
                      padding:      '10px 20px 10px 24px',
                      cursor:       'pointer',
                      borderBottom: i < subtasks.length - 1 ? '1px solid var(--theme-paper-border)' : 'none',
                      position:     'relative',
                    }}
                    onMouseEnter={() => setHoveredSubtaskId(subtask.id)}
                    onMouseLeave={() => setHoveredSubtaskId(null)}
                  >
                    <TaskCompletionCircle
                      checked={effectiveStatus === 'completed'}
                      disabled={!canComplete}
                      highlighted={hoveredSubtaskId === subtask.id}
                      onToggle={(e) =>
                        handleToggle(e, subtask, (newStatus) => {
                          setSubtasks((prev) =>
                            prev.map((s) =>
                              s.id === subtask.id ? { ...s, status: newStatus } : s,
                            ),
                          );
                        })
                      }
                    />

                    {/* Title */}
                    <span
                      style={{
                        flex:           1,
                        fontFamily:     'var(--font-sans)',
                        fontSize:       13,
                        fontWeight:     'var(--weight-medium)',
                        color:          isSubComplete ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)',
                        textDecoration: effectiveStatus === 'completed' ? 'line-through' : 'none',
                        overflow:       'hidden',
                        textOverflow:   'ellipsis',
                        whiteSpace:     'nowrap',
                        minWidth:       0,
                      }}
                    >
                      {subtask.title}
                    </span>

                    {/* Meta cluster — status, priority, assignee, due */}
                    <div
                      style={{
                        display:    'flex',
                        alignItems: 'center',
                        gap:        'var(--space-2)',
                        flexShrink: 0,
                      }}
                    >
                      <SubtaskStatusBadge status={effectiveStatus} />
                      <PriorityPill priority={subtask.priority} />

                      {subtask.assignee && (
                        <span
                          style={{
                            display:        'inline-flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            width:          26,
                            height:         26,
                            minWidth:       26,
                            borderRadius:   'var(--radius-full)',
                            background:     'color-mix(in srgb, var(--theme-accent) 14%, var(--theme-paper))',
                            border:         '1px solid var(--theme-paper-border)',
                            flexShrink:     0,
                            opacity:        isSubComplete ? 0.45 : 1,
                          }}
                          title={subtask.assignee.full_name}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontSize:   9,
                              fontWeight: 'var(--weight-semibold)' as React.CSSProperties['fontWeight'],
                              color:      'var(--theme-accent-hover)',
                              lineHeight: 1,
                              userSelect: 'none',
                            }}
                          >
                            {subtask.assignee.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        </span>
                      )}

                      {subtask.due_at && <DueDateChip dueAt={subtask.due_at} />}
                    </div>

                    <span
                      style={{
                        display:        'inline-flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        padding:        '4px 8px',
                        borderRadius:   'var(--radius-full)',
                        background:     'var(--theme-accent-surface)',
                        color:          'var(--theme-accent)',
                        flexShrink:     0,
                        cursor:         'pointer',
                      }}
                    >
                      <Eye style={{ width: 14, height: 14, strokeWidth: 1.5 } as React.CSSProperties} />
                    </span>
                  </motion.div>
                );
              })}

              {/* Add subtask row */}
              <AnimatePresence>
                {showAddSubtask ? (
                  <motion.div
                    key="add-subtask-row"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        display:    'flex',
                        alignItems: 'center',
                        gap:        'var(--space-2)',
                        padding:      'var(--space-3) var(--space-4)',
                        borderRadius: 'var(--radius-md)',
                        background:   'var(--theme-paper)',
                        border:       '1px solid color-mix(in srgb, var(--theme-paper-border) 70%, transparent)',
                      }}
                    >
                      <input
                        ref={subtaskInputRef}
                        type="text"
                        value={subtaskTitle}
                        onChange={(e) => setSubtaskTitle(e.target.value)}
                        onKeyDown={handleSubtaskKeyDown}
                        placeholder="Subtask title…"
                        style={{
                          flex:       1,
                          border:     'none',
                          outline:    'none',
                          background: 'transparent',
                          fontFamily: 'var(--font-sans)',
                          fontSize:   'var(--text-sm)',
                          color:      'var(--theme-text-primary)',
                          caretColor: accent,
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowAssigneePicker(true); }}
                        aria-label="Pick assignee"
                        title={subtaskAssignee ? subtaskAssignee.full_name : (defaultAssignee?.full_name ?? 'You (default assignee)')}
                        style={{
                          display:        'flex',
                          alignItems:     'center',
                          justifyContent: 'center',
                          width:          28,
                          height:         28,
                          borderRadius:   'var(--radius-sm)',
                          border:         '1px solid var(--theme-paper-border)',
                          background:     subtaskAssignee ? `color-mix(in srgb, ${accent} 12%, transparent)` : 'transparent',
                          color:          subtaskAssignee ? accent : 'var(--theme-text-tertiary)',
                          cursor:         'pointer',
                          flexShrink:     0,
                        }}
                      >
                        {subtaskAssignee ? (
                          <Avatar name={subtaskAssignee.full_name} size="xs" style={{ width: 14, height: 14, minWidth: 14 }} />
                        ) : (
                          <User style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleAddSubtask(); }}
                        disabled={isSaving || !subtaskTitle.trim()}
                        style={{
                          padding:      '4px 14px',
                          borderRadius: 'var(--radius-sm)',
                          border:       'none',
                          background:   subtaskTitle.trim() ? accent : 'var(--theme-paper-border)',
                          color:        subtaskTitle.trim() ? 'var(--theme-accent-fg)' : 'var(--theme-text-tertiary)',
                          fontFamily:   'var(--font-sans)',
                          fontSize:     12,
                          fontWeight:   'var(--weight-semibold)',
                          cursor:       subtaskTitle.trim() ? 'pointer' : 'not-allowed',
                          flexShrink:   0,
                          transition:   'background 0.15s, color 0.15s',
                        }}
                      >
                        {isSaving ? 'Adding…' : 'Add'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowAddSubtask(false); setSubtaskTitle(''); }}
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize:   12,
                          color:      'var(--theme-text-tertiary)',
                          background: 'transparent',
                          border:     'none',
                          cursor:     'pointer',
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--theme-text-secondary)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--theme-text-tertiary)'; }}
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="add-subtask-trigger"
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={(e) => { e.stopPropagation(); setShowAddSubtask(true); }}
                    style={{
                      display:    'flex',
                      alignItems: 'center',
                      gap:        'var(--space-2)',
                      width:      '100%',
                      padding:    'var(--space-2) var(--space-5)',
                      border:     'none',
                      borderRadius: 'var(--radius-md)',
                      background:   'transparent',
                      fontFamily:   'var(--font-sans)',
                      fontSize:     12,
                      color:        'var(--theme-text-tertiary)',
                      cursor:       'pointer',
                      textAlign:    'left',
                      transition:   'color 0.14s, background 0.14s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--theme-text-secondary)';
                      e.currentTarget.style.background = 'var(--theme-paper)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--theme-text-tertiary)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Plus style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
                    Add subtask
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {selectedSubtask && modalOpen && selectedSubtaskRemarks !== null && (
                <SubTaskModal
                  open={modalOpen}
                  onClose={handleModalClose}
                  task={selectedSubtask as Task}
                  group={group as TaskGroup}
                  assignee={selectedSubtask.assignee ?? undefined}
                  initialRemarks={selectedSubtaskRemarks}
                  callerProfile={{ id: currentUserId, role: callerRole, domain: callerDomain }}
                  currentUserName={currentUserName}
                  onTaskUpdated={handleSubtaskUpdated}
                  onTaskDeleted={handleSubtaskDeleted}
                />
              )}
            </AnimatePresence>

            {typeof window !== 'undefined' &&
              createPortal(
                <AssigneePickerModal
                  open={showAssigneePicker}
                  onClose={() => setShowAssigneePicker(false)}
                  onConfirm={(userId, user) => {
                    setSubtaskAssignee(user);
                    setShowAssigneePicker(false);
                  }}
                  users={assignableUsers}
                  initialDomain={callerDomain}
                />,
                document.body,
              )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function GroupTasksTab({
  initialRows,
  filters,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
  initialAgents,
  createTrigger = 0,
  onFilteredCountChange,
}: GroupTasksTabProps) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupRows, setGroupRows] = useState<GroupTaskRowWithMeta[]>(initialRows);

  useEffect(() => {
    setGroupRows(initialRows);
  }, [initialRows]);

  const filteredRows = useMemo(
    () => filterGroupRows(groupRows, filters),
    [groupRows, filters],
  );

  const hasActiveFilters = groupFiltersActiveCount(filters) > 0;

  useEffect(() => {
    onFilteredCountChange?.(filteredRows.length);
  }, [filteredRows.length, onFilteredCountChange]);

  // Agents are pre-fetched by TasksAsync (SSR) and passed as initialAgents.
  // No mount-time action call needed.
  const assignableUsers: AssignableUser[] = initialAgents;

  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    if (createTrigger > 0) setCreateModalOpen(true);
  }, [createTrigger]);

  function toggleGroup(id: string) {
    setExpandedGroupId((prev) => (prev === id ? null : id));
  }

  const handleGroupCountsChange = useCallback((
    groupId: string,
    patch: { completedDelta?: number; subtaskDelta?: number },
  ) => {
    setGroupRows((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const completed = Math.max(
          0,
          g.completed_count + (patch.completedDelta ?? 0),
        );
        const subtaskCount = Math.max(
          0,
          g.subtask_count + (patch.subtaskDelta ?? 0),
        );
        return { ...g, completed_count: completed, subtask_count: subtaskCount };
      }),
    );
  }, []);

  function handleGroupCreated(group: GroupTaskWithMeta) {
    const row: GroupTaskRowWithMeta = {
      ...group,
      subtask_count:     0,
      completed_count:   0,
      assignee_previews: [],
      accent_color:      group.accent_color,
      icon_key:          group.icon_key,
    };
    setGroupRows((prev) => [row, ...prev]);
    setCreateModalOpen(false);
  }

  const handleGroupDeleted = useCallback((groupId: string) => {
    setGroupRows((prev) => prev.filter((g) => g.id !== groupId));
    setExpandedGroupId((prev) => (prev === groupId ? null : prev));
  }, []);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

      {filteredRows.length === 0 ? (
        <div
          style={{
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-lg)',
            padding:      'var(--space-16) var(--space-8)',
            textAlign:    'center',
            background:   'var(--theme-paper)',
            boxShadow:    'var(--shadow-1)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle:  'italic',
              fontSize:   'var(--text-lg)',
              color:      'var(--theme-text-tertiary)',
              margin:     0,
            }}
          >
            {groupRows.length === 0
              ? 'No group tasks yet.'
              : hasActiveFilters
                ? 'Nothing matches your filters.'
                : 'No group tasks yet.'}
          </p>
          <p
            style={{
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-tertiary)',
              marginTop:    'var(--space-2)',
              marginBottom: 0,
            }}
          >
            {groupRows.length === 0
              ? 'Use the button above to create one.'
              : hasActiveFilters
                ? 'Try adjusting your search or filters.'
                : null}
          </p>
        </div>
      ) : (
        filteredRows.map((group, idx) => (
          <GroupRow
            key={group.id}
            group={group}
            isExpanded={expandedGroupId === group.id}
            onToggle={() => toggleGroup(group.id)}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            callerRole={callerRole}
            callerDomain={callerDomain}
            assignableUsers={assignableUsers}
            index={idx}
            onGroupCountsChange={handleGroupCountsChange}
            onGroupDeleted={handleGroupDeleted}
          />
        ))
      )}

      <CreateGroupTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleGroupCreated}
        callerRole={callerRole}
        callerDomain={callerDomain}
      />
    </div>
  );
}
