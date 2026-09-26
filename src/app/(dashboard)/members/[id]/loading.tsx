// Skeleton for /members/[id], in the dossier's own shape: back circle + name, the identity
// card beside health and WhatsApp, the observation box, then the two facts cards.
// Without this file, opening a member painted the list skeleton first (the parent boundary).

import { Shimmer } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function MemberLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={240} h={32} />
      </div>

      <div className="serene-dossier-grid" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
        <DossierCardSkeleton headerWidth={100} rows={6} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <DossierCardSkeleton headerWidth={80} rows={2} />
          <DossierCardSkeleton headerWidth={110} rows={2} />
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <DossierCardSkeleton headerWidth={120} rows={2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 'var(--space-6)' }}>
        <DossierCardSkeleton headerWidth={90} rows={4} />
        <DossierCardSkeleton headerWidth={100} rows={4} />
      </div>
    </main>
  );
}
