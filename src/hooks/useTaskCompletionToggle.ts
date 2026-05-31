'use client';

import { useCallback, useState, useTransition } from 'react';
import { updateTaskStatusAction } from '@/lib/actions/tasks';
import { toast } from '@/lib/toast';
import type { TaskStatus } from '@/lib/types/database';

export function useTaskCompletionToggle() {
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, TaskStatus>>({});
  const [, startTransition] = useTransition();

  const getEffectiveStatus = useCallback(
    (taskId: string, status: TaskStatus) => optimisticStatus[taskId] ?? status,
    [optimisticStatus],
  );

  const handleToggle = useCallback(
    (
      e: React.MouseEvent,
      task: { id: string; status: TaskStatus },
      onSuccess?: (newStatus: TaskStatus) => void,
    ) => {
      e.stopPropagation();

      const effectiveStatus = optimisticStatus[task.id] ?? task.status;
      const newStatus: TaskStatus =
        effectiveStatus === 'completed' ? 'to_do' : 'completed';

      setOptimisticStatus((prev) => ({ ...prev, [task.id]: newStatus }));

      startTransition(async () => {
        const result = await updateTaskStatusAction({
          taskId: task.id,
          status: newStatus,
        });
        if (result.error) {
          setOptimisticStatus((prev) => {
            const next = { ...prev };
            delete next[task.id];
            return next;
          });
          toast.danger("Couldn't update task", { message: result.error });
          return;
        }
        onSuccess?.(newStatus);
      });
    },
    [optimisticStatus, startTransition],
  );

  return { optimisticStatus, getEffectiveStatus, handleToggle };
}
