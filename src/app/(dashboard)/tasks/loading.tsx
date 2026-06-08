// loading.tsx — tasks page.
//
// The page renders: <main p-8> → page header → <Suspense fallback={<TasksSkeleton tab={tab} />}>
// If loading.tsx renders different chrome than TasksSkeleton, the user sees two distinct
// skeleton states in sequence. Fix: render the SAME output as page.tsx would produce
// synchronously — header + TasksSkeleton with the default tab — so the transition is invisible.
//
// Default tab for non-Gia users is "personal" (My Tasks).
// TasksSkeleton already includes the filter/tab strip inside its output.

import { TasksSkeleton } from './TasksSkeleton';

export default function TasksLoading() {
  return (
    <main className="flex-1 p-8">
      {/* Page header — mirrors page.tsx row exactly */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            'var(--space-4)',
          marginBottom:   'var(--space-6)',
        }}
      >
        <div
          className="skeleton"
          style={{ width: '72px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
        <div
          className="skeleton"
          style={{ width: '100px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* Reuse the exact Suspense fallback — no duplication, no double skeleton */}
      <TasksSkeleton tab="personal" />
    </main>
  );
}
