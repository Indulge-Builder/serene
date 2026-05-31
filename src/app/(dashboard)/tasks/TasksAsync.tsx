/**
 * TasksAsync — async server component; direct child of <Suspense> in page.tsx.
 *
 * Receives the session-derived props from page.tsx (thin orchestrator).
 * Fetches data for the active tab only, then passes serialisable plain objects
 * to TasksShell (a 'use client' component).
 *
 * Prop boundary contract:
 *   - All props passed to TasksShell are JSON-serialisable (strings, plain objects).
 *   - No service function references, no Promises, no class instances cross this boundary.
 *   - This component may import from lib/services — TasksShell may not.
 */

import { getPersonalTasks, getGroupTasks, getGiaTasksForUser } from '@/lib/services/tasks-service';
import type {
  PersonalTasksResult,
  TaskGroupRow,
  GiaTask,
} from '@/lib/services/tasks-service';
import type { UserRole, AppDomain } from '@/lib/types/database';
import type { TaskTab } from './page';
import { TasksShell } from './TasksShell';

interface TasksAsyncProps {
  tab:          TaskTab;
  validTabs:    TaskTab[];
  userId:       string;
  callerRole:   UserRole;
  callerDomain: AppDomain;
  callerName:   string;
}

const EMPTY_PERSONAL: PersonalTasksResult = {
  tasks:      [],
  hasMore:    false,
  nextCursor: null,
};

const EMPTY_GROUP: TaskGroupRow[] = [];
const EMPTY_GIA:  GiaTask[]      = [];

export async function TasksAsync({
  tab,
  validTabs,
  userId,
  callerRole,
  callerDomain,
  callerName,
}: TasksAsyncProps) {
  // Fetch only the active tab's data. Inactive tabs receive empty sentinels.
  let personalResult = EMPTY_PERSONAL;
  let groupRows      = EMPTY_GROUP;
  let giaTasks       = EMPTY_GIA;

  if (tab === 'personal') {
    personalResult = await getPersonalTasks(userId);
  } else if (tab === 'group') {
    groupRows = await getGroupTasks({});
  } else {
    // tab === 'gia'
    giaTasks = await getGiaTasksForUser(userId, callerRole, callerDomain);
  }

  return (
    <TasksShell
      initialTab={tab}
      validTabs={validTabs}
      personalResult={personalResult}
      groupRows={groupRows}
      giaTasks={giaTasks}
      currentUserId={userId}
      currentUserName={callerName}
      callerRole={callerRole}
      callerDomain={callerDomain}
    />
  );
}
