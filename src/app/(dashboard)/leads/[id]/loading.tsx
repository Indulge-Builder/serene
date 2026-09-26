// Skeleton — lead dossier chrome (perf audit 2026-06-11 item B).
// Before this file existed, navigating to a dossier showed the parent list
// skeleton (leads/loading.tsx) — wrong shape. Mirrors the wave-1 layout:
// back-link header, status strip, two-column cards, notes + history sections.

import { Shimmer } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function LeadDossierLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Header — back button circle + title + phone line */}
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
          <Shimmer w={130} h={14} r="var(--radius-xs)" />
        </div>
      </div>

      {/* Status action strip — the StatusActionPanel shape: one row on md+, on a phone the
          pill + Called row with the stage actions in an equal-width row below (mobile audit
          2026-09-26: the skeleton was one row with a different radius). */}
      <div
        style={{
          display:      'flex',
          flexDirection: 'column',
          gap:          'var(--space-3)',
          padding:      'var(--space-4) var(--space-5)',
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--neu-radius-card)',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        <div className="hidden md:flex" style={{ alignItems: 'center', gap: 'var(--space-3)' }}>
          <Shimmer w={90} h={26} r="var(--radius-full)" />
          {[96, 110, 84].map((w, i) => (
            <Shimmer key={i} w={w} h={34} delay={i * 40} style={{ flexShrink: 0 }} />
          ))}
          <div style={{ flex: 1 }} />
          <Shimmer w={84} h={34} delay={120} style={{ flexShrink: 0 }} />
        </div>
        <div className="md:hidden" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Shimmer w={90} h={26} r="var(--radius-full)" />
          <div style={{ flex: 1 }} />
          <Shimmer w={84} h={34} style={{ flexShrink: 0 }} />
        </div>
        <div className="md:hidden" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} w="100%" h={34} delay={i * 40} />
          ))}
        </div>
      </div>

      {/* Two-column layout — mirrors page.tsx (.serene-dossier-grid collapse below lg) */}
      <div className="serene-dossier-grid" style={{ marginTop: 'var(--space-6)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <DossierCardSkeleton headerWidth={140} rows={5} />
          <DossierCardSkeleton headerWidth={120} rows={3} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <DossierCardSkeleton headerWidth={100} rows={2} />
          <DossierCardSkeleton headerWidth={100} rows={3} />
        </div>
      </div>

      {/* Notes timeline */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <DossierCardSkeleton headerWidth={110} rows={3} />
      </div>

      {/* Journey + activity history */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <DossierCardSkeleton headerWidth={130} rows={2} />
      </div>
      <div style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        <DossierCardSkeleton headerWidth={130} rows={4} />
      </div>
    </main>
  );
}
