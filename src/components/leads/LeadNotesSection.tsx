import { MessageSquare } from 'lucide-react';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { formatDate } from '@/lib/utils/dates';
import type { LeadNoteWithAuthor } from '@/lib/services/leads-service';

const OUTCOME_BADGE: Record<string, { bg: string; text: string }> = {
  rnr:          { bg: 'var(--color-warning-light)',  text: 'var(--color-warning-text)'  },
  switched_off: { bg: 'var(--color-warning-light)',  text: 'var(--color-warning-text)'  },
  wrong_number: { bg: 'var(--color-danger-light)',   text: 'var(--color-danger-text)'   },
  conversing:   { bg: 'var(--color-success-light)',  text: 'var(--color-success-text)'  },
  other:        { bg: 'var(--color-neutral-light)',  text: 'var(--color-neutral-text)'  },
};

type Props = {
  notes: LeadNoteWithAuthor[];
};

export function LeadNotesSection({ notes }: Props) {
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
        <MessageSquare
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
          Notes
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize:   'var(--text-xs)',
            color:      'var(--theme-text-tertiary)',
          }}
        >
          {notes.length} note{notes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Timeline */}
      {notes.length === 0 ? (
        <div style={{ padding: 'var(--space-12) var(--space-6)', textAlign: 'center' }}>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize:   'var(--text-lg)',
              fontStyle:  'italic',
              color:      'var(--theme-text-tertiary)',
              margin:     0,
            }}
          >
            No calls logged yet.
          </p>
          <p
            style={{
              marginTop: 'var(--space-2)',
              fontSize:  'var(--text-sm)',
              color:     'var(--theme-text-tertiary)',
            }}
          >
            Use the Called button to log your first call.
          </p>
        </div>
      ) : (
        <div style={{ padding: 'var(--space-5)' }}>
          <div
            style={{
              position:    'relative',
              paddingLeft: 'var(--space-6)',
            }}
          >
            {/* Vertical line */}
            <div
              style={{
                position:    'absolute',
                left:        '7px',
                top:         '8px',
                bottom:      '8px',
                width:       '1px',
                background:  'var(--theme-paper-border)',
              }}
            />

            {/* Notes */}
            {notes.map((note, idx) => {
              const outcomeBadge = note.call_outcome ? OUTCOME_BADGE[note.call_outcome] : null;
              return (
                <div
                  key={note.id}
                  style={{
                    position:     'relative',
                    paddingBottom: idx === notes.length - 1 ? 0 : 'var(--space-5)',
                  }}
                >
                  {/* Dot */}
                  <div
                    style={{
                      position:     'absolute',
                      left:         '-var(--space-6)',
                      top:          '6px',
                      width:        '15px',
                      height:       '15px',
                      borderRadius: 'var(--radius-full)',
                      background:   'var(--theme-paper)',
                      border:       '2px solid var(--theme-paper-border)',
                      marginLeft:   '-22px',
                    }}
                  />

                  {/* Note card */}
                  <div
                    style={{
                      background:   'var(--theme-paper-subtle)',
                      border:       '1px solid var(--theme-paper-border)',
                      borderRadius: 'var(--radius-md)',
                      overflow:     'hidden',
                    }}
                  >
                    {/* Note header */}
                    <div
                      style={{
                        display:      'flex',
                        alignItems:   'center',
                        gap:          'var(--space-2)',
                        padding:      'var(--space-3) var(--space-4)',
                        borderBottom: '1px solid var(--theme-paper-border)',
                        flexWrap:     'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize:   'var(--text-xs)',
                          fontWeight: 'var(--weight-medium)',
                          color:      'var(--theme-text-secondary)',
                        }}
                      >
                        {note.author.full_name}
                      </span>

                      {outcomeBadge && note.call_outcome && (
                        <span
                          style={{
                            display:      'inline-flex',
                            alignItems:   'center',
                            padding:      '0.0625rem var(--space-2)',
                            borderRadius: 'var(--radius-full)',
                            background:   outcomeBadge.bg,
                            color:        outcomeBadge.text,
                            fontSize:     'var(--text-xs)',
                            fontWeight:   'var(--weight-medium)',
                          }}
                        >
                          {CALL_OUTCOME_LABELS[note.call_outcome]}
                        </span>
                      )}

                      <span
                        style={{
                          marginLeft: 'auto',
                          fontFamily: 'var(--font-mono)',
                          fontSize:   'var(--text-xs)',
                          color:      'var(--theme-text-tertiary)',
                        }}
                      >
                        {formatDate(note.created_at, 'dd MMM yyyy, hh:mm a')}
                      </span>
                    </div>

                    {/* Note content */}
                    <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <p
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize:   'var(--text-sm)',
                          color:      'var(--theme-text-primary)',
                          lineHeight: 'var(--leading-relaxed)',
                          margin:     0,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {note.content}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
