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

import { getPersonalTasks, getGroupTasks } from '@/lib/services/tasks-service';
import type {
  PersonalTasksResult,
  TaskGroupRow,
} from '@/lib/services/tasks-service';
import type { UserRole, AppDomain } from '@/lib/types/database';
import { TasksShell } from './TasksShell';

interface TasksAsyncProps {
  tab:          'personal' | 'group';
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

export async function TasksAsync({
  tab,
  userId,
  callerRole,
  callerDomain,
  callerName,
}: TasksAsyncProps) {
  // Fetch only the active tab's data. The inactive tab receives an empty sentinel
  // and will fetch client-side on first activation via its actions.
  const [personalResult, groupRows] = await (
    tab === 'group'
      ? Promise.all([
          Promise.resolve(EMPTY_PERSONAL),
          getGroupTasks({}),
        ])
      : Promise.all([
          getPersonalTasks(userId),
          Promise.resolve(EMPTY_GROUP),
        ])
  );

  return (
    <TasksShell
      initialTab={tab}
      personalResult={personalResult}
      groupRows={groupRows}
      currentUserId={userId}
      currentUserName={callerName}
      callerRole={callerRole}
      callerDomain={callerDomain}
    />
  );
}
