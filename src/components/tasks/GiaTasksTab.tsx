'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GiaDaySection } from '@/components/tasks/GiaDaySection';
import { GiaTaskRow } from '@/components/tasks/GiaTaskRow';
import { useTaskCompletionToggle } from '@/hooks/useTaskCompletionToggle';
import { formatDate } from '@/lib/utils/dates';
import { EASE_OUT_EXPO, BASE_DURATION } from '@/lib/constants/motion';
import { filterGiaTasks, type GiaTaskFiltersState } from '@/lib/utils/task-client-filters';
import type { GiaTask } from '@/lib/services/tasks-service';
import type { UserRole, AppDomain, TaskStatus } from '@/lib/types/database';

// ─── Date helpers (local-clock, same pattern as MyTasksCalendarView) ─────────

function localKey(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function todayKey(): string { return localKey(new Date()); }
function tomorrowKey(): string {
  const t = new Date(); t.setDate(t.getDate() + 1); return localKey(t);
}
function taskLocalKey(dueAt: string): string { return localKey(new Date(dueAt)); }

function sectionLabel(dateKey: string, isTomorrow: boolean): string {
  if (isTomorrow) {
    return `Tomorrow, ${formatDate(new Date(dateKey + 'T00:00:00'), 'd MMM')}`;
  }
  const d = new Date(dateKey + 'T00:00:00');
  const diffDays = Math.round(
    (d.getTime() - new Date(todayKey() + 'T00:00:00').getTime()) / 86_400_000,
  );
  const dayName  = d.toLocaleDateString('en-US', { weekday: 'long' });
  const dayMonth = formatDate(d, 'd MMM');
  if (diffDays < 7) return `${dayName}, ${dayMonth}`;
  return formatDate(d, 'EEE, d MMM yyyy');
}

// ─── Date grouping ────────────────────────────────────────────────────────────

interface GiaDateSection {
  key:   string;
  label: string;
  tasks: GiaTask[];
}

function groupGiaTasks(
  tasks: GiaTask[],
  optimisticStatus: Record<string, TaskStatus>,
): GiaDateSection[] {
  const today    = todayKey();
  const tomorrow = tomorrowKey();

  // Only show active tasks (non-terminal). Completed/cancelled tasks stay but
  // fade out via opacity in the row — they do not move between sections.
  const buckets: {
    today:   GiaTask[];
    overdue: GiaTask[];
    noDate:  GiaTask[];
    future:  Record<string, GiaTask[]>;
  } = { today: [], overdue: [], noDate: [], future: {} };

  for (const task of tasks) {
    const effective = optimisticStatus[task.id] ?? task.status;
    // Hide completed tasks from the date sections (same as MyTasksCalendarView)
    if (effective === 'completed') continue;

    if (!task.due_at) { buckets.noDate.push(task); continue; }
    const k = taskLocalKey(task.due_at);
    if (k < today)       buckets.overdue.push(task);
    else if (k === today) buckets.today.push(task);
    else {
      if (!buckets.future[k]) buckets.future[k] = [];
      buckets.future[k].push(task);
    }
  }

  const sections: GiaDateSection[] = [];

  sections.push({ key: 'today', label: 'Today', tasks: buckets.today });

  for (const k of Object.keys(buckets.future).sort()) {
    sections.push({ key: k, label: sectionLabel(k, k === tomorrow), tasks: buckets.future[k] });
  }

  if (buckets.overdue.length > 0) {
    sections.push({ key: 'overdue', label: 'Overdue', tasks: buckets.overdue });
  }

  if (buckets.noDate.length > 0) {
    sections.push({ key: 'no-date', label: 'No Due Date', tasks: buckets.noDate });
  }

  return sections;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GiaTasksTabProps {
  initialTasks:           GiaTask[];
  filters:                GiaTaskFiltersState;
  currentUserId:          string;
  currentUserName:        string;
  callerRole:             UserRole;
  callerDomain:           AppDomain;
  createTrigger?:         number;
  onFilteredCountChange?: (count: number) => void;
  onTaskCreated:          (task: GiaTask) => void;
}

export function GiaTasksTab({
  initialTasks,
  filters,
  currentUserId,
  onFilteredCountChange,
}: GiaTasksTabProps) {
  const [tasks, setTasks] = useState<GiaTask[]>(initialTasks);
  const { optimisticStatus, getEffectiveStatus, handleToggle } = useTaskCompletionToggle();
  // getEffectiveStatus used inline in groupGiaTasks and in GiaTaskRow prop

  // Apply client-side filters before date-grouping
  const filteredTasks = filterGiaTasks(tasks, optimisticStatus, filters);
  const sections = groupGiaTasks(filteredTasks, optimisticStatus);
  const visibleCount = sections.reduce((sum, s) => sum + s.tasks.length, 0);

  useEffect(() => {
    onFilteredCountChange?.(visibleCount);
  }, [visibleCount, onFilteredCountChange]);

  const onToggle = useCallback(
    (e: React.MouseEvent, task: { id: string; status: TaskStatus }) => {
      handleToggle(e, task);
    },
    [handleToggle],
  );

  // Update local list when parent prepends a new task
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const hasAnyTasks = sections.some((s) => s.tasks.length > 0);

  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        padding:      'var(--space-5)',
      }}
    >
      {!hasAnyTasks ? (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-sm)',
            color:      'var(--theme-text-tertiary)',
            textAlign:  'center',
            padding:    'var(--space-8) 0',
            margin:     0,
          }}
        >
          No Gia tasks assigned.
        </p>
      ) : (
        <AnimatePresence initial={false}>
          {sections.map((section, sectionIdx) =>
            section.tasks.length === 0 ? null : (
              <motion.div
                key={section.key}
                initial={{ opacity: 0, y: 4 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: BASE_DURATION,
                    ease: EASE_OUT_EXPO,
                    delay: sectionIdx * 0.05,
                  },
                }}
              >
                <GiaDaySection label={section.label}>
                  {section.tasks.map((task) => (
                    <GiaTaskRow
                      key={task.id}
                      task={task}
                      effectiveStatus={getEffectiveStatus(task.id, task.status as TaskStatus)}
                      onToggle={onToggle}
                      currentUserId={currentUserId}
                    />
                  ))}
                </GiaDaySection>
              </motion.div>
            ),
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
