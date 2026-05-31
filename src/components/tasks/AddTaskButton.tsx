'use client';

import { Plus } from 'lucide-react';
import { MotionButton, MOTION_BUTTON_DEFAULTS } from '@/components/ui/MotionButton';
import { useTasksCreate } from '@/components/tasks/TasksCreateContext';
import type { UserRole } from '@/lib/types/database';
import type { TaskTab } from '@/app/(dashboard)/tasks/page';

type AddTaskButtonProps = {
  callerRole: UserRole;
  activeTab:  TaskTab;
  validTabs:  TaskTab[];
};

export function AddTaskButton({ callerRole, activeTab, validTabs }: AddTaskButtonProps) {
  const { requestCreate } = useTasksCreate();

  const canCreateGroup = ['manager', 'admin', 'founder'].includes(callerRole);

  // Agents on group tab cannot create — hide button
  if (activeTab === 'group' && !canCreateGroup) return null;

  const labelMap: Record<TaskTab, string> = {
    gia:      'Gia Task',
    personal: 'My Task',
    group:    'Group Task',
  };

  // Show button for all reachable tabs (validTabs guards the tab itself)
  void validTabs; // consumed by page; button visible for all valid tabs

  const label = labelMap[activeTab];

  return (
    <MotionButton
      {...MOTION_BUTTON_DEFAULTS}
      variant="primary"
      type="button"
      onClick={requestCreate}
      style={{ boxShadow: 'var(--shadow-accent-glow)', whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      <Plus style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
      {label}
    </MotionButton>
  );
}
