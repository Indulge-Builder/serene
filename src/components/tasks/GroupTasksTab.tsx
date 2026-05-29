'use client';

/**
 * GroupTasksTab — group task list with accordion expand/collapse for subtasks.
 *
 * Pre-mortem addressed:
 * - Accordion: only one group expanded at a time — no conflicting layoutId animations.
 * - Subtask "Add subtask" row uses AssigneePickerModal portaled to document.body.
 * - Data passed from Server Component — no client-side fetch on tab switch.
 * - Framer Motion AnimatePresence with unique key per group for subtask list expand.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  User,
  Clock,
  PlayCircle,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader,
  ExternalLink,
} from 'lucide-react';
import { createSubtaskAction, getGroupSubtasksAction } from '@/lib/actions/tasks';
import { listAgentsForDomain } from '@/lib/actions/leads';
import { formatRelativeTime } from '@/lib/utils/dates';
import { toast } from '@/lib/toast';
import { SubTaskModal } from '@/components/tasks/SubTaskModal';
import { AssigneePickerModal, type AssignableUser } from '@/components/tasks/AssigneePickerModal';
import { CreateGroupTaskModal } from '@/components/tasks/CreateGroupTaskModal';
import type { TaskGroupRow, SubtaskWithAssignee } from '@/lib/services/tasks-service';
import { Avatar } from '@/components/ui/Avatar';
import { AvatarStack } from '@/components/ui/AvatarStack';
import type { Task, TaskGroup, TaskStatus, TaskPriority, UserRole, AppDomain } from '@/lib/types/database';
import { TASK_STATUS_LABELS } from '@/lib/constants/task-types';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GroupTasksTabProps {
  initialRows:     TaskGroupRow[];
  currentUserId:   string;
  currentUserName: string;
  callerRole:      UserRole;
  callerDomain:    AppDomain;
  /** Increments each time the parent header button is clicked — triggers modal open */
  createTrigger?:  number;
}

// ─── Priority config ───────────────────────────────────────────────────────────

const PRIORITY_BORDER: Record<TaskPriority, string> = {
  urgent: 'var(--color-danger-text)',
  high:   'var(--color-warning-text)',
  normal: 'var(--theme-paper-border)',
};

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { bg: string; text: string }> = {
  to_do:       { bg: 'var(--theme-paper-border)',    text: 'var(--theme-text-secondary)' },
  in_progress: { bg: 'var(--theme-accent)',           text: 'var(--theme-accent-fg)' },
  in_review:   { bg: 'var(--color-info)',             text: 'var(--color-info-text)' },
  completed:   { bg: 'var(--color-success)',          text: 'var(--color-success-text)' },
  error:       { bg: 'var(--color-danger)',           text: 'var(--color-danger-text)' },
  cancelled:   { bg: 'var(--theme-text-tertiary)',    text: 'var(--theme-text-inverse)' },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 13 }: { status: TaskStatus; size?: number }) {
  const style = { width: size, height: size, strokeWidth: 1.5, flexShrink: 0 as const };
  switch (status) {
    case 'to_do':       return <Clock        style={style} />;
    case 'in_progress': return <PlayCircle   style={style} />;
    case 'in_review':   return <RefreshCw    style={style} />;
    case 'completed':   return <CheckCircle2 style={style} />;
    case 'error':       return <AlertCircle  style={style} />;
    case 'cancelled':   return <XCircle      style={style} />;
    default:            return <Loader       style={style} />;
  }
}


// ─── Group row ─────────────────────────────────────────────────────────────────

interface GroupRowProps {
  group:           TaskGroupRow;
  isExpanded:      boolean;
  onToggle:        () => void;
  currentUserId:   string;
  currentUserName: string;
  callerRole:      UserRole;
  callerDomain:    AppDomain;
}

