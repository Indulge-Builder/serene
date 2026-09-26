// Skeleton for /tickets/[id], in the ticket page's own shape: back circle + number + title,
// the meta line, the controls strip, then the help window on the LEFT of the 340 aside grid.
// Without this file, opening a ticket painted the list skeleton first (the parent boundary).

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function TicketLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={64} h={18} />
        <Shimmer w={280} h={32} />
      </div>

      {/* For whom, opened when, the clocks */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3) var(--space-5)', marginBottom: 'var(--space-6)' }}>
        {[120, 140, 170].map((w, i) => (
          <Shimmer key={i} w={w} h={12} r="var(--radius-xs)" delay={skeletonStagger(i)} />
        ))}
      </div>

      {/* Status, priority, assignee controls */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          flexWrap:     'wrap',
          gap:          'var(--space-3)',
          marginBottom: 'var(--space-6)',
          padding:      'var(--space-4) var(--space-5)',
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--neu-radius-card)',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        {[140, 120, 160].map((w, i) => (
          <Shimmer key={i} w={w} h={36} r="var(--radius-md)" delay={skeletonStagger(i)} style={{ flexShrink: 0 }} />
        ))}
      </div>

      <div className="serene-dossier-grid serene-dossier-grid--340 serene-dossier-grid--aside-left" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
          <DossierCardSkeleton headerWidth={90} rows={2} />
          <DossierCardSkeleton headerWidth={110} rows={4} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
          <DossierCardSkeleton headerWidth={80} rows={4} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-6)' }}>
            <DossierCardSkeleton headerWidth={100} rows={3} />
            <DossierCardSkeleton headerWidth={80} rows={2} />
          </div>
          <DossierCardSkeleton headerWidth={100} rows={5} />
        </div>
      </div>
    </main>
  );
}
