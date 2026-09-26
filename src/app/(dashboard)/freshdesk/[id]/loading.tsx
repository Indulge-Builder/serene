// Skeleton for /freshdesk/[id], in the ticket dossier's own shape: back circle + number +
// subject, then the thread and the movement timeline beside the summary card.

import { Shimmer } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function FreshdeskTicketLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={64} h={18} />
        <Shimmer w={300} h={32} />
      </div>

      <div className="serene-dossier-grid" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
          <DossierCardSkeleton headerWidth={110} rows={6} />
          <DossierCardSkeleton headerWidth={120} rows={4} />
        </div>
        <DossierCardSkeleton headerWidth={90} rows={6} />
      </div>
    </main>
  );
}
