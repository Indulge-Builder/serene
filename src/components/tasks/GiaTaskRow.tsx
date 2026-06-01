'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Phone, MessageSquare, MoreHorizontal } from 'lucide-react';
import { TaskCompletionCircle } from '@/components/tasks/TaskCompletionCircle';
import { TASK_TYPE_LABELS } from '@/lib/constants/task-types';
import { formatTaskDueAt } from '@/lib/utils/dates';
import type { GiaTask } from '@/lib/services/tasks-service';
import type { TaskStatus, TaskType } from '@/lib/types/database';

const TASK_TYPE_ICONS: Record<TaskType, React.FC<{ style?: React.CSSProperties }>> = {
  call:              ({ style }) => <Phone style={style} />,
  whatsapp_message:  ({ style }) => <MessageSquare style={style} />,
  other:             ({ style }) => <MoreHorizontal style={style} />,
};

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

interface GiaTaskRowProps {
  task:              GiaTask;
  effectiveStatus:   TaskStatus;
  onToggle:          (e: React.MouseEvent, task: { id: string; status: TaskStatus }) => void;
  currentUserId:     string;
}

export function GiaTaskRow({
  task,
  effectiveStatus,
  onToggle,
  currentUserId,
}: GiaTaskRowProps) {
  const [hovered, setHovered] = useState(false);

  const checked    = effectiveStatus === 'completed';
  const isDisabled = task.assigned_to !== currentUserId;
  const overdue    = !checked && isOverdue(task.due_at);
  const dueLabel   = formatTaskDueAt(task.due_at);

  const leadHref = task.lead_slug
    ? `/leads/${task.lead_slug}`
    : `/leads/${task.lead_id}`;

  const leadName = [task.lead_first_name, task.lead_last_name]
    .filter(Boolean)
    .join(' ') || 'Unknown Lead';

  const TypeIcon = TASK_TYPE_ICONS[task.task_type as TaskType] ?? TASK_TYPE_ICONS.other;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            'var(--space-3)',
        padding:        'var(--space-3) 0',
        opacity:        checked ? 0.5 : 1,
        transition:     'opacity var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {/* Completion circle */}
      <TaskCompletionCircle
        checked={checked}
        disabled={isDisabled}
        highlighted={hovered && !isDisabled}
        onToggle={(e) => onToggle(e, task)}
      />

      {/* Task type icon */}
      <TypeIcon
        style={{
          width:       14,
          height:      14,
          strokeWidth: 1.5,
          color:       'var(--theme-accent)',
          flexShrink:  0,
        }}
      />

      {/* Lead name + task type label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={leadHref}
          onClick={(e) => e.stopPropagation()}
          style={{
            display:        'block',
            fontSize:       'var(--text-sm)',
            color:          'var(--theme-text-primary)',
            fontWeight:     checked ? 'var(--weight-normal)' : 'var(--weight-normal)',
            textDecoration: checked ? 'line-through' : 'none',
            whiteSpace:     'nowrap',
            overflow:       'hidden',
            textOverflow:   'ellipsis',
          }}
        >
          {leadName}
        </Link>
        <span
          style={{
            display:    'block',
            fontSize:   'var(--text-xs)',
            color:      'var(--theme-text-secondary)',
            marginTop:  '1px',
          }}
        >
          {TASK_TYPE_LABELS[task.task_type as TaskType] ?? task.task_type}
        </span>
      </div>

      {/* Due time */}
      {dueLabel && (
        <span
          style={{
            fontSize:   'var(--text-xs)',
            color:      overdue ? 'var(--color-danger-text)' : 'var(--theme-text-tertiary)',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {dueLabel}
        </span>
      )}
    </div>
  );
}
