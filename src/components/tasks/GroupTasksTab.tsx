'use client';

import { MotionButton } from '@/components/ui/MotionButton';
import { Button } from '@/components/ui/Button';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
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
import { createSubtaskAction, getGroupSubtasksAction, getTaskRemarksAction, deleteGroupTaskAction, deleteTaskAction } from '@/lib/actions/tasks';
import { TaskCompletionCircle } from '@/components/tasks/TaskCompletionCircle';
import { useCreateTriggerModal } from '@/hooks/useCreateTriggerModal';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import { useMountOnFirstOpen } from '@/hooks/useMountOnFirstOpen';
import { useTaskCompletionToggle } from '@/hooks/useTaskCompletionToggle';
import { canToggleTaskComplete } from '@/lib/utils/task-complete-auth';
import { formatDate } from '@/lib/utils/dates';
import { getInitials, hashString } from '@/lib/utils/strings';
import { toast } from '@/lib/toast';
import type { SubTaskModalTaskUpdate } from '@/components/tasks/SubTaskModal';
import { AssigneePickerModal } from '@/components/tasks/AssigneePickerModal';
import type { AssignableUser } from '@/lib/types';
import type { GroupTaskWithMeta } from '@/components/tasks/CreateGroupTaskModal';
import { TASK_PRIORITY, GROUP_TASK_ACCENT_COLORS, GROUP_TASK_ICONS } from '@/lib/constants/task-constants';
import type { TaskGroupRow, SubtaskWithAssignee, TaskRemarkWithAuthor } from '@/lib/services/tasks-service';
import { Avatar } from '@/components/ui/Avatar';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { CollapseReveal } from '@/components/ui/CollapseReveal';
import { MotionRow } from '@/components/ui/RowMotion';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { LoadingVeil } from '@/components/ui/LogoSpinner';
import type { Task, TaskGroup, TaskStatus, TaskPriority, UserRole, AppDomain } from '@/lib/types/database';
import { TASK_STATUS_LABELS } from '@/lib/constants/task-types';
import { BASE_DURATION, EASE_OUT_EXPO, ENTER_DURATION, EXIT_DURATION, FAST_DURATION } from '@/lib/constants/motion';
import {
  filterGroupRows,
  groupFiltersActiveCount,
  type GroupTaskFiltersState,
} from '@/lib/utils/task-client-filters';
import { EmptyState } from '@/components/ui/EmptyState';

// Load-on-intent (perf audit G-1): SubTaskModal (1,672 lines) and
// CreateGroupTaskModal (974 lines) stay out of the /tasks route chunk until
// a row / the create trigger is first opened.
const SubTaskModal = dynamic(
  () => import('@/components/tasks/SubTaskModal').then((m) => m.SubTaskModal),
  { ssr: false },
);
const CreateGroupTaskModal = dynamic(
  () => import('@/components/tasks/CreateGroupTaskModal').then((m) => m.CreateGroupTaskModal),
  { ssr: false },
);

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

  const label = formatDate(due, 'd MMM');

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
          animation:    status === 'in_progress' ? 'serene-subtask-pulse 2s ease-in-out infinite' : 'none',
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
  onToggle:         (groupId: string) => void;
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

