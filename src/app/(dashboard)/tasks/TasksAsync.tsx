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
import { getAgentsForDomain } from '@/lib/services/leads-service';
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

// Shape passed across the server→client boundary for assignable agents.
// Matches the fields AssigneePickerModal + GroupRow need.
export type AgentSlim = {
  id:         string;
  full_name:  string;
  avatar_url: string | null;
  role:       'agent';
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

  // Hoist agents for all tabs (needed by create modals in every tab for manager+).
  // Hoist tags only on the personal tab (tag filter strip is only on My Tasks).
  const isPrivileged = callerRole === 'manager' || callerRole === 'admin' || callerRole === 'founder';
  const needsTags    = tab === 'personal' || validTabs.includes('personal');

  const [rawAgents, initialTags] = await Promise.all([
    // Agents — only meaningful for privileged roles; agents never see the picker
    isPrivileged ? getAgentsForDomain(callerDomain) : Promise.resolve([] as { id: string; full_name: string }[]),
    // Tags — only needed when the personal tab is reachable
    needsTags ? getPersonalTaskTags(userId) : Promise.resolve([] as string[]),
  ]);

  if (tab === 'personal') {
    personalResult = await getPersonalTasks(userId);
  } else if (tab === 'group') {
    groupRows = await getGroupTasks({}, { domain: callerDomain, role: callerRole });
  } else {
    giaTasks = await getGiaTasksForUser(userId, callerRole, callerDomain);
  }

  const initialAgents: AgentSlim[] = rawAgents.map((a) => ({
    id:         a.id,
    full_name:  a.full_name,
    avatar_url: null,
    role:       'agent' as const,
    domain:     callerDomain,
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
