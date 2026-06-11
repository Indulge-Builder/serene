'use client';

import { useState, useTransition } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import {
  FieldLabel,
  FieldError,
  PriorityChipRow,
  DueDateField,
  TaskTypeField,
} from '@/components/ui/TaskFormFields';
import { createLeadTaskAction } from '@/lib/actions/leads';
import type { Task, TaskType, TaskPriority } from '@/lib/types/database';

interface CreateLeadTaskModalProps {
  open:           boolean;
  onClose:        () => void;
  leadId:         string;
  onTaskCreated:  (task: Task) => void;
}

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
          <FieldLabel style={{ marginBottom: 'var(--space-2)' }}>Task type</FieldLabel>
          <TaskTypeField value={taskType} onChange={setTaskType} disabled={isPending} />
        </div>

        {/* Priority */}
        <div>
          <FieldLabel style={{ marginBottom: 'var(--space-2)' }}>Priority</FieldLabel>
          <PriorityChipRow value={priority} onChange={setPriority} disabled={isPending} />
        </div>

        {/* Due date + time */}
        <DueDateField
          label="Due date & time"
          optional
          date={dueAt}
          onDateChange={setDueAt}
          placeholder="Select date and time…"
          disabled={isPending}
        />

        {/* Description */}
        <div>
          <FieldLabel style={{ marginBottom: 'var(--space-2)' }} optional>Notes</FieldLabel>
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
        <FieldError message={error} />
      </div>
    </Modal>
  );
}
