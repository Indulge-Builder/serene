// Skeleton for /tickets/new: back circle + title, then the form's 340 grid with the member
// card over the brief card (six field rows and the footer buttons). The right column holds
// nothing until a draft or a Sia selection exists, so it stays empty here too.

import { Shimmer, SkeletonCard, skeletonStagger } from '@/components/ui/PageSkeletons';

const FIELD_WIDTHS = [60, 90, 70, 100, 80, 50];

export default function NewTicketLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={180} h={32} />
      </div>

      <div className="serene-dossier-grid serene-dossier-grid--340 serene-dossier-grid--side-first" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <SkeletonCard style={{ display: 'block', padding: 'var(--space-5) var(--space-6)' }}>
            <Shimmer w={60} h={10} r="var(--radius-xs)" style={{ marginBottom: 'var(--space-2)' }} />
            <Shimmer h={40} r="var(--neu-radius-field)" />
          </SkeletonCard>

          <SkeletonCard style={{ display: 'block', padding: 'var(--space-5) var(--space-6)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
              {FIELD_WIDTHS.map((w, i) => (
                <div key={i} style={i === 1 ? { gridColumn: '1 / -1' } : undefined}>
                  <Shimmer w={w} h={10} r="var(--radius-xs)" delay={skeletonStagger(i)} style={{ marginBottom: 'var(--space-2)' }} />
                  <Shimmer h={40} r="var(--neu-radius-field)" delay={skeletonStagger(i)} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
              <Shimmer w={72} h={36} r="var(--neu-radius-control)" />
              <Shimmer w={120} h={36} r="var(--neu-radius-control)" />
            </div>
          </SkeletonCard>
        </div>
      </div>
    </main>
  );
}
