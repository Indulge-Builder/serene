import { Activity, Phone, UserCheck, ArrowRight, PlusCircle, Pencil, Copy, Bot } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
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
      // The identity rule (0251): a same-domain twin folded into this lead, or a lead
      // made now for an enquiry that an older build filed under another domain.
      if (d?.type === 'duplicate_lead_archived') return 'A duplicate of this lead was folded in';
      if (d?.type === 'lead_rescued') {
        const label = d.domain ? (DOMAIN_LABELS[d.domain as AppDomain] ?? d.domain) : '';
        return label ? `Recovered: first filed under ${label}` : 'Recovered from an earlier enquiry';
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
    case 'concierge_brief': {
      // The public bot's hand-over (0252): the brief for the person who calls.
      const d = act.details as { reason_label?: string; promised?: string | null } | null;
      return d?.promised ? 'Indulge concierge: brief for the call' : `Indulge concierge: ${(d?.reason_label ?? 'handed over').toLowerCase()}`;
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
    case 'concierge_brief':     return <Bot         {...style} />;
    default:                    return <Activity    {...style} />;
  }
}

/** The concierge's brief, as the agent reads it before the call (0252). */
function ConciergeBrief({ details }: { details: unknown }) {
  const d = (details ?? {}) as {
    summary?: string;
    in_their_words?: string | null;
    interests?: string[];
    sent?: string[];
    promised?: string | null;
    next_step?: string | null;
  };
  const rows: [string, string][] = [
    ['Summary', d.summary ?? ''],
    ['In their words', d.in_their_words ?? ''],
    ['Interested in', (d.interests ?? []).join(', ')],
    ['Already sent', (d.sent ?? []).join(', ')],
    ['Promised', d.promised ?? ''],
    ['Next step', d.next_step ?? ''],
  ].filter(([, v]) => v.trim().length > 0) as [string, string][];
  if (rows.length === 0) return null;
  return (
    <dl
      style={{
        margin: 'var(--space-2) 0 0', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
        background: 'var(--theme-paper-subtle)', display: 'grid', gap: 'var(--space-2)',
      }}
    >
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="label-micro" style={{ margin: 0 }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', whiteSpace: 'pre-wrap' }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
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
        borderRadius: 'var(--neu-radius-card)',
        boxShadow:    'var(--shadow-1)',
        overflow:     'hidden',
      }}
    >
      {/* Header */}
      <CardHeader
        icon={Activity}
        label="Activity History"
        right={
          <span
            style={{
              marginLeft:   'auto',
              fontFamily:   'var(--font-mono)',
              fontSize:     'var(--text-xs)',
              color:        'var(--theme-text-tertiary)',
            }}
          >
            {visible.length} {visible.length === 1 ? 'event' : 'events'}
          </span>
        }
      />

      {/* Timeline */}
      {visible.length === 0 ? (
        <EmptyState title="No activity yet." description="Status changes, calls, notes and assignments appear here as they happen." />
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
                  {act.action_type === 'concierge_brief' && <ConciergeBrief details={act.details} />}

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
                        fontSize:   'var(--text-xs)',
                        color:      'var(--theme-text-tertiary)',
                      }}
                    >
                      {formatTimestamp(act.created_at)}
                    </span>

                    {act.actor?.full_name && (
                      <>
                        <span style={{ color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-xs)' }}>·</span>
                        <span
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize:   'var(--text-xs)',
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
