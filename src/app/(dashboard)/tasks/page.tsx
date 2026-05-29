import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { TasksAsync } from './TasksAsync';
import { TasksSkeleton } from './TasksSkeleton';

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

  const resolvedParams = await searchParams;
  const tab = typeof resolvedParams.tab === 'string' && resolvedParams.tab === 'group'
    ? 'group'
    : 'personal';

  return (
    <main className="flex-1 p-8">
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="type-page-title" style={{ margin: 0 }}>
          Tasks<span className="page-title-dot">.</span>
        </h1>
      </div>

      <Suspense fallback={<TasksSkeleton tab={tab} />}>
        <TasksAsync
          tab={tab}
          userId={profile.id}
          callerRole={profile.role}
          callerDomain={profile.domain}
          callerName={profile.full_name}
        />
      </Suspense>
    </main>
  );
}
