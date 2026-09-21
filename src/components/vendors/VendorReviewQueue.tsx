// VendorReviewQueue — the "Needs a look" strip on /vendors (2026-09-21).
//
// The live extractor (0214) writes vendors on its own and marks every one
// `unverified`. Until now nothing showed a person which rows those were, so the
// queue could only be worked from SQL. This is the queue: the newest extractor
// rows nobody has confirmed, each with the evidence the machine left (the ticket,
// the words it read, the rows it thought looked similar). Every answer a person
// can give lives on the vendor page it links to: confirm, merge in, or remove.
//
// Server component, display-only (A-06). Renders nothing when the queue is empty,
// so the list page is unchanged for a team whose extractor is quiet.
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { formatDate } from '@/lib/utils/dates';
import { getVendorCategoryLabel, VENDORS_PATH } from '@/lib/constants/vendors';
import type { VendorReviewItem } from '@/lib/types/vendor';

type Props = {
  items: VendorReviewItem[];
  totalCount: number;
};

export function VendorReviewQueue({ items, totalCount }: Props) {
  if (items.length === 0) return null;
  const more = totalCount - items.length;

  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <SectionCard
        title="Needs a look"
        description={`${totalCount} vendor${totalCount === 1 ? '' : 's'} written by the extractor from Freshdesk notes and not yet checked by a person. Open one to confirm it, merge it into the row it duplicates, or remove it.`}
        bodyPadding={false}
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map(({ vendor, evidence }) => {
            const from = evidence.ticketId
              ? `from ticket #${evidence.ticketId}${evidence.readAt ? ` on ${formatDate(evidence.readAt)}` : ''}`
              : `written ${formatDate(vendor.created_at)}`;
            return (
              <li
                key={vendor.id}
                style={{ borderTop: '1px solid var(--theme-paper-border)' }}
              >
                <Link
                  href={`${VENDORS_PATH}/${vendor.id}?from=${encodeURIComponent(VENDORS_PATH)}`}
                  className="serene-pressable"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-5)',
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <Sparkles
                    style={{ width: '1rem', height: '1rem', strokeWidth: 1.5, color: 'var(--neu-accent-deep)', flexShrink: 0 }}
                  />
                  <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 'var(--weight-medium)',
                        color: 'var(--theme-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {vendor.name}
                      {vendor.category && (
                        <span style={{ color: 'var(--theme-text-tertiary)', fontWeight: 'var(--weight-normal)' }}>
                          {' · '}
                          {getVendorCategoryLabel(vendor.category)}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                      {from}
                      {evidence.possibleDuplicateOf.length > 0 && (
                        <>
                          {' · '}
                          <span style={{ color: 'var(--color-warning-text)' }}>
                            might be {evidence.possibleDuplicateOf.slice(0, 2).join(' or ')}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <ArrowRight
                    style={{ width: '1rem', height: '1rem', strokeWidth: 1.5, color: 'var(--theme-text-tertiary)', flexShrink: 0 }}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
        {more > 0 && (
          <p
            style={{
              margin: 0,
              padding: 'var(--space-3) var(--space-5)',
              borderTop: '1px solid var(--theme-paper-border)',
              fontSize: 'var(--text-xs)',
              color: 'var(--theme-text-tertiary)',
            }}
          >
            {more} more waiting. Each one clears as it is confirmed, merged or removed.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
