'use client';

import { useState, useTransition } from 'react';
import { Phone, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import { addLeadCallNote } from '@/lib/actions/leads';
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { formErrors } from '@/lib/validations/form-errors';
import { Modal } from '@/components/ui/modal';
import type { CallOutcome } from '@/lib/types/database';

type Props = {
  leadId: string;
  onClose: () => void;
};

export function CalledModal({ leadId, onClose }: Props) {
  const router                           = useRouter();
  const [isPending, startTransition]     = useTransition();
  const [outcome, setOutcome]            = useState<CallOutcome | ''>('');
  const [note, setNote]                  = useState('');
  const [error, setError]                = useState<string | null>(null);

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
    <Modal
      open={true}
      onClose={onClose}
      title="Log a call"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="called-modal-form"
            disabled={isPending}
            loading={isPending}
            style={{ boxShadow: 'var(--shadow-accent-glow)' }}
          >
            {isPending ? 'Saving…' : 'Save call'}
          </Button>
        </>
      }
    >
      <form id="called-modal-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

        {/* Phone icon row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Phone
            style={{
              width:       '1rem',
              height:      '1rem',
              color:       'var(--theme-accent)',
              strokeWidth: 1.5,
              flexShrink:  0,
            }}
          />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>
            Record what happened on this call.
          </span>
        </div>

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
                border:       '1px solid var(--theme-paper-border)',
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
      </form>
    </Modal>
  );
}
