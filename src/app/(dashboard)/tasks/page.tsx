import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getPersonalTasks, getGroupTasks } from '@/lib/services/tasks-service';
import { TasksShell } from './TasksShell';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role === 'guest') redirect('/dashboard');

  const resolvedParams = await searchParams;
  const tab = typeof resolvedParams.tab === 'string'
    ? resolvedParams.tab
    : 'personal';

  const [personalResult, groupRows] = await Promise.all([
    getPersonalTasks(profile.id),
    getGroupTasks(),
  ]);

  return (
    <main className="flex-1 p-8">
      <div className="mb-6">
        <h1 className="type-page-title m-0">Tasks</h1>
      </div>

      <TasksShell
        initialTab={tab === 'group' ? 'group' : 'personal'}
        personalResult={personalResult}
        groupRows={groupRows}
        currentUserId={profile.id}
        currentUserName={profile.full_name}
        callerRole={profile.role}
        callerDomain={profile.domain}
      />
    </main>
  );
}
