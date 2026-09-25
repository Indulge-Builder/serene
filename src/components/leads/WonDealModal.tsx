'use client';

import { Field, Input, Select } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { SelectionButton } from '@/components/ui/SelectionButton';
import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/modal';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
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
    if (isPending) return;
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

    const amount = Number(amountStr.replace(/,/g, ''));
    if (!amountStr.trim() || !Number.isFinite(amount) || amount <= 0) {
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
      pending={isPending}
      onClose={onClose}
      title="Mark as Won — Deal Details"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="success"
            type="submit"
            form="won-deal-form"
            disabled={isPending}
            loading={isPending}
          >
            {isPending ? 'Saving…' : 'Confirm Won'}
          </Button>
        </>
      }
    >
      <form
        id="won-deal-form"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isPending}
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
            border:       '1px solid var(--neu-edge)',
            boxShadow:    'var(--neu-shadow-chip)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Trophy style={{ width: '0.875rem', height: '0.875rem', color: 'var(--color-success-text)', strokeWidth: 1.5, flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-success-text)' }}>
            {dealType ? DEAL_TYPE_LABELS[dealType] : '—'}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success-text)' }}>
            · {DOMAIN_LABELS[domain]}
          </span>
        </div>

        {/* Category — retail (shop) only */}
        {dealType === 'retail' && categories && (
          <Field htmlFor="deal-category" label="Product category" required>
            <Select
              value={category ?? ''}
              onChange={(e) => { setCategory((e.target.value || null) as DealCategory | null); setLocalError(null); }}
              disabled={isPending}
            >
              <option value="">— select —</option>
              {DEAL_CATEGORY_OPTIONS.filter((opt) => categories.includes(opt.id)).map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </Select>
          </Field>
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
              Duration <span style={{ color: "var(--color-danger-text)" }}>*</span>
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {DEAL_DURATIONS.map((d) => (
                <SelectionButton
                  tone={{ fill: 'var(--color-success-light)', ink: 'var(--color-success-text)' }}
                  appearance="choice"
                  selected={duration === d}
                  aria-pressed={duration === d}
                  key={d}
                  type="button"
                  onClick={() => { setDuration(d); setLocalError(null); }}
                  disabled={isPending}
                  style={{
                          flex: 1,
                          height: '2.5rem',
                          fontSize: 'var(--text-sm)',
                          whiteSpace: 'nowrap',
                      }}
                >
                  {DEAL_DURATION_LABELS[d]}
                </SelectionButton>
              ))}
            </div>
          </div>
        )}

        {/* Amount */}
        <Field htmlFor="deal-amount" label="Deal amount (₹)" required>
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
            <Input
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
              style={{ paddingLeft: 'calc(var(--space-3) + 1.25rem)' }}
            />
          </div>
        </Field>

        {displayError && (
          <Alert tone="danger">{displayError}</Alert>
        )}

        {isPending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <LogoSpinner size="sm" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
              Recording deal and closing lead…
            </span>
          </div>
        )}
      </form>
    </Modal>
  );
}
