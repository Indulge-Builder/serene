import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import { PageControls } from '@/components/layout/PageControls';
import { CondensingPageHeader } from '@/components/layout/CondensingPageHeader';
import { AddTaskButton } from '@/components/tasks/AddTaskButton';
import { CompletedTasksButton } from '@/components/tasks/CompletedTasksButton';
import { TasksCreateProvider } from '@/components/tasks/TasksCreateContext';
import { TasksAsync } from './TasksAsync';
import { TasksSkeleton } from './TasksSkeleton';

export const metadata = { title: 'Tasks' };

export type TaskTab = 'personal' | 'group';

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

  // All non-guest roles get My Tasks + Group Tasks.
  const validTabs: TaskTab[] = ['personal', 'group'];

  // Resolve ?tab= against valid tabs — default is always 'personal' (My Tasks).
  // A legacy ?tab=gia (Gia tab removed) or any invalid value falls back to 'personal'.
  const resolvedParams = await searchParams;
  const rawTab = typeof resolvedParams.tab === 'string' ? resolvedParams.tab : '';
  const tab = (validTabs as string[]).includes(rawTab)
    ? (rawTab as TaskTab)
    : 'personal';

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <TasksCreateProvider>
        {/* Sticky header — condenses past 24px scroll (polish §07) */}
        <CondensingPageHeader title="Tasks">
          <CompletedTasksButton
            currentUser={{
              id: profile.id,
              full_name: profile.full_name,
              role: profile.role,
              domain: profile.domain,
            }}
          />
          <AddTaskButton activeTab={tab} validTabs={validTabs} />
          {TOP_BAR_ENABLED && (
            <PageControls
              isPrivileged={false}
            />
          )}
        </CondensingPageHeader>

        <Suspense fallback={<TasksSkeleton tab={tab} />}>
          <TasksAsync
            tab={tab}
            validTabs={validTabs}
            callerRole={profile.role}
            callerDomain={profile.domain}
            callerName={profile.full_name}
            userId={profile.id}
          />
        </Suspense>
      </TasksCreateProvider>
    </main>
  );
}
