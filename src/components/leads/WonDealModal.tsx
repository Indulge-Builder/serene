'use client';

import { useState } from 'react';
import { Trophy, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/Spinner';
import {
  DEAL_TYPES,
  DEAL_TYPE_LABELS,
  DEAL_DURATIONS,
  DEAL_DURATION_LABELS,
  type DealType,
  type DealDuration,
} from '@/lib/constants/deal-types';

type Props = {
  leadId:    string;
  isPending: boolean;
  error:     string | null;
  onClose:   () => void;
  onConfirm: (deal: {
    deal_type:     DealType;
    deal_duration: DealDuration | null;
    deal_amount:   number;
  }) => void;
};

type Step = 'type' | 'details';

export function WonDealModal({ leadId: _leadId, isPending, error, onClose, onConfirm }: Props) {
  const [step, setStep]               = useState<Step>('type');
  const [dealType, setDealType]       = useState<DealType | null>(null);
  const [duration, setDuration]       = useState<DealDuration | null>(null);
  const [amountStr, setAmountStr]     = useState('');
  const [localError, setLocalError]   = useState<string | null>(null);

  function handleTypeSelect(t: DealType) {
    setDealType(t);
    setDuration(null);
    setLocalError(null);
  }

  function handleNext() {
    if (!dealType) {
      setLocalError('Please select a deal type to continue.');
      return;
    }
    setLocalError(null);
    setStep('details');
  }

  function handleBack() {
    setLocalError(null);
    setStep('type');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!dealType) { setLocalError('Please select a deal type.'); return; }

    if (dealType === 'membership' && !duration) {
      setLocalError('Please select a membership duration.');
      return;
    }

    const amount = parseFloat(amountStr.replace(/,/g, ''));
    if (!amountStr.trim() || isNaN(amount) || amount <= 0) {
      setLocalError('Please enter a valid deal amount.');
      return;
    }
    if (amount > 100_000_000) {
      setLocalError('Amount seems too large. Please verify.');
      return;
    }

    onConfirm({ deal_type: dealType, deal_duration: duration, deal_amount: amount });
  }

  const displayError = localError ?? error;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={step === 'type' ? 'Mark as Won — Deal Type' : 'Won — Deal Details'}
      maxWidth="max-w-md"
      footer={
        step === 'type' ? (
          <>
            <Button variant="secondary" type="button" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={handleNext}
              disabled={!dealType || isPending}
              style={{ background: 'var(--color-success)', color: 'var(--theme-text-inverse)' }}
            >
              Next
              <ChevronRight style={{ width: '0.875rem', height: '0.875rem', marginLeft: 'var(--space-1)' }} />
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleBack}
              disabled={isPending}
              style={{
                display:     'inline-flex',
                alignItems:  'center',
                gap:         'var(--space-1)',
                height:      '2.25rem',
                paddingLeft: 'var(--space-3)',
                paddingRight:'var(--space-3)',
                border:      'none',
                background:  'transparent',
                fontFamily:  'var(--font-sans)',
                fontSize:    'var(--text-sm)',
                color:       'var(--theme-text-secondary)',
                cursor:      isPending ? 'not-allowed' : 'pointer',
                opacity:     isPending ? 0.5 : 1,
              }}
            >
              <ChevronLeft style={{ width: '0.875rem', height: '0.875rem' }} />
              Back
            </button>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" type="button" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="won-deal-form"
              disabled={isPending}
              loading={isPending}
              style={{ background: 'var(--color-success)', color: 'var(--theme-text-inverse)' }}
            >
              {isPending ? 'Saving…' : 'Confirm Won'}
            </Button>
          </>
        )
      }
    >
      {step === 'type' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Trophy header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width:        '2.5rem',
                height:       '2.5rem',
                borderRadius: 'var(--radius-full)',
                background:   'var(--color-success-light)',
                display:      'flex',
                alignItems:   'center',
                justifyContent:'center',
                flexShrink:   0,
              }}
            >
              <Trophy style={{ width: '1.125rem', height: '1.125rem', color: 'var(--color-success-text)', strokeWidth: 1.5 }} />
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)', lineHeight: 'var(--leading-normal)', margin: 0 }}>
              Select the type of deal to record before closing this lead as Won.
            </p>
          </div>

          {/* Deal type cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {DEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeSelect(t)}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          'var(--space-3)',
                  padding:      'var(--space-4) var(--space-5)',
                  border:       `1.5px solid ${dealType === t ? 'var(--color-success)' : 'var(--theme-paper-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  background:   dealType === t ? 'var(--color-success-light)' : 'var(--theme-paper)',
                  cursor:       'pointer',
                  textAlign:    'left',
                  transition:   'border-color 0.15s ease, background 0.15s ease',
                  width:        '100%',
                  fontFamily:   'var(--font-sans)',
                }}
              >
                {/* Selection indicator */}
                <span
                  style={{
                    width:        '1.125rem',
                    height:       '1.125rem',
                    borderRadius: 'var(--radius-full)',
                    border:       `2px solid ${dealType === t ? 'var(--color-success)' : 'var(--theme-paper-border)'}`,
                    background:   dealType === t ? 'var(--color-success)' : 'transparent',
                    flexShrink:   0,
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent:'center',
                    transition:   'border-color 0.15s ease, background 0.15s ease',
                  }}
                >
                  {dealType === t && (
                    <span
                      style={{
                        width:        '6px',
                        height:       '6px',
                        borderRadius: 'var(--radius-full)',
                        background:   'var(--theme-text-inverse)',
                      }}
                    />
                  )}
                </span>

                <span>
                  <span
                    style={{
                      display:    'block',
                      fontSize:   'var(--text-sm)',
                      fontWeight: 'var(--weight-semibold)',
                      color:      dealType === t ? 'var(--color-success-text)' : 'var(--theme-text-primary)',
                    }}
                  >
                    {DEAL_TYPE_LABELS[t]}
                  </span>
                  <span
                    style={{
                      display:  'block',
                      fontSize: 'var(--text-xs)',
                      color:    'var(--theme-text-tertiary)',
                      marginTop:'2px',
                    }}
                  >
                    {t === 'membership'
                      ? 'Club or annual membership with a fixed duration'
                      : 'One-time retail purchase or product sale'}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {displayError && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
              {displayError}
            </p>
          )}
        </div>
      ) : (
        <form
          id="won-deal-form"
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
        >
          {/* Deal type recap */}
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          'var(--space-2)',
              padding:      'var(--space-3) var(--space-4)',
              background:   'var(--color-success-light)',
              border:       '1px solid var(--color-success)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Trophy style={{ width: '0.875rem', height: '0.875rem', color: 'var(--color-success-text)', strokeWidth: 1.5, flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-success-text)' }}>
              {dealType ? DEAL_TYPE_LABELS[dealType] : ''}
            </span>
          </div>

          {/* Duration — only for membership */}
          {dealType === 'membership' && (
            <div>
              <p
                style={{
                  fontSize:      'var(--text-2xs)',
                  fontWeight:    'var(--weight-semibold)',
                  letterSpacing: 'var(--tracking-widest)',
                  textTransform: 'uppercase',
                  color:         'var(--theme-text-tertiary)',
                  marginBottom:  'var(--space-3)',
                  margin:        '0 0 var(--space-3) 0',
                }}
              >
                Duration <span style={{ color: 'var(--color-danger)' }}>*</span>
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {DEAL_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setDuration(d); setLocalError(null); }}
                    disabled={isPending}
                    style={{
                      flex:         1,
                      height:       '2.5rem',
                      border:       `1.5px solid ${duration === d ? 'var(--color-success)' : 'var(--theme-paper-border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      background:   duration === d ? 'var(--color-success-light)' : 'var(--theme-paper)',
                      fontFamily:   'var(--font-sans)',
                      fontSize:     'var(--text-sm)',
                      fontWeight:   duration === d ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                      color:        duration === d ? 'var(--color-success-text)' : 'var(--theme-text-primary)',
                      cursor:       isPending ? 'not-allowed' : 'pointer',
                      transition:   'border-color 0.15s ease, background 0.15s ease',
                      whiteSpace:   'nowrap',
                    }}
                  >
                    {DEAL_DURATION_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label
              htmlFor="deal-amount"
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
              Deal Amount (₹) <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position:    'absolute',
                  left:        'var(--space-3)',
                  top:         '50%',
                  transform:   'translateY(-50%)',
                  fontSize:    'var(--text-sm)',
                  color:       'var(--theme-text-tertiary)',
                  pointerEvents:'none',
                  userSelect:  'none',
                }}
              >
                ₹
              </span>
              <input
                id="deal-amount"
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => {
                  // Allow digits, commas, single decimal point
                  const v = e.target.value.replace(/[^0-9.,]/g, '');
                  setAmountStr(v);
                  setLocalError(null);
                }}
                placeholder="0"
                disabled={isPending}
                autoFocus
                style={{
                  width:        '100%',
                  height:       '2.5rem',
                  paddingLeft:  'calc(var(--space-3) + 1.25rem)',
                  paddingRight: 'var(--space-3)',
                  border:       '1px solid var(--theme-paper-border)',
                  borderRadius: 'var(--radius-sm)',
                  background:   'var(--theme-paper)',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-sm)',
                  color:        'var(--theme-text-primary)',
                  outline:      'none',
                  boxSizing:    'border-box',
                  opacity:      isPending ? 0.6 : 1,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--theme-paper-border)'; }}
              />
            </div>
          </div>

          {displayError && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
              {displayError}
            </p>
          )}

          {isPending && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Spinner size="sm" />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                Recording deal and closing lead…
              </span>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