// memo (G-4): row objects keep their identity across filter keystrokes and
// expand/collapse, and every callback prop is useCallback'd in the parent —
// so toggling one group re-renders two rows, not the whole accordion.
const GroupRow = memo(function GroupRow({
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
  // Below --bp-md the fixed metrics cluster (~480px) cannot share one row with
  // the title — it wraps to its own line(s) under the title row.
  const isMobile = useMediaQuery(MQ.mobile);
  // A finger has no double-click: on a coarse pointer a header tap toggles at
  // once (the 220ms wait also invites iOS double-tap zoom); the "Open" button
  // is the way into the workspace there (mobile audit 2026-09-26).
  const isTouch  = useMediaQuery(MQ.touch);
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
    if (isTouch) {
      onToggle(group.id);
      return;
    }
    headerClickTimerRef.current = setTimeout(() => {
      headerClickTimerRef.current = null;
      onToggle(group.id);
    }, HEADER_CLICK_DELAY_MS);
  }, [onToggle, group.id, isTouch]);

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
  const moreMenuRef     = useRef<HTMLDivElement>(null);
  const moreButtonRef   = useRef<HTMLButtonElement>(null);
  const [menuRect,          setMenuRect]          = useState<{ top: number; right: number } | null>(null);

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
  // Who the add-subtask row will assign — the picker button shows only an
  // avatar, so the name rides its tooltip and its aria-label.
  const subtaskAssigneeName = subtaskAssignee
    ? subtaskAssignee.full_name
    : (defaultAssignee?.full_name ?? 'You (default assignee)');

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

  // Undo-instead-of-confirm (polish §06): the subtask row exits immediately
  // (MotionRow), its group counts adjust, and a charcoal undo toast counts down
  // 5s. deleteTaskAction fires ONLY on timeout (not on Undo) via the toast's
  // onTimeout — that timer lives in the singleton store, so the commit still
  // fires if this row/panel unmounts. Undo re-inserts the row and re-adds counts.
  const handleSubtaskDeferDelete = useCallback((taskId: string) => {
    const removed = subtasks.find((s) => s.id === taskId);
    if (!removed) return;
    const wasCompleted = removed.status === 'completed';

    setSubtasks((prev) => prev.filter((s) => s.id !== taskId));
    onGroupCountsChange?.(group.id, {
      subtaskDelta: -1,
      completedDelta: wasCompleted ? -1 : 0,
    });
    setSelectedSubtask(null);
    setModalOpen(false);

    const restore = () => {
      setSubtasks((prev) =>
        prev.some((s) => s.id === taskId) ? prev : [...prev, removed],
      );
      onGroupCountsChange?.(group.id, {
        subtaskDelta: 1,
        completedDelta: wasCompleted ? 1 : 0,
      });
    };

    toast.undo('Subtask deleted', {
      action: { label: 'Undo', onClick: restore },
      onTimeout: () => {
        void deleteTaskAction({ taskId }).then((result) => {
          if (result.error) {
            restore();
            toast.danger("Couldn't delete subtask", { message: result.error });
          }
        });
      },
    });
  }, [subtasks, group.id, onGroupCountsChange]);

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
        onDoubleClick={isTouch ? undefined : handleHeaderDoubleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(group.id); }}
        style={{
          display:    'flex',
          alignItems: 'center',
          flexWrap:   isMobile ? 'wrap' : 'nowrap',
          gap:        12,
          padding:    isMobile ? '14px 16px' : '16px 20px',
          cursor:     'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        {/* Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
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

        {/* Metrics cluster — stop propagation so clicks don't toggle.
            Mobile: full-width second line, wrapping, indented past the chevron. */}
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        12,
            flexShrink: 0,
            ...(isMobile
              ? {
                  flexBasis:   '100%',
                  minWidth:    0,
                  flexWrap:    'wrap' as const,
                  rowGap:      8,
                  paddingLeft: 28,
                }
              : null),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Open workspace — click; row double-click also navigates */}
          <Tooltip label="Open workspace (double-click row)" side="top">
          <MotionButton
          variant="ghost" size="sm"
          type="button"
          onClick={(e) => {
              e.stopPropagation();
              openWorkspace();
            }}
          aria-label={`Open ${group.title}`}
          className="serene-icon-lift-hover"
          whileTap={{ scale: 0.92 }}
          transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
          style={{display:        'inline-flex', alignItems:     'center', gap:            5, padding:        '5px 11px', fontSize:       11, letterSpacing:  '0.06em', textTransform:  'uppercase', flexShrink:     0}}
        >
            Open
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <ArrowUpRight style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
            </span>
          </MotionButton>
          </Tooltip>

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
              <Button
                variant="ghost"
                iconOnly size="sm"
                ref={moreButtonRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!moreMenuOpen && moreButtonRef.current) {
                    const r = moreButtonRef.current.getBoundingClientRect();
                    setMenuRect({ top: r.bottom + 4, right: window.innerWidth - r.right });
                  }
                  setMoreMenuOpen((v) => !v);
                }}
                aria-label="More options"
                className="serene-touch"
                style={{ display:        'flex', alignItems:     'center', justifyContent: 'center', width:          28, height:         28 }}
              >
                <MoreHorizontal style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
              </Button>

              {/* ⋯ dropdown — portaled to body so overflow:hidden on the card doesn't clip it */}
              {typeof window !== 'undefined' && createPortal(
                <AnimatePresence>
                  {moreMenuOpen && menuRect && (
                    <>
                      {/* invisible full-screen close layer */}
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' as React.CSSProperties['zIndex'] }}
                        onClick={(e) => { e.stopPropagation(); setMoreMenuOpen(false); }}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position:     'fixed',
                          top:          menuRect.top,
                          right:        menuRect.right,
                          zIndex:       'calc(var(--z-dropdown) + 1)' as React.CSSProperties['zIndex'],
                          background:   'var(--theme-paper)',
                          border:       '1px solid var(--theme-paper-border)',
                          borderRadius: 'var(--radius-md)',
                          boxShadow:    'var(--shadow-3)',
                          minWidth:     148,
                          padding:      'var(--space-1)',
                          overflow:     'hidden',
                        }}
                      >
                        <Button
                          variant="danger"
                          size="sm"
                          style={{ width:          '100%' }}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoreMenuOpen(false);
                            setConfirmDeleteOpen(true);
                          }}
                        >
                          <Trash2 style={{ width: 14, height: 14, strokeWidth: 1.5, flexShrink: 0 }} />
                          Delete group
                        </Button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>,
                document.body,
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm delete — ConfirmDialog owns the portal + z-index contract */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        dialogKey={`delete-group-${group.id}`}
        title="Delete group task?"
        body={
          <>
            <strong style={{ color: 'var(--theme-text-primary)' }}>{group.title}</strong> and all its subtasks will be permanently deleted. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        danger
        pending={isDeleting}
        onConfirm={handleDeleteGroup}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      {/* ── Expanded subtasks ───────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <CollapseReveal key={`subtasks-${group.id}`} duration={EXIT_DURATION}>
            <div style={{ height: 1, background: 'var(--theme-paper-border)' }} />

            {/* Expanded area sits on the card's own material — the well tone
                (--theme-paper-subtle → --neu-well) is state-only (neu Rule 4)
                and read as a dull band here. The hairline above is the divider. */}
            <div style={{ background: 'transparent' }}>

              {isLoadingSubtasks && (
                <div style={{ padding: 'var(--space-3) var(--space-5) var(--space-2)' }}>
                  {[80, 55, 70].map((w, i) => (
                    <div
                      key={i}
                      style={{
                        height:       10,
                        width:        `${w}%`,
                        borderRadius: 'var(--radius-full)',
                        background:   'var(--theme-paper-subtle)',
                        marginBottom: i < 2 ? 'var(--space-3)' : 0,
                        animation:    `pulse 1.5s ${i * 0.1}s ease-in-out infinite`,
                      }}
                    />
                  ))}
                </div>
              )}

              {!isLoadingSubtasks && subtasks.length === 0 && !showAddSubtask && (
                <EmptyState title="No subtasks yet." style={{ padding: 'var(--space-5)' }} />
              )}

              {/* Row choreography (polish §02) — a subtask deleted via undo
                  lifts out and its siblings glide up; initial={false} so first
                  expand never cascades every existing row. MotionRow owns
                  enter/exit, so the row itself is a plain div. */}
              {!isLoadingSubtasks && (
              <AnimatePresence initial={false}>
              {subtasks.map((subtask, i) => {
                const effectiveStatus = getEffectiveStatus(subtask.id, subtask.status);
                const isSubComplete =
                  effectiveStatus === 'completed' ||
                  effectiveStatus === 'cancelled';
                const canComplete =
                  canToggleTaskComplete(subtask, caller, group.domain) &&
                  effectiveStatus !== 'cancelled' &&
                  effectiveStatus !== 'error';

                return (
                  <MotionRow key={subtask.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenSubtask(subtask)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleOpenSubtask(subtask);
                    }}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      flexWrap:     isMobile ? 'wrap' : 'nowrap',
                      gap:          'var(--space-3)',
                      padding:      isMobile ? '10px 16px' : '10px 20px 10px 24px',
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

                    {/* Meta cluster — status, priority, assignee, due.
                        Mobile: own wrapped line under the title (order pushes it
                        past the Eye affordance, which stays on the title line). */}
                    <div
                      style={{
                        display:    'flex',
                        alignItems: 'center',
                        gap:        'var(--space-2)',
                        flexShrink: 0,
                        ...(isMobile
                          ? {
                              order:       5,
                              flexBasis:   '100%',
                              minWidth:    0,
                              flexWrap:    'wrap' as const,
                              rowGap:      6,
                              paddingLeft: 36,
                            }
                          : null),
                      }}
                    >
                      <SubtaskStatusBadge status={effectiveStatus} />
                      <PriorityPill priority={subtask.priority} />

                      {subtask.assignee && (
                        <Tooltip label={subtask.assignee.full_name} side="top">
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
                        >
                          <span
                            aria-hidden
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontSize:   9,
                              fontWeight: 'var(--weight-semibold)' as React.CSSProperties['fontWeight'],
                              color:      'var(--theme-accent-hover)',
                              lineHeight: 1,
                              userSelect: 'none',
                            }}
                          >
                            {getInitials(subtask.assignee.full_name)}
                          </span>
                          <span className="sr-only">{subtask.assignee.full_name}</span>
                        </span>
                        </Tooltip>
                      )}

                      {subtask.due_at && <DueDateChip dueAt={subtask.due_at} />}
                    </div>

                    <span
                      className="serene-touch-hit"
                      style={{
                        display:        'inline-flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        padding:        '4px 8px',
                        borderRadius:   'var(--radius-full)',
                        background:     'var(--theme-accent-surface)',
                        color:          "var(--neu-accent-deep)",
                        flexShrink:     0,
                        cursor:         'pointer',
                      }}
                    >
                      <Eye style={{ width: 14, height: 14, strokeWidth: 1.5 } as React.CSSProperties} />
                    </span>
                  </div>
                  </MotionRow>
                );
              })}
              </AnimatePresence>
              )}

              {/* Add subtask row */}
              <AnimatePresence>
                {showAddSubtask ? (
                  <CollapseReveal key="add-subtask-row" duration={0.18}>
                    <div
                      style={{
                        display:    'flex',
                        alignItems: 'center',
                        gap:        'var(--space-2)',
                        padding:      'var(--space-3) var(--space-4)',
                        borderRadius: 'var(--radius-md)',
                        // Sunken input row against the card paper (well = track/input state)
                        background:   'var(--theme-paper-subtle)',
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
                      <Tooltip label={subtaskAssigneeName} side="top">
                      <Button
                        variant="control"
                        size="sm"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowAssigneePicker(true); }}
                        aria-label={`Pick assignee, currently ${subtaskAssigneeName}`}
                        style={{ display:        'flex', alignItems:     'center', justifyContent: 'center', width:          28, height:         28, flexShrink:     0 }}
                      >
                        {subtaskAssignee ? (
                          <Avatar name={subtaskAssignee.full_name} size="xs" style={{ width: 14, height: 14, minWidth: 14 }} />
                        ) : (
                          <User style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
                        )}
                      </Button>
                      </Tooltip>
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleAddSubtask(); }}
                        disabled={isSaving || !subtaskTitle.trim()}
                      >
                        {isSaving ? 'Adding…' : 'Add'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowAddSubtask(false); setSubtaskTitle(''); }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--theme-text-secondary)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--theme-text-tertiary)'; }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </CollapseReveal>
                ) : (
                  <MotionButton
          variant="ghost" size="sm"
          key="add-subtask-trigger"
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FAST_DURATION }}
          onClick={(e) => { e.stopPropagation(); setShowAddSubtask(true); }}
          style={{display:    'flex', alignItems: 'center', gap:        'var(--space-2)', width:      '100%', padding:    'var(--space-2) var(--space-5)', fontSize:     12, textAlign:    'left'}}
        >
                    <Plus style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
                    Add subtask
                  </MotionButton>
                )}
              </AnimatePresence>
            </div>

            {/* Remarks-fetch window between tap and modal — see MyTasksCalendarView */}
            {selectedSubtask && modalOpen && selectedSubtaskRemarks === null && <LoadingVeil />}

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
                  onDeferDelete={handleSubtaskDeferDelete}
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
          </CollapseReveal>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

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

  // Warm the SubTaskModal chunk after hydration (still out of the route chunk,
  // G-1) — a first tap otherwise pays remarks fetch + chunk download in series.
  useEffect(() => {
    void import('@/components/tasks/SubTaskModal');
  }, []);

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
  const mountCreateModal = useMountOnFirstOpen(createModalOpen);

  useCreateTriggerModal(createTrigger, () => setCreateModalOpen(true));

  // Stable identity so memo(GroupRow) skips untouched rows on expand/collapse (G-4)
  const toggleGroup = useCallback((id: string) => {
    setExpandedGroupId((prev) => (prev === id ? null : id));
  }, []);

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
        <EmptyState
          icon={LucideIcons.CheckSquare}
          framed
          title={groupRows.length > 0 && hasActiveFilters ? 'Nothing matches your filters.' : 'No group tasks yet.'}
          description={groupRows.length > 0 && hasActiveFilters ? 'Try adjusting your search or filters.' : 'Use the button above to create one.'}
        />
      ) : (
        filteredRows.map((group, idx) => (
          <GroupRow
            key={group.id}
            group={group}
            isExpanded={expandedGroupId === group.id}
            onToggle={toggleGroup}
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

      {mountCreateModal && (
        <CreateGroupTaskModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreated={handleGroupCreated}
          callerRole={callerRole}
          callerDomain={callerDomain}
        />
      )}
    </div>
  );
}
