/**
 * WorkspaceAsync — async server component; direct child of <Suspense> in page.tsx.
 *
 * Prop boundary contract:
 *   - All props received from page.tsx are serialisable primitives (strings).
 *   - All props passed to GroupTaskWorkspace are serialisable plain objects.
 *   - No service function references, no Promises, no class instances cross
 *     either boundary.
 *   - This component may import from lib/services — GroupTaskWorkspace may not.
 *
 * Null-group redirect:
 *   getTaskGroupById returns null when RLS denies access (e.g. manager from
 *   a different domain) or the group does not exist. The redirect happens here,
 *   inside the async component, not in page.tsx — if it were in the page, the
 *   page would have to await the data fetch to know whether to redirect, which
 *   defeats the entire purpose of streaming.
 */

import { redirect } from 'next/navigation';
import { getTaskGroupById, getGroupSubtasks } from '@/lib/services/tasks-service';
import type { UserRole, AppDomain } from '@/lib/types/database';
import { GroupTaskWorkspace } from '@/components/tasks/GroupTaskWorkspace';

interface WorkspaceAsyncProps {
  groupId:         string;
  currentUserId:   string;
  currentUserName: string;
  callerRole:      UserRole;
  callerDomain:    AppDomain;
}

export async function WorkspaceAsync({
  groupId,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
}: WorkspaceAsyncProps) {
  const [group, initialSubtasks] = await Promise.all([
    getTaskGroupById(groupId),
    getGroupSubtasks(groupId),
  ]);

  // Null = RLS denied or group not found — never 404, always redirect
  if (!group) redirect('/tasks?tab=group');

  return (
    <GroupTaskWorkspace
      group={group}
      initialSubtasks={initialSubtasks}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      callerRole={callerRole}
      callerDomain={callerDomain}
    />
  );
}
