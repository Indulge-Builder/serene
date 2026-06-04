import { Activity, Phone, UserCheck, ArrowRight, PlusCircle, Pencil, Copy } from 'lucide-react';
import { LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { getLeadSourceLabel } from '@/lib/constants/lead-sources';
import { formatDate } from '@/lib/utils/dates';
import type { LeadStatus, CallOutcome, AppDomain } from '@/lib/types/database';
import type { LeadActivityWithActor } from '@/lib/services/leads-service';

type Props = {
  activities: LeadActivityWithActor[];
};

function describeActivity(act: LeadActivityWithActor): string {
  switch (act.action_type) {
    case 'lead_created': {
      return 'Lead ingested';
    }
    case 'call_logged': {
      const d = act.details as { outcome?: string } | null;
      const label = d?.outcome
        ? (CALL_OUTCOME_LABELS[d.outcome as CallOutcome] ?? d.outcome)
        : 'Unknown';
      return `Called — ${label}`;
    }
    case 'note_added': {
      const d = act.details as { type?: string; domain?: string; utm_source?: string; source?: string } | null;
      if (d?.type === 'lead_email_updated') return 'Email updated';
      if (d?.type === 'lead_domain_updated') {
        const label = d.domain ? (DOMAIN_LABELS[d.domain as AppDomain] ?? d.domain) : '';
        return label ? `Domain changed to ${label}` : 'Domain updated';
      }
      if (d?.type === 'lead_source_updated' || d?.type === 'lead_utm_source_updated') {
        const raw = d.source ?? d.utm_source;
        const label = raw ? getLeadSourceLabel(raw) : '';
        return label ? `Source changed to ${label}` : 'Source updated';
      }
      // Plain notes are paired with call_logged — skipped at the filter step
      return '';
    }
    case 'duplicate_submission': {
      return 'Duplicate submission detected';
    }
    case 'status_changed': {
      const d = act.details as { old_status?: string; new_status?: string; reason?: string } | null;
      const from = d?.old_status
        ? (LEAD_STATUS_LABELS[d.old_status as LeadStatus] ?? d.old_status)
        : '?';
      const to = d?.new_status
        ? (LEAD_STATUS_LABELS[d.new_status as LeadStatus] ?? d.new_status)
        : '?';
      const reason = d?.reason ? ` — ${d.reason}` : '';
      return `Status: ${from} → ${to}${reason}`;
    }
    case 'agent_assigned': {
      return 'Agent assigned';
    }
    default: {
      return '';
    }
  }
}

function activityIcon(act: LeadActivityWithActor): React.ReactNode {
  const style = { width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 };
  switch (act.action_type) {
    case 'lead_created':        return <PlusCircle  {...style} />;
    case 'call_logged':         return <Phone       {...style} />;
    case 'status_changed':      return <ArrowRight  {...style} />;
    case 'agent_assigned':      return <UserCheck   {...style} />;
    case 'duplicate_submission':return <Copy        {...style} />;
    case 'note_added':          return <Pencil      {...style} />;
    default:                    return <Activity    {...style} />;
  }
}

function formatTimestamp(iso: string): string {
  return formatDate(iso, 'dd MMM yyyy, h:mm a');
}

export function LeadActivityLog({ activities }: Props) {
  // Skip plain note_added rows (they duplicate call_logged).
  // Field-edit note_added rows carry a details.type key — keep those.
  const visible = activities.filter((a) => {
    if (a.action_type !== 'note_added') return true;
    const d = a.details as { type?: string } | null;
    return !!d?.type;
  });

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
        <Activity
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
          Activity History
        </span>
        <span
          style={{
            marginLeft:   'auto',
            fontFamily:   'var(--font-mono)',
            fontSize:     'var(--text-2xs)',
            color:        'var(--theme-text-tertiary)',
          }}
        >
          {visible.length} {visible.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {/* Timeline */}
      {visible.length === 0 ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <p
            style={{
              fontFamily:  'var(--font-serif)',
              fontSize:    'var(--text-base)',
              fontStyle:   'italic',
              color:       'var(--theme-text-tertiary)',
              margin:      0,
            }}
          >
            No activity yet.
          </p>
        </div>
      ) : (
        <ol
          style={{
            listStyle:     'none',
            margin:        0,
            padding:       'var(--space-4) var(--space-5)',
            display:       'flex',
            flexDirection: 'column',
            gap:           0,
          }}
        >
          {visible.map((act, idx) => {
            const description = describeActivity(act);
            const isLast      = idx === visible.length - 1;

            return (
              <li
                key={act.id}
                style={{
                  display:  'flex',
                  gap:      'var(--space-3)',
                  position: 'relative',
                }}
              >
                {/* Vertical line + dot column */}
                <div
                  style={{
                    display:        'flex',
                    flexDirection:  'column',
                    alignItems:     'center',
                    flexShrink:     0,
                    width:          '24px',
                  }}
                >
                  {/* Dot */}
                  <div
                    style={{
                      width:          '24px',
                      height:         '24px',
                      borderRadius:   'var(--radius-full)',
                      background:     'var(--theme-paper-subtle)',
                      border:         '1px solid var(--theme-paper-border)',
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      color:          'var(--theme-text-tertiary)',
                      flexShrink:     0,
                      marginTop:      '2px',
                    }}
                  >
                    {activityIcon(act)}
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div
                      style={{
                        flex:       1,
                        width:      '1px',
                        background: 'var(--theme-paper-border)',
                        minHeight:  'var(--space-5)',
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div
                  style={{
                    paddingBottom: isLast ? 0 : 'var(--space-4)',
                    paddingTop:    '3px',
                    flex:          1,
                    minWidth:      0,
                  }}
                >
                  <p
                    style={{
                      fontFamily:  'var(--font-sans)',
                      fontSize:    'var(--text-sm)',
                      fontWeight:  'var(--weight-medium)',
                      color:       'var(--theme-text-primary)',
                      margin:      0,
                      lineHeight:  'var(--leading-tight)',
                    }}
                  >
                    {description}
                  </p>

                  <div
                    style={{
                      display:    'flex',
                      alignItems: 'center',
                      gap:        'var(--space-2)',
                      marginTop:  'var(--space-1)',
                      flexWrap:   'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize:   'var(--text-2xs)',
                        color:      'var(--theme-text-tertiary)',
                      }}
                    >
                      {formatTimestamp(act.created_at)}
                    </span>

                    {act.actor?.full_name && (
                      <>
                        <span style={{ color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-2xs)' }}>·</span>
                        <span
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize:   'var(--text-2xs)',
                            color:      'var(--theme-text-secondary)',
                          }}
                        >
                          {act.actor.full_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
