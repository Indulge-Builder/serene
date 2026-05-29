import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getErroredPayloads } from '@/lib/services/leads-service';
import { ErrorLogTable } from '@/components/error-log/ErrorLogTable';
import { ErrorLogTableSkeleton } from '@/components/error-log/ErrorLogTableSkeleton';

export default async function ErrorLogPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect('/login');

  // Only admin and founder may view raw payload error logs (mirrors RLS policy)
  if (profile.role !== 'admin' && profile.role !== 'founder') {
    redirect('/dashboard');
  }

  const rows = await getErroredPayloads();

  return (
    <main style={{ flex: 1, padding: 'var(--space-8)' }}>
      {/* Page header */}
      <div
        style={{
          display:      'flex',
          alignItems:   'flex-start',
          gap:          'var(--space-3)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          '2.5rem',
            height:         '2.5rem',
            borderRadius:   'var(--radius-md)',
            background:     'var(--color-danger-light)',
            flexShrink:     0,
            marginTop:      '2px',
          }}
        >
          <AlertTriangle
            style={{
              width:  '1.125rem',
              height: '1.125rem',
              color:  'var(--color-danger-text)',
            }}
          />
        </div>

        <div>
          <h1 className="type-page-title" style={{ margin: 0 }}>
            Error Log<span className="page-title-dot">.</span>
          </h1>
          <p
            style={{
              marginTop: 'var(--space-1)',
              fontSize:  'var(--text-sm)',
              color:     'var(--theme-text-secondary)',
              lineHeight: 'var(--leading-relaxed)',
            }}
          >
            Every webhook payload that failed ingestion is recorded here.
            Use the raw payload viewer to diagnose the problem.
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div
        style={{
          display:      'flex',
          gap:          'var(--space-4)',
          marginBottom: 'var(--space-5)',
          flexWrap:     'wrap',
        }}
      >
        <StatCard label="Total errors" value={rows.length} variant="danger" />
        <StatCard
          label="Unauthorised"
          value={rows.filter((r) => r.ingestion_error === 'unauthorized').length}
          variant="warning"
        />
        <StatCard
          label="DB failures"
          value={rows.filter((r) => r.ingestion_error?.startsWith('db_insert_failed')).length}
          variant="danger"
        />
        <StatCard
          label="Validation"
          value={rows.filter((r) => r.ingestion_error === 'validation_failed').length}
          variant="neutral"
        />
      </div>

      {/* Table */}
      <Suspense fallback={<ErrorLogTableSkeleton />}>
        <ErrorLogTable rows={rows} />
      </Suspense>
    </main>
  );
}

// ─────────────────────────────────────────────
// Stat card — display-only, no business logic
// ─────────────────────────────────────────────
type StatVariant = 'danger' | 'warning' | 'neutral';

const STAT_COLOURS: Record<StatVariant, { bg: string; label: string; value: string; border: string }> = {
  danger: {
    bg:     'var(--color-danger-light)',
    label:  'var(--color-danger-text)',
    value:  'var(--color-danger)',
    border: 'color-mix(in srgb, var(--color-danger) 20%, transparent)',
  },
  warning: {
    bg:     'var(--color-warning-light)',
    label:  'var(--color-warning-text)',
    value:  'var(--color-warning)',
    border: 'color-mix(in srgb, var(--color-warning) 20%, transparent)',
  },
  neutral: {
    bg:     'var(--theme-paper-subtle)',
    label:  'var(--theme-text-secondary)',
    value:  'var(--theme-text-primary)',
    border: 'var(--theme-paper-border)',
  },
};

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: StatVariant;
}) {
  const c = STAT_COLOURS[variant];

  return (
    <div
      style={{
        minWidth:     '9rem',
        padding:      'var(--space-4) var(--space-5)',
        borderRadius: 'var(--radius-md)',
        background:   c.bg,
        border:       `1px solid ${c.border}`,
        boxShadow:    'var(--shadow-1)',
      }}
    >
      <p
        style={{
          margin:        0,
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-widest)',
          textTransform: 'uppercase',
          color:         c.label,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin:     '0.25rem 0 0',
          fontSize:   'var(--text-2xl)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 'var(--weight-semibold)',
          color:      c.value,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  );
}
