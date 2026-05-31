'use client';

import { useState, useTransition } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { createLeadTaskAction } from '@/lib/actions/leads';
import { TASK_TYPES, TASK_TYPE_LABELS } from '@/lib/constants/task-types';
import type { Task, TaskType, TaskPriority } from '@/lib/types/database';

interface CreateLeadTaskModalProps {
  open:           boolean;
  onClose:        () => void;
  leadId:         string;
  onTaskCreated:  (task: Task) => void;
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High'   },
  { value: 'normal', label: 'Normal' },
];

export function CreateLeadTaskModal({
  open,
  onClose,
  leadId,
  onTaskCreated,
}: CreateLeadTaskModalProps) {
  const [taskType,    setTaskType]    = useState<TaskType>('call');
  const [priority,    setPriority]    = useState<TaskPriority>('normal');
  const [dueAt,       setDueAt]       = useState<Date | null>(null);
  const [description, setDescription] = useState('');
  const [error,       setError]       = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  function handleClose() {
    if (isPending) return;
    setTaskType('call');
    setPriority('normal');
    setDueAt(null);
    setDescription('');
    setError(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createLeadTaskAction({
        leadId,
        taskType,
        priority,
        description: description.trim() || undefined,
        dueAt:       dueAt ? dueAt.toISOString() : null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onTaskCreated(result.data!);
      handleClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create follow-up task"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isPending}
            disabled={isPending}
          >
            Create task
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

        {/* Task type */}
        <div>
          <p
            className="label-micro"
            style={{ marginBottom: 'var(--space-2)' }}
          >
            Task type
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {TASK_TYPES.map((type) => (
              <label
                key={type}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          'var(--space-3)',
                  cursor:       'pointer',
                  padding:      'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  background:   taskType === type
                    ? 'var(--theme-accent-surface)'
                    : 'var(--theme-paper-subtle)',
                  border: `1px solid ${taskType === type
                    ? 'var(--theme-accent-muted)'
                    : 'var(--theme-paper-border)'}`,
                  transition: 'background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)',
                }}
              >
                <input
                  type="radio"
                  name="taskType"
                  value={type}
                  checked={taskType === type}
                  onChange={() => setTaskType(type)}
                  style={{ accentColor: 'var(--theme-accent)' }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize:   'var(--text-sm)',
                    color:      taskType === type
                      ? 'var(--theme-accent)'
                      : 'var(--theme-text-primary)',
                    fontWeight: taskType === type ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                  }}
                >
                  {TASK_TYPE_LABELS[type]}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <p
            className="label-micro"
            style={{ marginBottom: 'var(--space-2)' }}
          >
            Priority
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPriority(opt.value)}
                style={{
                  flex:         1,
                  padding:      'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  border:       `1px solid ${priority === opt.value ? 'var(--theme-accent-muted)' : 'var(--theme-paper-border)'}`,
                  background:   priority === opt.value
                    ? 'var(--theme-accent-surface)'
                    : 'var(--theme-paper-subtle)',
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-sm)',
                  fontWeight: priority === opt.value ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                  color:      priority === opt.value ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                  cursor:     'pointer',
                  transition: 'background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Due date + time */}
        <div>
          <p
            className="label-micro"
            style={{ marginBottom: 'var(--space-2)' }}
          >
            Due date & time (optional)
          </p>
          <DatePicker
            value={dueAt}
            onChange={setDueAt}
            placeholder="Select date and time…"
            showTime
          />
        </div>

        {/* Description */}
        <div>
          <p
            className="label-micro"
            style={{ marginBottom: 'var(--space-2)' }}
          >
            Notes (optional)
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any context or instructions for this task…"
            maxLength={1000}
            rows={3}
            style={{
              width:        '100%',
              boxSizing:    'border-box',
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-primary)',
              background:   'var(--theme-paper-subtle)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-md)',
              padding:      'var(--space-3)',
              resize:       'vertical',
              outline:      'none',
              caretColor:   'var(--theme-accent)',
            }}
          />
        </div>

        {/* Inline error */}
        {error && (
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-sm)',
              color:      'var(--color-danger)',
              margin:     0,
            }}
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
