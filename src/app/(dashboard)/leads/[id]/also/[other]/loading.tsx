// Skeleton — the shared lead history (leads/[id]/also/[other]): back-link header,
// the read-only notice, then the notes and activity cards.

import { Shimmer } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function SharedLeadHistoryLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Shimmer w={220} h={32} />
          <Shimmer w={260} h={14} r="var(--radius-xs)" />
        </div>
      </div>

      <Shimmer w="100%" h={48} />

      <div style={{ marginTop: 'var(--space-6)' }}>
        <DossierCardSkeleton headerWidth={110} rows={3} />
      </div>
      <div style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        <DossierCardSkeleton headerWidth={130} rows={4} />
      </div>
    </main>
  );
}
