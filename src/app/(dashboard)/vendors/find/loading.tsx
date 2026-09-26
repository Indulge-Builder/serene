// Skeleton for /vendors/find: back circle + title, then the one search card (the question,
// its line, the field with the Find button inside it, and the three requests to try).

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

export default function FindVendorLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={200} h={32} />
      </div>

      <section
        className="p-5 sm:p-6"
        style={{
          maxWidth:      '960px',
          background:    'var(--theme-paper)',
          border:        '1px solid var(--theme-paper-border)',
          borderRadius:  'var(--neu-radius-card)',
          boxShadow:     'var(--shadow-1)',
          display:       'flex',
          flexDirection: 'column',
          gap:           'var(--space-4)',
        }}
      >
        <div>
          <Shimmer w={280} h={24} style={{ marginBottom: 'var(--space-2)' }} />
          <Shimmer w="70%" h={12} r="var(--radius-xs)" />
        </div>
        <Shimmer h={56} r="var(--neu-radius-field)" />
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', minHeight: '1.75rem' }}>
          <Shimmer w={24} h={10} r="var(--radius-xs)" />
          {[150, 120, 170].map((w, i) => (
            <Shimmer key={i} w={w} h={32} r="var(--neu-radius-control)" delay={skeletonStagger(i)} />
          ))}
        </div>
      </section>
    </main>
  );
}
