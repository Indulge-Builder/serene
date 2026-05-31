/**
 * Group Task Workspace — /tasks/[id]
 *
 * Thin orchestrator. Reads params.id and the session only.
 * Zero data-fetching calls — all data fetching lives in WorkspaceAsync.
 *
 * Suspense boundary:
 *   WorkspaceSkeleton renders immediately on navigation to /tasks/[id].
 *   WorkspaceAsync streams in behind it once the DB round-trips complete.
 *
 * Null-group redirect (RLS denied / group not found) happens inside
 * WorkspaceAsync, not here — so it can still stream without blocking
 * the page on the data fetch result.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { WorkspaceAsync } from './WorkspaceAsync';
import { WorkspaceSkeleton } from './WorkspaceSkeleton';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GroupTaskWorkspacePage({ params }: Props) {
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role === 'guest') redirect('/dashboard');

  return (
    <main className="flex-1 p-8">
      <Suspense fallback={<WorkspaceSkeleton />}>
        <WorkspaceAsync
          groupId={id}
          currentUserId={profile.id}
          currentUserName={profile.full_name}
          callerRole={profile.role}
          callerDomain={profile.domain}
        />
      </Suspense>
    </main>
  );
}
