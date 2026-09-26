// Skeleton for /settings/elaya-playbooks: back circle + title, then the list of playbooks
// beside the editor (the panel's 340-and-rest grid, on the shared aside-left class so it
// collapses below lg like the rest of the app), and the Try-it card beneath.

import { Shimmer } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function ElayaPlaybooksLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={220} h={32} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div className="serene-dossier-grid serene-dossier-grid--340 serene-dossier-grid--aside-left" style={{ alignItems: 'start' }}>
          <DossierCardSkeleton headerWidth={80} rows={5} />
          <DossierCardSkeleton headerWidth={110} rows={4} />
        </div>
        <DossierCardSkeleton headerWidth={60} rows={2} />
      </div>
    </main>
  );
}
