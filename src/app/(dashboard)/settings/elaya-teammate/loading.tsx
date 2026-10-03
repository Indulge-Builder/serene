// Skeleton for /settings/elaya-teammate: back circle + title, the intro, the switch card, then the
// intervention cards stacked.

import { Shimmer } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function ElayaTeammateLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-3">
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={240} h={32} />
      </div>
      <Shimmer w="70%" h={12} r="var(--radius-xs)" style={{ maxWidth: 720, marginBottom: 'var(--space-8)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <DossierCardSkeleton headerWidth={160} rows={2} />
        <DossierCardSkeleton headerWidth={180} rows={4} />
        <DossierCardSkeleton headerWidth={150} rows={4} />
      </div>
    </main>
  );
}
