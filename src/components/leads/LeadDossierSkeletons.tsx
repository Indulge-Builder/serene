// Dossier streaming fallbacks — perf audit 2026-06-11 item B.
// One generic paper-card skeleton (subtle header strip + shimmer rows) shared
// by every dossier Suspense boundary and leads/[id]/loading.tsx. Server-safe.

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

const ROW_WIDTHS = ['85%', '60%', '75%', '50%', '70%'];

type Props = {
  /** Header-strip label shimmer width (default 120). */
  headerWidth?: number;
  /** Number of body shimmer rows (default 3, widths cycle 85/60/75/50/70%). */
  rows?: number;
};

/** The dossier paper-card skeleton — same chrome as LeadTasksCardSkeleton. */
export function DossierCardSkeleton({ headerWidth = 120, rows = 3 }: Props) {
  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        overflow:     'hidden',
      }}
    >
      <div
        style={{
          padding:      'var(--space-4) var(--space-6)',
          background:   'var(--theme-paper-subtle)',
          borderBottom: '1px solid var(--theme-paper-border)',
        }}
      >
        <Shimmer w={headerWidth} h={10} />
      </div>

      <div
        style={{
          padding:       'var(--space-5) var(--space-6)',
          display:       'flex',
          flexDirection: 'column',
          gap:           'var(--space-4)',
        }}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <Shimmer
            key={i}
            w={ROW_WIDTHS[i % ROW_WIDTHS.length]}
            h={14}
            delay={skeletonStagger(i)}
          />
        ))}
      </div>
    </div>
  );
}
