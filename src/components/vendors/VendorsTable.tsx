'use client';

// VendorsTable — the /vendors dense table.
//
// Display-only (A-06): it renders the rows the server already filtered, and
// contains zero filtering, searching or sorting (the LeadsTable rule). Five
// columns — Vendor · Category · City · Times used · Score — with the row click
// opening the vendor page.
//
// A bespoke feature table rather than ui/Table: the identity cell, the score
// cell and the row-click navigation are its own anatomy (the LeadsTable
// boundary in components/CLAUDE.md).

import { memo, useCallback, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCount } from '@/lib/utils/numbers';
import { getVendorCategoryLabel } from '@/lib/constants/vendors';
import { VENDOR_STATUS_LABELS, VENDORS_PATH } from '@/lib/constants/vendors';
import type { VendorListItem } from '@/lib/types/vendor';

const HEAD: React.CSSProperties = {
  padding: 'var(--space-4)',
  textAlign: 'left',
  borderBottom: '1px solid var(--theme-paper-border)',
  whiteSpace: 'nowrap',
  color: 'var(--theme-text-tertiary)',
};

const CELL: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  borderBottom: '1px solid var(--theme-paper-border)',
  fontSize: 'var(--text-sm)',
  verticalAlign: 'middle',
};

const NUM: React.CSSProperties = {
  ...CELL,
  textAlign: 'right',
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
};

export function VendorsTable({ vendors }: { vendors: VendorListItem[] }) {
  if (vendors.length === 0) {
    return (
      <div
        style={{
          background: 'var(--theme-paper)',
          border: '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--neu-radius-card)',
          boxShadow: 'var(--shadow-1)',
          padding: 'var(--space-12) var(--space-6)',
        }}
      >
        <EmptyState
          icon={Building2}
          title="No vendors here."
          description="Try a different search, or clear the category filter."
        />
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--theme-paper)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="label-micro" style={HEAD}>Vendor</th>
              <th className="label-micro" style={HEAD}>Category</th>
              <th className="label-micro" style={HEAD}>City</th>
              <th className="label-micro" style={{ ...HEAD, textAlign: 'right' }}>Times used</th>
              <th className="label-micro" style={{ ...HEAD, textAlign: 'right' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((item) => (
              <VendorRow key={item.vendor.id} item={item} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const VendorRow = memo(function VendorRow({ item }: { item: VendorListItem }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hovered, setHovered] = useState(false);
  const { vendor, timesUsed, score } = item;
  // The list's own URL (search, category, page) rides along as ?from=, so Back
  // on the vendor page returns to THIS view — the LeadRow pattern.
  const fromUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const href = `${VENDORS_PATH}/${vendor.id}?from=${encodeURIComponent(fromUrl)}`;

  const go = useCallback(() => router.push(href), [router, href]);
  // Prefetch on hover — the LeadsTable convention; Next dedupes repeats.
  const onEnter = useCallback(() => {
    setHovered(true);
    router.prefetch(href);
  }, [router, href]);

  // Row hover is local state, not a CSS class (the LeadRow pattern) — the cell
  // background is a token either way.
  const rowCell = hovered ? { background: 'var(--neu-surface-high)' } : undefined;

  return (
    <tr
      onClick={go}
      onMouseEnter={onEnter}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      <td style={{ ...CELL, ...rowCell }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Avatar name={vendor.name} size="md" />
          <div style={{ minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                fontWeight: 'var(--weight-medium)',
                color: 'var(--theme-text-primary)',
              }}
            >
              {vendor.name}
            </span>
            {vendor.subcategory && (
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--theme-text-tertiary)',
                  marginTop: '1px',
                }}
              >
                {vendor.subcategory}
              </span>
            )}
          </div>
        </div>
      </td>

      <td style={{ ...CELL, ...rowCell }}>
        {vendor.category ? (
          <span
            style={{
              display: 'inline-flex',
              padding: '3px var(--space-3)',
              borderRadius: 'var(--radius-full)',
              background: 'var(--theme-accent-surface)',
              color: 'var(--neu-accent-deep)',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              whiteSpace: 'nowrap',
            }}
          >
            {getVendorCategoryLabel(vendor.category)}
          </span>
        ) : (
          <span style={{ color: 'var(--theme-text-tertiary)' }}>—</span>
        )}
      </td>

      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-secondary)' }}>
        {vendor.home_city ? titleCase(vendor.home_city) : '—'}
      </td>

      <td style={{ ...NUM, ...rowCell, color: timesUsed === 0 ? 'var(--theme-text-tertiary)' : undefined }}>
        {formatCount(timesUsed)}
      </td>

      {/* A blacklisted vendor shows the status in the score's place — it is the
          one status worth reading at list density, and it is why the vendor
          will never be suggested. The score underneath stays truthful. */}
      <td style={{ ...CELL, ...rowCell, textAlign: 'right' }}>
        {vendor.status === 'blacklisted' || vendor.status === 'paused' ? (
          <StatusPill status={vendor.status} />
        ) : (
          <ScoreCell score={score} />
        )}
      </td>
    </tr>
  );
});

function StatusPill({ status }: { status: 'paused' | 'blacklisted' }) {
  const danger = status === 'blacklisted';
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '3px var(--space-3)',
        borderRadius: 'var(--radius-full)',
        background: danger ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
        color: danger ? 'var(--color-danger-text)' : 'var(--color-warning-text)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        whiteSpace: 'nowrap',
      }}
    >
      {VENDOR_STATUS_LABELS[status]}
    </span>
  );
}

/** The score at table density: a short inset track + the number. No ring here. */
function ScoreCell({ score }: { score: number | null }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        justifyContent: 'flex-end',
      }}
    >
      <span
        style={{
          width: '56px',
          height: '8px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--neu-track-bg)',
          boxShadow: 'var(--neu-shadow-track)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {score != null && (
          <span
            style={{
              display: 'block',
              height: '100%',
              width: `${Math.max(0, Math.min(100, score * 10))}%`,
              borderRadius: 'var(--radius-full)',
              background: 'var(--theme-accent)',
            }}
          />
        )}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: score == null ? 'var(--weight-normal)' : 'var(--weight-semibold)',
          color: score == null ? 'var(--theme-text-tertiary)' : 'var(--neu-accent-deep)',
          minWidth: '28px',
          textAlign: 'right',
        }}
      >
        {score == null ? '—' : score.toFixed(1)}
      </span>
    </span>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
