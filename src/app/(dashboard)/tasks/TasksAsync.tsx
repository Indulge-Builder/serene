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
 *   - initialAgents: agents for callerDomain fetched here so GroupTasksTab and
 *     MyTasksCalendarView never need to POST listAgentsForDomain on mount.
 *   - initialTags: personal task tags fetched here (personal tab only) so
 *     TasksShell never needs to POST getPersonalTaskTagsAction on mount.
 */

import { getPersonalTasks, getGroupTasks, getGiaTasksForUser, getPersonalTaskTags } from '@/lib/services/tasks-service';
import { getAssignableUsers } from '@/lib/services/profiles-service';
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

// Shape passed across the server→client boundary for assignable users.
// Matches the fields AssigneePickerModal + GroupRow need.
export type AgentSlim = {
  id:         string;
  full_name:  string;
  avatar_url: string | null;
  role:       UserRole;
  domain:     AppDomain;
};

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

  // Hoist assignable users for all tabs (subtask assignee picker is available to all roles).
  // Hoist tags only on the personal tab (tag filter strip is only on My Tasks).
  const needsTags = tab === 'personal' || validTabs.includes('personal');

  const [rawAssignableUsers, initialTags] = await Promise.all([
    getAssignableUsers(),
    // Tags — only needed when the personal tab is reachable
    needsTags ? getPersonalTaskTags(userId) : Promise.resolve([] as string[]),
  ]);

  if (tab === 'personal') {
    personalResult = await getPersonalTasks(userId);
  } else if (tab === 'group') {
    groupRows = await getGroupTasks({}, { userId });
  } else {
    giaTasks = await getGiaTasksForUser(userId, callerRole, callerDomain);
  }

  const initialAgents: AgentSlim[] = rawAssignableUsers.map((u) => ({
    id:         u.id,
    full_name:  u.full_name,
    avatar_url: u.avatar_url,
    role:       u.role,
    domain:     u.domain,
  }));

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
      initialAgents={initialAgents}
      initialTags={initialTags}
    />
  );
}
