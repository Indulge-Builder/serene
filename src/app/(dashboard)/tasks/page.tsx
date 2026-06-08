import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { GIA_DOMAINS } from '@/lib/constants/domains';
import { AddTaskButton } from '@/components/tasks/AddTaskButton';
import { TasksCreateProvider } from '@/components/tasks/TasksCreateContext';
import { TasksAsync } from './TasksAsync';
import { TasksSkeleton } from './TasksSkeleton';

export type TaskTab = 'gia' | 'personal' | 'group';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Thin orchestrator — only reads session and URL params.
  // No data-fetching calls in this component body.
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role === 'guest') redirect('/dashboard');

  // Compute which tabs this caller can access.
  // GIA_DOMAINS agents/managers see the Gia Tasks tab; others do not.
  const isGiaDomain = (GIA_DOMAINS as readonly string[]).includes(profile.domain);

  // All non-guest roles get the Group Tasks tab.
  // Gia domain adds the Gia tab regardless of role.
  const validTabs: TaskTab[] = isGiaDomain
    ? ['gia', 'personal', 'group']
    : ['personal', 'group'];

  // Resolve ?tab= against valid tabs — default is always 'personal' (My Tasks).
  const resolvedParams = await searchParams;
  const rawTab = typeof resolvedParams.tab === 'string' ? resolvedParams.tab : '';
  const tab = (validTabs as string[]).includes(rawTab)
    ? (rawTab as TaskTab)
    : 'personal';

  return (
    <main className="flex-1 p-8">
      <TasksCreateProvider>
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="type-page-title m-0">
            Tasks<span className="page-title-dot">.</span>
          </h1>
          <AddTaskButton activeTab={tab} validTabs={validTabs} />
        </div>

        <Suspense fallback={<TasksSkeleton tab={tab} />}>
          <TasksAsync
            tab={tab}
            validTabs={validTabs}
            userId={profile.id}
            callerRole={profile.role}
            callerDomain={profile.domain}
            callerName={profile.full_name}
          />
        </Suspense>
      </TasksCreateProvider>
    </main>
  );
}
