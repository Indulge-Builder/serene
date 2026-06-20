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
 *
 * SSR hoists (perf):
 *   - initialAgents: assignable users fetched here so GroupTasksTab and
 *     MyTasksCalendarView never need to POST getAssignableUsersAction on mount.
 *   - initialTags: personal task tags fetched here (personal tab only) so
 *     TasksShell never needs to POST getPersonalTaskTagsAction on mount.
 */

import { getPersonalTasks, getGroupTasks, getPersonalTaskTags } from '@/lib/services/tasks-service';
import { getAssignableUsers } from '@/lib/services/profiles-service';
import type {
  PersonalTasksResult,
  TaskGroupRow,
} from '@/lib/services/tasks-service';
import type { UserRole, AppDomain } from '@/lib/types/database';
import type { AssignableUser } from '@/lib/types';
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

export async function TasksAsync({
  tab,
  validTabs,
  userId,
  callerRole,
  callerDomain,
  callerName,
}: TasksAsyncProps) {
  // One wave: hoisted agents + tags + the active tab's data all run in
  // parallel — none of them depend on each other. Inactive tabs receive
  // empty sentinels (TasksShell only mounts the active panel).
  // Tags are fetched ONLY on the personal tab — TasksShell re-seeds its
  // tag state from the prop on every personal-tab RSC pass, so a user
  // landing on gia/group and switching later still gets fresh tags.
  const [initialAgents, initialTags, personalResult, groupRows]: [
    AssignableUser[],
    string[],
    PersonalTasksResult,
    TaskGroupRow[],
  ] = await Promise.all([
    getAssignableUsers(),
    tab === 'personal' ? getPersonalTaskTags(userId) : Promise.resolve([] as string[]),
    tab === 'personal' ? getPersonalTasks(userId) : Promise.resolve(EMPTY_PERSONAL),
    tab === 'group' ? getGroupTasks({}, { userId }) : Promise.resolve(EMPTY_GROUP),
  ]);

  return (
    <TasksShell
      initialTab={tab}
      validTabs={validTabs}
      personalResult={personalResult}
      groupRows={groupRows}
      currentUserId={userId}
      currentUserName={callerName}
      callerRole={callerRole}
      callerDomain={callerDomain}
      initialAgents={initialAgents}
      initialTags={initialTags}
    />
  );
}
