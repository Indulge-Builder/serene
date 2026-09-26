// Skeleton for /admin/users/new: the same 1280px main and 340 grid as NewUserClient, the
// details form card on the left and the Create / Invite card (tab tray over its fields) on the right.

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function NewUserLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8" style={{ paddingBottom: 'var(--space-16)', maxWidth: '1280px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={200} h={32} />
      </div>

      <div className="serene-dossier-grid serene-dossier-grid--340" style={{ alignItems: 'start' }}>
        <DossierCardSkeleton headerWidth={120} rows={6} />

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
              <Shimmer w={90} h={10} />
            </div>
            <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Shimmer h={36} r="var(--radius-md)" />
              {[0, 1, 2].map((i) => (
                <Shimmer key={i} w={['85%', '60%', '75%'][i]} h={14} delay={skeletonStagger(i + 1)} />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
