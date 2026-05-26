'use client';

import { useRef, useState, useTransition } from 'react';
import { X, Loader2, Phone, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { addLeadCallNote } from '@/lib/actions/leads';
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { formErrors } from '@/lib/validations/form-errors';
import type { CallOutcome } from '@/lib/types/database';

type Props = {
  leadId: string;
  onClose: () => void;
};

export function CalledModal({ leadId, onClose }: Props) {
  const router              = useRouter();
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome]   = useState<CallOutcome | ''>('');
  const [note, setNote]         = useState('');
  const [error, setError]       = useState<string | null>(null);
  const backdropRef             = useRef<HTMLDivElement>(null);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!outcome) {
      setError('Please select a call outcome.');
      return;
    }
    if (!note.trim()) {
      setError(formErrors.required);
      return;
    }

    startTransition(async () => {
      const result = await addLeadCallNote({
        leadId,
        content:     note,
        callOutcome: outcome as CallOutcome,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
      onClose();
    });
  }

  return (
    // Backdrop
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(0,0,0,0.5)',
        zIndex:          'var(--z-overlay)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         'var(--space-4)',
      }}
    >
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="called-modal-title"
        style={{
          background:   'var(--theme-paper)',
          borderRadius: 'var(--radius-lg)',
          boxShadow:    'var(--shadow-3)',
          width:        '100%',
          maxWidth:     '480px',
          zIndex:       'var(--z-modal)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-3)',
            padding:      'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--theme-paper-border)',
            background:   'var(--theme-paper-subtle)',
            borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          }}
        >
          <Phone
            style={{
              width:       '1rem',
              height:      '1rem',
              color:       'var(--theme-accent)',
              strokeWidth: 1.5,
              flexShrink:  0,
            }}
          />
          <h2
            id="called-modal-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-base)',
              fontWeight: 'var(--weight-semibold)',
              color:      'var(--theme-text-primary)',
              margin:     0,
            }}
          >
            Log a call
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft:     'auto',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              width:          '1.75rem',
              height:         '1.75rem',
              border:         '1px solid var(--theme-paper-border)',
              borderRadius:   'var(--radius-sm)',
              background:     'transparent',
              color:          'var(--theme-text-tertiary)',
              cursor:         'pointer',
              transition:     'var(--transition-hover)',
              flexShrink:     0,
            }}
          >
            <X style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

            {/* Call outcome */}
            <div>
              <label
                htmlFor="call-outcome"
                style={{
                  display:       'block',
                  fontSize:      'var(--text-2xs)',
                  fontWeight:    'var(--weight-semibold)',
                  letterSpacing: 'var(--tracking-widest)',
                  textTransform: 'uppercase',
                  color:         'var(--theme-text-tertiary)',
                  marginBottom:  'var(--space-2)',
                }}
              >
                Call outcome <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  id="call-outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as CallOutcome | '')}
                  disabled={isPending}
                  style={{
                    width:        '100%',
                    height:       '2.25rem',
                    paddingLeft:  'var(--space-3)',
                    paddingRight: 'var(--space-8)',
                    border:       `1px solid ${outcome ? 'var(--theme-paper-border)' : 'var(--theme-paper-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    background:   'var(--theme-paper-subtle)',
                    fontSize:     'var(--text-sm)',
                    color:        outcome ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
                    appearance:   'none',
                    cursor:       isPending ? 'not-allowed' : 'pointer',
                    outline:      'none',
                    transition:   'var(--transition-hover)',
                  }}
                >
                  <option value="" disabled>Select outcome…</option>
                  {CALL_OUTCOMES.map((o) => (
                    <option key={o} value={o}>{CALL_OUTCOME_LABELS[o]}</option>
                  ))}
                </select>
                <ChevronDown
                  style={{
                    position:      'absolute',
                    right:         'var(--space-3)',
                    top:           '50%',
                    transform:     'translateY(-50%)',
                    width:         '0.875rem',
                    height:        '0.875rem',
                    color:         'var(--theme-text-tertiary)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label
                htmlFor="call-note"
                style={{
                  display:       'block',
                  fontSize:      'var(--text-2xs)',
                  fontWeight:    'var(--weight-semibold)',
                  letterSpacing: 'var(--tracking-widest)',
                  textTransform: 'uppercase',
                  color:         'var(--theme-text-tertiary)',
                  marginBottom:  'var(--space-2)',
                }}
              >
                Note <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <textarea
                id="call-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened on this call? What did you discuss?"
                disabled={isPending}
                rows={4}
                style={{
                  width:        '100%',
                  padding:      'var(--space-3)',
                  border:       '1px solid var(--theme-paper-border)',
                  borderRadius: 'var(--radius-sm)',
                  background:   'var(--theme-paper)',
                  fontSize:     'var(--text-sm)',
                  color:        'var(--theme-text-primary)',
                  lineHeight:   'var(--leading-relaxed)',
                  resize:       'vertical',
                  outline:      'none',
                  transition:   'var(--transition-hover)',
                  boxSizing:    'border-box',
                  fontFamily:   'var(--font-sans)',
                  opacity:      isPending ? 0.6 : 1,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--theme-accent)';
                  e.currentTarget.style.boxShadow   = 'var(--shadow-focus)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--theme-paper-border)';
                  e.currentTarget.style.boxShadow   = 'none';
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display:       'flex',
              justifyContent:'flex-end',
              gap:           'var(--space-3)',
              padding:       'var(--space-4) var(--space-6)',
              borderTop:     '1px solid var(--theme-paper-border)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              style={{
                height:       '2.25rem',
                paddingLeft:  'var(--space-4)',
                paddingRight: 'var(--space-4)',
                border:       '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-sm)',
                background:   'var(--theme-paper-subtle)',
                fontSize:     'var(--text-sm)',
                fontWeight:   'var(--weight-medium)',
                color:        'var(--theme-text-primary)',
                cursor:       isPending ? 'not-allowed' : 'pointer',
                opacity:      isPending ? 0.6 : 1,
                transition:   'var(--transition-interactive)',
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isPending}
              style={{
                display:        'inline-flex',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            'var(--space-2)',
                height:         '2.25rem',
                paddingLeft:    'var(--space-4)',
                paddingRight:   'var(--space-4)',
                border:         'none',
                borderRadius:   'var(--radius-sm)',
                background:     'var(--theme-accent)',
                fontSize:       'var(--text-sm)',
                fontWeight:     'var(--weight-medium)',
                color:          'var(--theme-accent-fg)',
                cursor:         isPending ? 'not-allowed' : 'pointer',
                opacity:        isPending ? 0.7 : 1,
                transition:     'var(--transition-interactive)',
                boxShadow:      'var(--shadow-accent-glow)',
              }}
            >
              {isPending && (
                <Loader2 style={{ width: '0.875rem', height: '0.875rem', animation: 'eia-spin 1s linear infinite' }} />
              )}
              {isPending ? 'Saving…' : 'Save call'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
