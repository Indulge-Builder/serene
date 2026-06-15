'use client';

import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/Spinner';
import { isGiaDomain, type GiaDomain, DOMAIN_LABELS } from '@/lib/constants/domains';
import {
  DEAL_TYPE_LABELS,
  DEAL_DURATIONS,
  DEAL_DURATION_LABELS,
  DEAL_CATEGORY_OPTIONS,
  DOMAIN_DEAL_CONFIG,
  type DealDuration,
  type DealCategory,
} from '@/lib/constants/deal-types';
import type { AppDomain } from '@/lib/types/database';

type Props = {
  open:      boolean;
  leadId:    string;
  // The lead's domain — deal_type is DERIVED from it (never picked). The server
  // re-derives identically in recordDeal; this only shapes the form fields.
  domain:    AppDomain;
  isPending: boolean;
  error:     string | null;
  onClose:   () => void;
  onConfirm: (deal: {
    deal_duration: DealDuration | null;
    deal_category: DealCategory | null;
    deal_amount:   number;
  }) => void;
};

export function WonDealModal({ open, leadId: _leadId, domain, isPending, error, onClose, onConfirm }: Props) {
  const [duration, setDuration]     = useState<DealDuration | null>(null);
  const [category, setCategory]     = useState<DealCategory | null>(null);
  const [amountStr, setAmountStr]   = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // deal_type + valid categories derive from the lead's domain.
  const dealType   = isGiaDomain(domain) ? DOMAIN_DEAL_CONFIG[domain as GiaDomain].type : null;
  const categories = isGiaDomain(domain) ? DOMAIN_DEAL_CONFIG[domain as GiaDomain].categories : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!dealType) { setLocalError('This lead’s domain cannot record a deal.'); return; }
    if (dealType === 'membership' && !duration) {
      setLocalError('Please select a membership duration.');
      return;
    }
    if (dealType === 'retail' && !category) {
      setLocalError('Please select a product category.');
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

    onConfirm({
      deal_duration: dealType === 'membership' ? duration : null,
      deal_category: dealType === 'retail' ? category : null,
      deal_amount:   amount,
    });
  }

  const displayError = localError ?? error;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as Won — Deal Details"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="won-deal-form"
            disabled={isPending}
            loading={isPending}
            style={{ background: 'var(--color-success)', color: 'var(--color-success-fg)' }}
          >
            {isPending ? 'Saving…' : 'Confirm Won'}
          </Button>
        </>
      }
    >
      <form
        id="won-deal-form"
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
      >
        {/* Derived deal-type recap — set by the lead's domain, not picked */}
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
            {dealType ? DEAL_TYPE_LABELS[dealType] : '—'}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success-text)', opacity: 0.75 }}>
            · {DOMAIN_LABELS[domain]}
          </span>
        </div>

        {/* Category — retail (shop) only */}
        {dealType === 'retail' && categories && (
          <div>
            <p
              style={{
                fontSize:      'var(--text-2xs)',
                fontWeight:    'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-widest)',
                textTransform: 'uppercase',
                color:         'var(--theme-text-tertiary)',
                margin:        '0 0 var(--space-2) 0',
              }}
            >
              Product Category <span style={{ color: 'var(--color-danger)' }}>*</span>
            </p>
            <select
              value={category ?? ''}
              onChange={(e) => { setCategory((e.target.value || null) as DealCategory | null); setLocalError(null); }}
              disabled={isPending}
              style={{
                width:        '100%',
                height:       '2.5rem',
                padding:      '0 var(--space-3)',
                border:       '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-sm)',
                background:   'var(--theme-paper)',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-sm)',
                color:        'var(--theme-text-primary)',
                outline:      'none',
                cursor:       'pointer',
                boxSizing:    'border-box',
                opacity:      isPending ? 0.6 : 1,
              }}
            >
              <option value="">— select —</option>
              {DEAL_CATEGORY_OPTIONS.filter((opt) => categories.includes(opt.id)).map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Duration — membership only */}
        {dealType === 'membership' && (
          <div>
            <p
              style={{
                fontSize:      'var(--text-2xs)',
                fontWeight:    'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-widest)',
                textTransform: 'uppercase',
                color:         'var(--theme-text-tertiary)',
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
    </Modal>
  );
}
