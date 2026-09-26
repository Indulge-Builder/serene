// Skeleton for /admin/users/[id]: the same 1280px main and 340 grid as the page, the form
// cards on the left and the identity sidebar (avatar, name, email, pills, toggles) on the right.

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function UserDetailLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8" style={{ paddingBottom: 'var(--space-16)', maxWidth: '1280px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={220} h={32} />
      </div>

      <div className="serene-dossier-grid serene-dossier-grid--340" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <DossierCardSkeleton headerWidth={110} rows={4} />
          <DossierCardSkeleton headerWidth={100} rows={3} />
          <DossierCardSkeleton headerWidth={120} rows={2} />
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div
            style={{
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--neu-radius-card)',
              boxShadow:    'var(--shadow-1)',
              overflow:     'hidden',
            }}
          >
            <div style={{ padding: 'var(--space-4) var(--space-6)', background: 'var(--theme-paper-subtle)', borderBottom: '1px solid var(--theme-paper-border)' }}>
              <Shimmer w={60} h={10} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-6)' }}>
              <Shimmer w={80} h={80} r="var(--radius-md)" />
              <Shimmer w={140} h={14} delay={skeletonStagger(1)} />
              <Shimmer w={180} h={12} r="var(--radius-xs)" delay={skeletonStagger(2)} />
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                <Shimmer w={64} h={22} r="var(--radius-full)" delay={skeletonStagger(3)} />
                <Shimmer w={80} h={22} r="var(--radius-full)" delay={skeletonStagger(3)} />
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--theme-paper-border)', padding: 'var(--space-5) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[0, 1].map((i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                  <Shimmer w={120} h={12} r="var(--radius-xs)" delay={skeletonStagger(i + 4)} />
                  <Shimmer w={36} h={20} r="var(--radius-full)" delay={skeletonStagger(i + 4)} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
