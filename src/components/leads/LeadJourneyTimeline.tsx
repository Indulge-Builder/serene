import { CheckCircle2, Circle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/lib/constants/lead-statuses';
import { formatDate } from '@/lib/utils/dates';
import type { Lead, LeadStatus } from '@/lib/types/database';
import type { LeadActivityWithActor } from '@/lib/services/leads-service';

type Props = {
  lead: Lead;
  activities: LeadActivityWithActor[];
};

// The core progression stages — always shown
const CORE_STAGES: LeadStatus[] = ['new', 'touched', 'in_discussion'];

// Terminal outcomes — shown as the final stage replacing "won"
const TERMINAL_OUTCOMES: LeadStatus[] = ['won', 'lost', 'junk', 'nurturing'];

function getTerminalConfig(status: LeadStatus) {
  const c = LEAD_STATUS_COLORS[status];
  if (!c) return null;
  const icon = status === 'won' ? 'check' : status === 'nurturing' ? 'alert' : 'x';
  return { bg: c.light, border: c.border, text: c.text, icon };
}

function buildStatusTimestamps(
  lead: Lead,
  activities: LeadActivityWithActor[],
): Record<string, Date | null> {
  const map: Record<string, Date | null> = {
    new:           new Date(lead.created_at),
    touched:       null,
    in_discussion: null,
    won:           null,
    lost:          null,
    junk:          null,
    nurturing:     null,
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

function formatDwell(from: Date, to: Date, isActive: boolean): string | null {
  const ms      = to.getTime() - from.getTime();
  const minutes = Math.floor(ms / 60_000);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);

  let duration: string;
  if (days >= 1)        duration = `${days}d`;
  else if (hours >= 1)  duration = `${hours}h`;
  else if (minutes >= 1) duration = `${minutes}m`;
  else return null;

  return isActive ? `${duration} here` : duration;
}

export function LeadJourneyTimeline({ lead, activities }: Props) {
  const timestamps = buildStatusTimestamps(lead, activities);
  const now        = new Date();

  const isTerminal   = (TERMINAL_OUTCOMES as string[]).includes(lead.status);
  const terminalConf = isTerminal ? getTerminalConfig(lead.status as LeadStatus) : null;

  // Build the visible stages: always core + the terminal outcome if reached (or still progressing to won)
  const terminalStatus: LeadStatus = isTerminal ? (lead.status as LeadStatus) : 'won';
  const stages: LeadStatus[] = [...CORE_STAGES, terminalStatus];

  // Index of how far the lead has progressed through CORE_STAGES
  const coreIdx = CORE_STAGES.indexOf(lead.status as LeadStatus);

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

        {/* Terminal outcome badge */}
        {isTerminal && terminalConf && (
          <span
            style={{
              marginLeft:   'auto',
              display:      'inline-flex',
              alignItems:   'center',
              padding:      '0.125rem var(--space-2)',
              borderRadius: 'var(--radius-full)',
              background:   terminalConf.bg,
              color:        terminalConf.text,
              fontSize:     'var(--text-xs)',
              fontWeight:   'var(--weight-medium)',
            }}
          >
            {LEAD_STATUS_LABELS[lead.status as LeadStatus]}
          </span>
        )}
      </div>

      {/* Stages */}
      <div style={{ padding: 'var(--space-6) var(--space-5)' }}>
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: `repeat(${stages.length}, 1fr)`,
            gap:                 'var(--space-2)',
            position:            'relative',
          }}
        >
          {/* Connector line */}
          <div
            style={{
              position:   'absolute',
              top:        '10px',
              left:       `calc(50% / ${stages.length})`,
              right:      `calc(50% / ${stages.length})`,
              height:     '2px',
              background: 'var(--theme-paper-border)',
              zIndex:     0,
            }}
          />

          {stages.map((status, idx) => {
            const enteredAt  = timestamps[status];
            const isActive   = lead.status === status;
            const isLastStage = idx === stages.length - 1;

            // A core stage is "passed" if the lead has moved beyond it
            const corePassed = idx < CORE_STAGES.length && (
              coreIdx > idx || isTerminal
            );

            // The terminal stage is "passed" only if the lead IS that status
            const terminalPassed = isLastStage && isTerminal;

            const isPassed = corePassed || terminalPassed;
            const isFuture = !isActive && !isPassed;

            const isTerminalStage = isLastStage;
            const termInfo = isTerminalStage ? getTerminalConfig(terminalStatus) : null;

            // Dwell: from entry to next stage (or now if active)
            let dwellStr: string | null = null;
            if (enteredAt) {
              const nextStatus = stages[idx + 1];
              const nextAt     = nextStatus ? timestamps[nextStatus] : null;
              const endAt      = nextAt ?? (isActive ? now : (isTerminal && isLastStage ? now : null));
              if (endAt) dwellStr = formatDwell(enteredAt, endAt, isActive);
            }

            // Colours for this node
            const nodeColors = (() => {
              if (isActive && isTerminalStage && termInfo) {
                return {
                  bg:     termInfo.bg,
                  border: `2px solid ${termInfo.border}`,
                  dot:    termInfo.text,
                };
              }
              if (isActive) {
                return {
                  bg:     'var(--theme-accent)',
                  border: '2px solid var(--theme-accent)',
                  dot:    'var(--theme-accent-fg)',
                };
              }
              if (isPassed && isTerminalStage && termInfo) {
                return {
                  bg:     termInfo.bg,
                  border: `2px solid ${termInfo.border}`,
                  dot:    null,
                };
              }
              if (isPassed) {
                return {
                  bg:     'var(--color-success-light)',
                  border: '2px solid var(--color-success)',
                  dot:    null,
                };
              }
              return {
                bg:     'var(--theme-paper)',
                border: '2px solid var(--theme-paper-border)',
                dot:    null,
              };
            })();

            const labelColor = (() => {
              if (isActive && isTerminalStage && termInfo) return termInfo.text;
              if (isActive) return 'var(--theme-accent)';
              if (isPassed) return 'var(--theme-text-secondary)';
              return 'var(--theme-text-tertiary)';
            })();

            return (
              // eia-row-enter: the journey unfolds left → right (60ms steps;
              // server-component-safe CSS stagger, same utility as table rows)
              <div
                key={status}
                className="eia-row-enter"
                style={{
                  display:       'flex',
                  flexDirection: 'column',
                  alignItems:    'center',
                  gap:           'var(--space-2)',
                  position:      'relative',
                  zIndex:        1,
                  animationDelay: `${idx * 60}ms`,
                }}
              >
                {/* Node icon */}
                <div
                  style={{
                    width:          '22px',
                    height:         '22px',
                    borderRadius:   'var(--radius-full)',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    background:     nodeColors.bg,
                    border:         nodeColors.border,
                  }}
                >
                  {isPassed && isTerminalStage && termInfo?.icon === 'x' ? (
                    <XCircle
                      style={{ width: '14px', height: '14px', color: termInfo.text, strokeWidth: 2 }}
                    />
                  ) : isPassed && isTerminalStage && termInfo?.icon === 'alert' ? (
                    <AlertCircle
                      style={{ width: '14px', height: '14px', color: termInfo.text, strokeWidth: 2 }}
                    />
                  ) : isPassed && isTerminalStage && termInfo?.icon === 'check' ? (
                    <CheckCircle2
                      style={{ width: '14px', height: '14px', color: termInfo.text, strokeWidth: 2 }}
                    />
                  ) : isPassed ? (
                    <CheckCircle2
                      style={{ width: '14px', height: '14px', color: 'var(--color-success)', strokeWidth: 2 }}
                    />
                  ) : isActive ? (
                    <div
                      style={{
                        width:        '8px',
                        height:       '8px',
                        borderRadius: 'var(--radius-full)',
                        background:   isTerminalStage && termInfo ? termInfo.text : 'var(--theme-accent-fg)',
                      }}
                    />
                  ) : (
                    <Circle
                      style={{ width: '12px', height: '12px', color: 'var(--theme-paper-border)', strokeWidth: 1.5 }}
                    />
                  )}
                </div>

                {/* Label */}
                <span
                  style={{
                    fontFamily:    'var(--font-sans)',
                    fontSize:      'var(--text-xs)',
                    fontWeight:    isActive ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                    color:         labelColor,
                    textAlign:     'center',
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
                    {formatLocalDate(enteredAt)}
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
                      background:   isActive && termInfo
                        ? termInfo.bg
                        : isActive
                          ? 'var(--theme-accent-surface)'
                          : 'var(--theme-paper-subtle)',
                      border:    '1px solid var(--theme-paper-border)',
                      fontSize:  'var(--text-2xs)',
                      fontFamily:'var(--font-mono)',
                      color:     isActive && termInfo
                        ? termInfo.text
                        : isActive
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

function formatLocalDate(date: Date): string {
  return formatDate(date, 'd MMM');
}
