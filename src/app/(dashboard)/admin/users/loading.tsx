// Skeleton — admin/users (Team) page.
// Composes the shared scaffold (PageSkeletons): header + filter strip + member card list.
// Each card mirrors the UserCard flex row: avatar+name/email | job-title |
// domain pill | status | edit link.

import {
  PageHeaderSkeleton,
  FilterBarSkeleton,
  SkeletonCard,
  Shimmer,
  skeletonStagger,
} from '@/components/ui/PageSkeletons';

export default function AdminUsersLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={72} actionWidth={120} />

      {/* Filter bar — matches UsersTable filter strip */}
      <FilterBarSkeleton icon searchWidth="flex" chips={[96, 88]} countWidth={64} wrap />

      {/* Member card list — 6 cards matching UserCard flex structure */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard key={i}>
              {/* Avatar + name/email — flex: 1 1 220px */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: '1 1 220px', minWidth: 0 }}>
                <Shimmer w={36} h={36} r="var(--radius-md)" delay={delay} style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
                  <Shimmer w={130} h={13} r="var(--radius-xs)" delay={delay} />
                  <Shimmer w={160} h={10} r="var(--radius-xs)" delay={delay} />
                </div>
              </div>

              {/* Job title — flex: 2 1 200px */}
              <Shimmer h={13} r="var(--radius-xs)" delay={delay} style={{ flex: '2 1 200px' }} />

              {/* Domain pill */}
              <Shimmer w={80} h={22} r="var(--radius-full)" delay={delay} style={{ flexShrink: 0 }} />

              {/* Status pill */}
              <Shimmer w={72} h={22} r="var(--radius-full)" delay={delay} style={{ flexShrink: 0 }} />

              {/* Edit link */}
              <Shimmer w={48} h={13} r="var(--radius-xs)" delay={delay} style={{ flexShrink: 0 }} />
            </SkeletonCard>
          );
        })}
      </div>
    </main>
  );
}