function GroupRow({
  group,
  isExpanded,
  onToggle,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
}: GroupRowProps) {
  const [subtasks,         setSubtasks]         = useState<SubtaskWithAssignee[]>([]);
  const [subtasksLoaded,   setSubtasksLoaded]   = useState(false);
  const [isLoadingSubtasks, setIsLoadingSubtasks] = useState(false);

  // Quick-add subtask state
  const [showAddSubtask,   setShowAddSubtask]   = useState(false);
  const [subtaskTitle,     setSubtaskTitle]     = useState('');
  const [subtaskAssignee,  setSubtaskAssignee]  = useState<AssignableUser | null>(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [assignableUsers,  setAssignableUsers]  = useState<AssignableUser[]>([]);
  const [isSaving,         setIsSaving]         = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  // Task modal state
  const [selectedSubtask,         setSelectedSubtask]         = useState<SubtaskWithAssignee | null>(null);
  const [modalOpen,               setModalOpen]               = useState(false);

  const [, startTransition] = useTransition();

  // Load subtasks when first expanded
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

  // Load assignable users when first expanded (manager+)
  useEffect(() => {
    if (!isExpanded) return;
    if (!['manager', 'admin', 'founder'].includes(callerRole)) return;
    if (assignableUsers.length > 0) return;

    listAgentsForDomain(callerDomain).then((result) => {
      if (result.data) {
        setAssignableUsers(
          result.data.map((a: { id: string; full_name: string }) => ({
            id:         a.id,
            full_name:  a.full_name,
            avatar_url: null,
            role:       'agent' as const,
            domain:     callerDomain,
          })),
        );
      }
    });
  }, [isExpanded, callerRole, callerDomain, assignableUsers.length]);

  useEffect(() => {
    if (showAddSubtask) {
      setTimeout(() => subtaskInputRef.current?.focus(), 50);
    }
  }, [showAddSubtask]);

  const handleAddSubtask = useCallback(() => {
    if (!subtaskTitle.trim()) {
      subtaskInputRef.current?.focus();
      return;
    }
    if (!subtaskAssignee) {
      toast.danger('Please pick an assignee first');
      return;
    }
    setIsSaving(true);
    startTransition(async () => {
      const result = await createSubtaskAction({
        group_id:    group.id,
        title:       subtaskTitle.trim(),
        priority:    'normal',
        assigned_to: subtaskAssignee.id,
      });
      setIsSaving(false);
      if (result.error) {
        toast.danger('Failed to create subtask', { message: result.error });
        return;
      }
      toast.success('Subtask created');
      setSubtaskTitle('');
      setSubtaskAssignee(null);
      setShowAddSubtask(false);
      // Reload subtasks
      setSubtasksLoaded(false);
    });
  }, [subtaskTitle, subtaskAssignee, group.id, startTransition]);

  function handleSubtaskKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleAddSubtask();
    if (e.key === 'Escape') {
      setShowAddSubtask(false);
      setSubtaskTitle('');
    }
  }

  const priorityBorder = PRIORITY_BORDER[group.priority];
  const statusCfg      = STATUS_CONFIG[group.status];
  const progress       = group.subtask_count > 0
    ? Math.round((group.completed_count / group.subtask_count) * 100)
    : 0;

  return (
    <div>
      {/* Group header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-4)',
          padding:      'var(--space-4) var(--space-4)',
          background:   isExpanded ? 'var(--theme-paper-subtle)' : 'var(--theme-paper)',
          borderLeft:   `3px solid ${priorityBorder}`,
          cursor:       'pointer',
          transition:   'background var(--duration-fast) var(--ease-in-out)',
          userSelect:   'none',
        }}
        onMouseEnter={(e) => {
          if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
        }}
        onMouseLeave={(e) => {
          if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper)';
        }}
      >
        {/* Expand arrow */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: 'var(--theme-text-tertiary)' }}
        >
          <ChevronRight style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
        </motion.div>

        {/* Title + description + workspace link */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display:     'block',
                fontFamily:  'var(--font-sans)',
                fontSize:    'var(--text-sm)',
                fontWeight:  'var(--weight-semibold)',
                color:       'var(--theme-text-primary)',
                overflow:    'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:  'nowrap',
              }}
            >
              {group.title}
            </span>
            {group.description && (
              <span
                style={{
                  display:     'block',
                  fontFamily:  'var(--font-sans)',
                  fontSize:    'var(--text-xs)',
                  color:       'var(--theme-text-tertiary)',
                  overflow:    'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:  'nowrap',
                  marginTop:   'var(--space-px)',
                }}
              >
                {group.description}
              </span>
            )}
          </div>

          {/* Open workspace link — stopPropagation prevents accordion expand */}
          <Link
            href={`/tasks/${group.id}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            'var(--space-1)',
              fontFamily:     'var(--font-sans)',
              fontSize:       'var(--text-2xs)',
              color:          'var(--theme-text-secondary)',
              textDecoration: 'none',
              whiteSpace:     'nowrap',
              flexShrink:     0,
              transition:     'color var(--duration-fast) var(--ease-in-out)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-secondary)'; }}
          >
            <ExternalLink style={{ width: 10, height: 10, strokeWidth: 1.5 }} />
            Open
          </Link>
        </div>

        {/* Subtask count + progress */}
        <span
          style={{
            fontFamily:  'var(--font-mono)',
            fontSize:    'var(--text-xs)',
            color:       'var(--theme-text-tertiary)',
            flexShrink:  0,
            whiteSpace:  'nowrap',
          }}
        >
          {group.completed_count}/{group.subtask_count}
          {group.subtask_count > 0 && (
            <span style={{ color: progress === 100 ? 'var(--color-success-text)' : 'var(--theme-accent)', marginLeft: 4 }}>
              {progress}%
            </span>
          )}
        </span>

        {/* Due date */}
        {group.due_at && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize:   'var(--text-xs)',
              color:      'var(--theme-text-tertiary)',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {formatRelativeTime(group.due_at)}
          </span>
        )}

        {/* Assignee avatars */}
        {group.assignee_previews.length > 0 && (
          <AvatarStack
            users={group.assignee_previews.map((p) => ({ id: p.id, name: p.full_name, imageUrl: p.avatar_url ?? undefined }))}
            size="xs"
            max={4}
            overlap={6}
          />
        )}

        {/* Status pill */}
        <span
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          'var(--space-1)',
            padding:      'var(--space-1) var(--space-2)',
            borderRadius: 'var(--radius-full)',
            background:   statusCfg.bg,
            color:        statusCfg.text,
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-xs)',
            fontWeight:   'var(--weight-semibold)',
            flexShrink:   0,
            whiteSpace:   'nowrap',
            boxShadow:    '0 1px 3px 0 rgb(0 0 0 / 0.06)',
          }}
        >
          <StatusIcon status={group.status} size={11} />
          {TASK_STATUS_LABELS[group.status]}
        </span>
      </div>

      {/* Subtask list — expands inline */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key={`subtasks-${group.id}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                borderTop:      '1px solid var(--theme-paper-border)',
                background:     'var(--theme-paper-subtle)',
              }}
            >
              {isLoadingSubtasks ? (
                <div style={{ padding: 'var(--space-3) var(--space-8)', display: 'flex', gap: 'var(--space-2)' }}>
                  {[70, 45, 60].map((w) => (
                    <div
                      key={w}
                      style={{
                        height:       '12px',
                        width:        `${w}%`,
                        borderRadius: 'var(--radius-full)',
                        background:   'var(--theme-paper-border)',
                        animation:    'pulse 1.5s ease-in-out infinite',
                      }}
                    />
                  ))}
                </div>
              ) : subtasks.length === 0 && !showAddSubtask ? (
                <div style={{ padding: 'var(--space-4) var(--space-8)', textAlign: 'center' }}>
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
              ) : (
                subtasks.map((subtask, i) => {
                  const subStatusCfg = STATUS_CONFIG[subtask.status];
                  return (
                    <div
                      key={subtask.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedSubtask(subtask); setModalOpen(true); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedSubtask(subtask);
                          setModalOpen(true);
                        }
                      }}
                      style={{
                        display:      'flex',
                        alignItems:   'center',
                        gap:          'var(--space-3)',
                        padding:      'var(--space-2) var(--space-8)',
                        borderBottom: i < subtasks.length - 1 ? '1px solid var(--theme-paper-border)' : 'none',
                        cursor:       'pointer',
                        transition:   'background var(--duration-fast) var(--ease-in-out)',
                        background:   'var(--theme-paper-subtle)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--theme-paper-subtle) 60%, var(--theme-paper))'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)'; }}
                    >
                      {/* Title */}
                      <span
                        style={{
                          flex:         1,
                          fontFamily:   'var(--font-sans)',
                          fontSize:     'var(--text-sm)',
                          color:        subtask.status === 'completed' || subtask.status === 'cancelled'
                            ? 'var(--theme-text-tertiary)'
                            : 'var(--theme-text-primary)',
                          textDecoration: subtask.status === 'completed' ? 'line-through' : 'none',
                          overflow:     'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace:   'nowrap',
                          minWidth:     0,
                        }}
                      >
                        {subtask.title}
                      </span>

                      {/* Status pill */}
                      <span
                        style={{
                          display:      'inline-flex',
                          alignItems:   'center',
                          gap:          'var(--space-1)',
                          padding:      'var(--space-px) var(--space-2)',
                          borderRadius: 'var(--radius-full)',
                          background:   subStatusCfg.bg,
                          color:        subStatusCfg.text,
                          fontFamily:   'var(--font-sans)',
                          fontSize:     'var(--text-xs)',
                          fontWeight:   'var(--weight-semibold)',
                          flexShrink:   0,
                          whiteSpace:   'nowrap',
                          boxShadow:    '0 1px 3px 0 rgb(0 0 0 / 0.06)',
                        }}
                      >
                        <StatusIcon status={subtask.status} size={10} />
                        {TASK_STATUS_LABELS[subtask.status]}
                      </span>

                      {/* Assignee avatar */}
                      {subtask.assignee && (
                        <Avatar
                          src={subtask.assignee.avatar_url}
                          name={subtask.assignee.full_name}
                          size="xs"
                          style={{ width: 'var(--space-5)', height: 'var(--space-5)', minWidth: 'var(--space-5)', borderRadius: 'var(--radius-xs)' }}
                        />
                      )}
                    </div>
                  );
                })
              )}

              {/* Add subtask row */}
              <AnimatePresence>
                {showAddSubtask ? (
                  <motion.div
                    key="add-subtask-row"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      gap:          'var(--space-2)',
                      padding:      'var(--space-2) var(--space-8)',
                      borderTop:    subtasks.length > 0 ? '1px solid var(--theme-paper-border)' : 'none',
                      background:   'var(--theme-accent-surface)',
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
                        caretColor: 'var(--theme-accent)',
                      }}
                    />

                    {/* Assignee picker icon */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowAssigneePicker(true); }}
                      aria-label="Pick assignee"
                      title={subtaskAssignee ? subtaskAssignee.full_name : 'Pick assignee'}
                      style={{
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        width:          'var(--space-7)',
                        height:         'var(--space-7)',
                        borderRadius:   'var(--radius-sm)',
                        border:         '1px solid var(--theme-paper-border)',
                        background:     subtaskAssignee ? 'var(--theme-accent-surface)' : 'transparent',
                        color:          subtaskAssignee ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
                        cursor:         'pointer',
                        flexShrink:     0,
                      }}
                    >
                      {subtaskAssignee ? (
                        <Avatar name={subtaskAssignee.full_name} size="xs" style={{ width: 16, height: 16, minWidth: 16 }} />
                      ) : (
                        <User style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleAddSubtask(); }}
                      disabled={isSaving || !subtaskTitle.trim()}
                      style={{
                        padding:      'var(--space-1) var(--space-3)',
                        borderRadius: 'var(--radius-sm)',
                        border:       'none',
                        background:   subtaskTitle.trim() ? 'var(--theme-accent)' : 'var(--theme-paper-border)',
                        color:        subtaskTitle.trim() ? 'var(--theme-accent-fg)' : 'var(--theme-text-tertiary)',
                        fontFamily:   'var(--font-sans)',
                        fontSize:     'var(--text-xs)',
                        fontWeight:   'var(--weight-semibold)',
                        cursor:       subtaskTitle.trim() ? 'pointer' : 'not-allowed',
                        flexShrink:   0,
                      }}
                    >
                      {isSaving ? 'Adding…' : 'Add'}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowAddSubtask(false); setSubtaskTitle(''); }}
                      style={{
                        fontFamily:  'var(--font-sans)',
                        fontSize:    'var(--text-xs)',
                        color:       'var(--theme-text-tertiary)',
                        background:  'transparent',
                        border:      'none',
                        cursor:      'pointer',
                        flexShrink:  0,
                      }}
                    >
                      Cancel
                    </button>
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
                      display:     'flex',
                      alignItems:  'center',
                      gap:         'var(--space-2)',
                      width:       '100%',
                      padding:     'var(--space-2) var(--space-8)',
                      border:      'none',
                      borderTop:   (subtasks.length > 0 || !isLoadingSubtasks) ? '1px solid var(--theme-paper-border)' : 'none',
                      background:  'transparent',
                      fontFamily:  'var(--font-sans)',
                      fontSize:    'var(--text-xs)',
                      color:       'var(--theme-text-tertiary)',
                      cursor:      'pointer',
                      textAlign:   'left',
                      transition:  'color var(--duration-fast) var(--ease-in-out)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--theme-accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--theme-text-tertiary)'; }}
                  >
                    <Plus style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
                    Add subtask
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Subtask Modal */}
            <AnimatePresence>
              {selectedSubtask && modalOpen && (
                <SubTaskModal
                  open={modalOpen}
                  onClose={() => { setModalOpen(false); setSelectedSubtask(null); }}
                  task={selectedSubtask as Task}
                  group={group as TaskGroup}
                  assignee={selectedSubtask.assignee ?? undefined}
                  initialRemarks={[]}
                  callerProfile={{ id: currentUserId, role: callerRole, domain: callerDomain }}
                />
              )}
            </AnimatePresence>

            {/* AssigneePickerModal — portaled to body */}
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
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function GroupTasksTab({
  initialRows,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
  createTrigger = 0,
}: GroupTasksTabProps) {
  // Accordion: only one group expanded at a time
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // Local group rows — prepend new groups without refetch
  const [groupRows, setGroupRows] = useState<TaskGroupRow[]>(initialRows);

  // Create group task modal
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Open modal when parent header button fires (createTrigger increments)
  useEffect(() => {
    if (createTrigger > 0) setCreateModalOpen(true);
  }, [createTrigger]);

  function toggleGroup(id: string) {
    setExpandedGroupId((prev) => (prev === id ? null : id));
  }

  // onCreated: convert TaskGroup to TaskGroupRow and prepend
  function handleGroupCreated(group: TaskGroup) {
    const row: TaskGroupRow = {
      ...group,
      subtask_count:     0,
      completed_count:   0,
      assignee_previews: [],
    };
    setGroupRows((prev) => [row, ...prev]);
    setCreateModalOpen(false);
  }

  // Only manager+ can create group tasks (matches createGroupTaskAction auth guard)
  const canCreate = ['manager', 'admin', 'founder'].includes(callerRole);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

      {/* Group list or empty state */}
      {groupRows.length === 0 ? (
        <div
          style={{
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-md)',
            padding:      'var(--space-16) var(--space-8)',
            textAlign:    'center',
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
            No group tasks yet.
          </p>
          {canCreate && (
            <p
              style={{
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-sm)',
                color:        'var(--theme-text-tertiary)',
                marginTop:    'var(--space-2)',
                marginBottom: 0,
              }}
            >
              Use the button above to create one.
            </p>
          )}
        </div>
      ) : (
        <div
          style={{
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-md)',
            overflow:     'hidden',
            boxShadow:    'var(--shadow-1)',
          }}
        >
          {groupRows.map((group, idx) => (
            <div
              key={group.id}
              style={{
                borderBottom: idx < groupRows.length - 1 ? '1px solid var(--theme-paper-border)' : 'none',
              }}
            >
              <GroupRow
                group={group}
                isExpanded={expandedGroupId === group.id}
                onToggle={() => toggleGroup(group.id)}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                callerRole={callerRole}
                callerDomain={callerDomain}
              />
            </div>
          ))}
        </div>
      )}

      {/* Create Group Task Modal */}
      <CreateGroupTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleGroupCreated}
      />
    </div>
  );
}
