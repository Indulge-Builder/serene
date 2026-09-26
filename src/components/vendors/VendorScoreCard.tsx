// VendorScoreCard — the score column beside the identity card.
//
// Deliberately COMPACT so it sits level with the identity card rather than
// towering over it: the ring and "times used" share one row instead of
// stacking, and the four ratings are a 2×2 grid rather than four full-width
// rows. The per-dimension rating count moves to the header (one "N reviews"
// instead of the same number repeated four times) and stays available on hover
// — at this column width it cost more space than it carried.
//
// Display-only (A-06), server-component-safe, with ONE client island: the
// sticky-note control (0191), the way the identity card hosts the category
// picker.

import { TrendingUp } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Tooltip } from '@/components/ui/Tooltip';
import { StarRating } from './StarRating';
import { VendorScoreRing } from './VendorScoreRing';
import { VendorPreferenceControl } from './VendorPreferenceControl';
import { formatCount } from '@/lib/utils/numbers';
import { REVIEW_DIMENSION_LABELS } from '@/lib/constants/vendors';
import type { VendorDetail } from '@/lib/types/vendor';

export function VendorScoreCard({
  score,
  timesUsed,
  ratings,
  reviewerCount,
  preferences,
  vendorId,
  currentUserId,
}: Pick<VendorDetail, 'score' | 'timesUsed' | 'ratings' | 'reviewerCount' | 'preferences'> & {
  vendorId: string;
  currentUserId: string;
}) {
  // computeVendorScore already returns null until someone has actually judged
  // this vendor; the ring renders that as an em dash, never a 0 (which would
  // read as "bad" rather than "not rated").
  const scoreValue = score.score;

  return (
    <div
      style={{
        background: 'var(--theme-paper)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
        // Fill the grid row so it sits level with the identity card beside it.
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardHeader
        icon={TrendingUp}
        label="Score"
        right={
          <span
            style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}
          >
            {reviewerCount === 0
              ? 'No ratings yet'
              : `${formatCount(reviewerCount)} ${reviewerCount === 1 ? 'review' : 'reviews'}`}
          </span>
        }
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          // flex-start, NOT space-between: the card stretches to sit level with
          // the identity card beside it, and space-between spent that extra
          // height as a gap between the ring and the ratings. Stacked at the
          // top, the two read as one block.
          justifyContent: 'flex-start',
          gap: 'var(--space-5)',
          padding: 'var(--space-5)',
        }}
      >
        {/* Ring and times-used share a row — stacking them was most of the
            wasted height. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-5)',
          }}
        >
          <VendorScoreRing score={scoreValue} size={108} stroke={8} />
          <div style={{ textAlign: 'center' }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 'var(--weight-semibold)',
                fontSize: 'var(--text-lg)',
                lineHeight: 1.1,
                color: 'var(--theme-text-primary)',
              }}
            >
              {formatCount(timesUsed)}
            </span>
            <span
              className="label-micro"
              style={{
                display: 'block',
                color: 'var(--theme-text-tertiary)',
                marginTop: 'var(--space-2)',
              }}
            >
              Times used
            </span>
          </div>
        </div>

        <div>
          <span
            className="label-micro"
            style={{
              display: 'block',
              color: 'var(--theme-text-tertiary)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--theme-paper-border)',
              marginBottom: 'var(--space-4)',
            }}
          >
            How the team rates them
          </span>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
              gap: 'var(--space-4) var(--space-3)',
            }}
          >
            {ratings.map((r) => {
              // The per-dimension count lives here (the header carries only the
              // total): on the pill for pointers, sr-only for everyone else.
              const summary =
                r.count === 0
                  ? `${REVIEW_DIMENSION_LABELS[r.dimension]}: not rated yet`
                  : `${REVIEW_DIMENSION_LABELS[r.dimension]}: ${r.average?.toFixed(1)} from ${r.count} ${r.count === 1 ? 'rating' : 'ratings'}`;
              return (
              <Tooltip key={r.dimension} label={summary} side="top" wrap="block">
              <div>
                <span className="sr-only">{summary}</span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
                    {REVIEW_DIMENSION_LABELS[r.dimension]}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 'var(--weight-semibold)',
                      fontSize: 'var(--text-sm)',
                      color:
                        r.average == null ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)',
                    }}
                  >
                    {r.average == null ? '—' : r.average.toFixed(1)}
                  </span>
                </div>
                <StarRating
                  value={r.average}
                  size={14}
                  label={REVIEW_DIMENSION_LABELS[r.dimension]}
                />
              </div>
              </Tooltip>
              );
            })}
          </div>
        </div>

        {/* The sticky note (0191): your take, and the team's. */}
        <VendorPreferenceControl
          vendorId={vendorId}
          preferences={preferences}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
