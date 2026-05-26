import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { JOURNEY_STATUSES, RESOLUTION_STATUSES, LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import type { Lead } from '@/lib/types/database';
import type { LeadActivityWithActor } from '@/lib/services/leads-service';

type Props = {
  lead: Lead;
  activities: LeadActivityWithActor[];
};

// Timestamps keyed by status (when did the lead first enter this status)
function buildStatusTimestamps(
  lead: Lead,
  activities: LeadActivityWithActor[],
): Record<string, Date | null> {
  const map: Record<string, Date | null> = {
    new:           new Date(lead.created_at),
    touched:       null,
    in_discussion: null,
    won:           null,
  };

  for (const act of activities) {
    if (act.action_type !== 'status_changed' || !act.details) continue;
    const d = act.details as { new_status?: string };
    if (d.new_status && d.new_status in map && !map[d.new_status]) {
      map[d.new_status] = new Date(act.created_at);
    }
  }

  return map;
}

function formatDwell(from: Date, to: Date): string {
  const ms      = to.getTime() - from.getTime();
  const minutes = Math.floor(ms / 60_000);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

export function LeadJourneyTimeline({ lead, activities }: Props) {
  const timestamps = buildStatusTimestamps(lead, activities);
  const now        = new Date();

  const isResolved = (RESOLUTION_STATUSES as string[]).includes(lead.status);
  const currentJourneyIdx = JOURNEY_STATUSES.indexOf(lead.status as typeof JOURNEY_STATUSES[number]);

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
      {/* Header */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          padding:      'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper-subtle)',
        }}
      >
        <Clock
          style={{
            width:       '0.875rem',
            height:      '0.875rem',
            color:       'var(--theme-text-tertiary)',
            strokeWidth: 1.5,
            flexShrink:  0,
          }}
        />
        <span
          style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
          }}
        >
          Lead Journey
        </span>

        {/* Resolution badge */}
        {isResolved && (
          <span
            style={{
              marginLeft:   'auto',
              display:      'inline-flex',
              alignItems:   'center',
              padding:      '0.125rem var(--space-2)',
              borderRadius: 'var(--radius-full)',
              background:   lead.status === 'won'
                ? 'var(--color-success-light)'
                : lead.status === 'nurturing'
                  ? 'var(--theme-accent-surface)'
                  : 'var(--color-danger-light)',
              color: lead.status === 'won'
                ? 'var(--color-success-text)'
                : lead.status === 'nurturing'
                  ? 'var(--theme-accent)'
                  : 'var(--color-danger-text)',
              fontSize:   'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
            }}
          >
            {LEAD_STATUS_LABELS[lead.status]}
          </span>
        )}
      </div>

      {/* Stages */}
      <div style={{ padding: 'var(--space-6) var(--space-5)' }}>
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: `repeat(${JOURNEY_STATUSES.length}, 1fr)`,
            gap:                 'var(--space-2)',
            position:            'relative',
          }}
        >
          {/* Connector line */}
          <div
            style={{
              position:    'absolute',
              top:         '10px',
              left:        'calc(50% / 4)',
              right:       'calc(50% / 4)',
              height:      '2px',
              background:  'var(--theme-paper-border)',
              zIndex:      0,
            }}
          />

          {JOURNEY_STATUSES.map((status, idx) => {
            const enteredAt = timestamps[status];
            const isActive  = lead.status === status;
            const isPassed  = currentJourneyIdx > idx ||
              (isResolved && enteredAt !== null);
            const isFuture  = !isActive && !isPassed;

            // Dwell time: from entry to next stage entry (or now if active/resolved at this stage)
            let dwellStr: string | null = null;
            if (enteredAt) {
              const nextStatus = JOURNEY_STATUSES[idx + 1];
              const nextAt     = nextStatus ? timestamps[nextStatus] : null;
              const endAt      = nextAt ?? (isActive ? now : null);
              if (endAt) dwellStr = formatDwell(enteredAt, endAt);
            }

            return (
              <div
                key={status}
                style={{
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  gap:            'var(--space-2)',
                  position:       'relative',
                  zIndex:         1,
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width:          '22px',
                    height:         '22px',
                    borderRadius:   'var(--radius-full)',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    background:     isActive
                      ? 'var(--theme-accent)'
                      : isPassed
                        ? 'var(--color-success-light)'
                        : 'var(--theme-paper)',
                    border:         isActive
                      ? '2px solid var(--theme-accent)'
                      : isPassed
                        ? '2px solid var(--color-success)'
                        : '2px solid var(--theme-paper-border)',
                  }}
                >
                  {isPassed ? (
                    <CheckCircle2
                      style={{
                        width:       '14px',
                        height:      '14px',
                        color:       'var(--color-success)',
                        strokeWidth: 2,
                      }}
                    />
                  ) : isActive ? (
                    <div
                      style={{
                        width:        '8px',
                        height:       '8px',
                        borderRadius: 'var(--radius-full)',
                        background:   'var(--theme-accent-fg)',
                      }}
                    />
                  ) : (
                    <Circle
                      style={{
                        width:       '12px',
                        height:      '12px',
                        color:       'var(--theme-paper-border)',
                        strokeWidth: 1.5,
                      }}
                    />
                  )}
                </div>

                {/* Label */}
                <span
                  style={{
                    fontFamily:  'var(--font-sans)',
                    fontSize:    'var(--text-xs)',
                    fontWeight:  isActive ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                    color:       isActive
                      ? 'var(--theme-accent)'
                      : isPassed
                        ? 'var(--theme-text-secondary)'
                        : 'var(--theme-text-tertiary)',
                    textAlign:   'center',
                    letterSpacing: isActive ? 'var(--tracking-wide)' : 'var(--tracking-normal)',
                  }}
                >
                  {LEAD_STATUS_LABELS[status]}
                </span>

                {/* Entry date */}
                {enteredAt && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize:   'var(--text-2xs)',
                      color:      'var(--theme-text-tertiary)',
                      textAlign:  'center',
                    }}
                  >
                    {formatDate(enteredAt)}
                  </span>
                )}

                {/* Dwell badge */}
                {dwellStr && (
                  <span
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      padding:      '0.0625rem var(--space-2)',
                      borderRadius: 'var(--radius-full)',
                      background:   isActive
                        ? 'var(--theme-accent-surface)'
                        : 'var(--theme-paper-subtle)',
                      border: '1px solid var(--theme-paper-border)',
                      fontSize:   'var(--text-2xs)',
                      fontFamily: 'var(--font-mono)',
                      color:      isActive
                        ? 'var(--theme-accent)'
                        : 'var(--theme-text-tertiary)',
                    }}
                  >
                    {dwellStr}
                  </span>
                )}

                {isFuture && (
                  <span
                    style={{
                      fontSize:  'var(--text-2xs)',
                      color:     'var(--theme-text-tertiary)',
                      textAlign: 'center',
                    }}
                  >
                    —
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Local date format helper (avoids importing full formatDate)
// ─────────────────────────────────────────────
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
