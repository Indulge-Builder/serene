'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/Spinner';
import { DatePicker } from '@/components/ui/DatePicker';
import { createWalkInDeal, listAgentsForDealDomain } from '@/lib/actions/deals';
import { GIA_DOMAINS, DOMAIN_LABELS, isGiaDomain, type GiaDomain } from '@/lib/constants/domains';
import {
  DEAL_TYPE_LABELS,
  DEAL_DURATIONS,
  DEAL_DURATION_LABELS,
  DEAL_CATEGORY_OPTIONS,
  DOMAIN_DEAL_CONFIG,
  type DealDuration,
  type DealCategory,
} from '@/lib/constants/deal-types';
import { LEAD_SOURCE_OPTIONS, type LeadSource } from '@/lib/constants/lead-sources';
import type { UserRole, AppDomain } from '@/lib/types/database';

// deal_type is DERIVED from the selected domain — never a free picker.
function dealTypeOf(domain: AppDomain) {
  return isGiaDomain(domain) ? DOMAIN_DEAL_CONFIG[domain as GiaDomain].type : null;
}
function dealCategoriesOf(domain: AppDomain): readonly DealCategory[] | null {
  return isGiaDomain(domain) ? DOMAIN_DEAL_CONFIG[domain as GiaDomain].categories : null;
}

type Props = {
  open:          boolean;
  onClose:       () => void;
  callerRole:    UserRole;
  callerDomain:  AppDomain;
  callerName:    string;
  callerId:      string;
};

type Step = 'contact' | 'deal';

type Agent = { id: string; full_name: string };

export function NewDealModal({
  open,
  onClose,
  callerRole,
  callerDomain,
  callerName,
  callerId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Step
  const [step, setStep] = useState<Step>('contact');

  // Contact fields
  const [contactName,  setContactName]  = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [domain, setDomain] = useState<AppDomain>(
    callerRole === 'agent' || callerRole === 'manager' ? callerDomain : GIA_DOMAINS[0],
  );
  const [assignedTo, setAssignedTo]   = useState<string>(
    callerRole === 'agent' ? callerId : '',
  );
  const [agents, setAgents]           = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Deal fields — deal_type is DERIVED from `domain`, never picked here.
  const [duration,     setDuration]     = useState<DealDuration | null>(null);
  const [category,     setCategory]     = useState<DealCategory | null>(null);
  const [amountStr,    setAmountStr]    = useState('');
  const [wonAt,        setWonAt]        = useState<Date | null>(new Date());
  const [source,       setSource]       = useState<LeadSource | ''>('');

  const [error, setError] = useState<string | null>(null);

  const isManagerPlus =
    callerRole === 'manager' || callerRole === 'admin' || callerRole === 'founder';
  const canPickDomain = callerRole === 'admin' || callerRole === 'founder';

  // Derived from the chosen domain.
  const dealType   = dealTypeOf(domain);
  const categories = dealCategoriesOf(domain);

  async function handleDomainChange(newDomain: AppDomain) {
    setDomain(newDomain);
    setAssignedTo('');
    // Domain drives the type — reset the type-dependent extras on every change.
    setDuration(null);
    setCategory(null);
    setError(null);
    if (isManagerPlus) {
      setLoadingAgents(true);
      const result = await listAgentsForDealDomain(newDomain);
      setAgents(result.data ?? []);
      setLoadingAgents(false);
    }
  }

  // Pre-load agents for the initial domain when modal first mounts (manager+)
  useEffect(() => {
    if (!isManagerPlus) return;
    listAgentsForDealDomain(domain).then((r) => setAgents(r.data ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs once on mount; domain is stable at open time

  function handleNext() {
    setError(null);
    if (!contactName.trim()) { setError('Contact name is required.'); return; }
    if (!contactPhone.trim()) { setError('Phone number is required.'); return; }
    setStep('deal');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!dealType) { setError('Please select a valid domain.'); return; }
    if (dealType === 'membership' && !duration) {
      setError('Please select a membership duration.');
      return;
    }
    if (dealType === 'retail' && !category) {
      setError('Please select a product category.');
      return;
    }

    const amount = parseFloat(amountStr.replace(/,/g, ''));
    if (!amountStr.trim() || isNaN(amount) || amount <= 0) {
      setError('Please enter a valid deal amount.');
      return;
    }
    if (amount > 100_000_000) {
      setError('Amount seems too large. Please verify.');
      return;
    }

    startTransition(async () => {
      // deal_type is intentionally NOT sent — the action derives it from domain.
      const result = await createWalkInDeal({
        contact_name:  contactName.trim(),
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim() || null,
        domain,
        assigned_to:   assignedTo || null,
        won_at:        wonAt ? wonAt.toISOString() : new Date().toISOString(),
        source:        (source as LeadSource) || null,
        deal_duration: dealType === 'membership' ? duration : null,
        deal_category: dealType === 'retail' ? category : null,
        deal_amount:   amount,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
      handleClose();
    });
  }

  function handleClose() {
    setStep('contact');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setDomain(callerRole === 'agent' || callerRole === 'manager' ? callerDomain : GIA_DOMAINS[0]);
    setAssignedTo(callerRole === 'agent' ? callerId : '');
    setDuration(null);
    setCategory(null);
    setAmountStr('');
    setWonAt(new Date());
    setSource('');
    setError(null);
    onClose();
  }

  const labelStyle: React.CSSProperties = {
    display:       'block',
    fontSize:      'var(--text-2xs)',
    fontWeight:    'var(--weight-semibold)',
    letterSpacing: 'var(--tracking-widest)',
    textTransform: 'uppercase',
    color:         'var(--theme-text-tertiary)',
    marginBottom:  'var(--space-2)',
  };

  const inputStyle: React.CSSProperties = {
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
    boxSizing:    'border-box',
    opacity:      isPending ? 0.6 : 1,
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'contact' ? 'New Deal — Contact' : 'New Deal — Details'}
      maxWidth="max-w-md"
      footer={
        step === 'contact' ? (
          <>
            <Button variant="secondary" type="button" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="primary" type="button" onClick={handleNext} disabled={isPending}>
              Next →
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setError(null); setStep('contact'); }}
              disabled={isPending}
              style={{
                display:     'inline-flex',
                alignItems:  'center',
                height:      '2.25rem',
                padding:     '0 var(--space-3)',
                border:      'none',
                background:  'transparent',
                fontFamily:  'var(--font-sans)',
                fontSize:    'var(--text-sm)',
                color:       'var(--theme-text-secondary)',
                cursor:      isPending ? 'not-allowed' : 'pointer',
                opacity:     isPending ? 0.5 : 1,
              }}
            >
              ← Back
            </button>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" type="button" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="new-deal-form"
              disabled={isPending}
              loading={isPending}
            >
              {isPending ? 'Saving…' : 'Record Deal'}
            </Button>
          </>
        )
      }
    >
      {step === 'contact' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Contact name */}
          <div>
            <label style={labelStyle}>
              Name <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => { setContactName(e.target.value); setError(null); }}
              placeholder="Full name"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--theme-paper-border)'; }}
            />
          </div>

          {/* Phone */}
          <div>
            <label style={labelStyle}>
              Phone <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => { setContactPhone(e.target.value); setError(null); }}
              placeholder="+91 98765 43210"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--theme-paper-border)'; }}
            />
          </div>

          {/* Email (optional) */}
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => { setContactEmail(e.target.value); setError(null); }}
              placeholder="optional"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--theme-paper-border)'; }}
            />
          </div>

          {/* Domain — admin/founder only */}
          {canPickDomain && (
            <div>
              <label style={labelStyle}>Domain</label>
              <select
                value={domain}
                onChange={(e) => handleDomainChange(e.target.value as AppDomain)}
                style={selectStyle}
                disabled={isPending}
              >
                {GIA_DOMAINS.map((d) => (
                  <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
                ))}
              </select>
            </div>
          )}

          {/* Agent — manager+ */}
          {isManagerPlus && (
            <div>
              <label style={labelStyle}>Assign to</label>
              {loadingAgents ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', height: '2.5rem' }}>
                  <Spinner size="sm" />
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                    Loading agents…
                  </span>
                </div>
              ) : (
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  style={selectStyle}
                  disabled={isPending || agents.length === 0}
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Agent-role: read-only self chip */}
          {callerRole === 'agent' && (
            <div>
              <label style={labelStyle}>Assign to</label>
              <div
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  padding:      '0 var(--space-3)',
                  height:       '2.5rem',
                  border:       '1px solid var(--theme-paper-border)',
                  borderRadius: 'var(--radius-sm)',
                  background:   'var(--theme-paper-subtle)',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-sm)',
                  color:        'var(--theme-text-secondary)',
                }}
              >
                {callerName}
              </div>
            </div>
          )}

          {error && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
              {error}
            </p>
          )}
        </div>
      ) : (
        <form
          id="new-deal-form"
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
        >
          {/* Deal type — DERIVED from domain, shown read-only (never picked) */}
          <div>
            <p style={{ ...labelStyle, margin: '0 0 var(--space-2) 0' }}>Deal Type</p>
            <div
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          'var(--space-2)',
                padding:      'var(--space-3) var(--space-4)',
                border:       '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-md)',
                background:   'var(--theme-paper-subtle)',
              }}
            >
              <span
                style={{
                  fontSize:   'var(--text-sm)',
                  fontWeight: 'var(--weight-semibold)',
                  color:      'var(--theme-accent)',
                }}
              >
                {dealType ? DEAL_TYPE_LABELS[dealType] : '—'}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                · set by {DOMAIN_LABELS[domain]}
              </span>
            </div>
          </div>

          {/* Category — retail (shop) only */}
          {dealType === 'retail' && categories && (
            <div>
              <p style={{ ...labelStyle, margin: '0 0 var(--space-2) 0' }}>
                Product Category <span style={{ color: 'var(--color-danger)' }}>*</span>
              </p>
              <select
                value={category ?? ''}
                onChange={(e) => { setCategory((e.target.value || null) as DealCategory | null); setError(null); }}
                disabled={isPending}
                style={selectStyle}
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
              <p style={{ ...labelStyle, margin: '0 0 var(--space-3) 0' }}>
                Duration <span style={{ color: 'var(--color-danger)' }}>*</span>
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {DEAL_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setDuration(d); setError(null); }}
                    disabled={isPending}
                    style={{
                      flex:         1,
                      height:       '2.5rem',
                      border:       `1.5px solid ${duration === d ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      background:   duration === d ? 'var(--theme-accent-surface)' : 'var(--theme-paper)',
                      fontFamily:   'var(--font-sans)',
                      fontSize:     'var(--text-sm)',
                      fontWeight:   duration === d ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                      color:        duration === d ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
                      cursor:       'pointer',
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

          {/* Deal date + Source — side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div>
              <p style={{ ...labelStyle, margin: '0 0 var(--space-2) 0' }}>
                Deal Date <span style={{ color: 'var(--color-danger)' }}>*</span>
              </p>
              <DatePicker
                value={wonAt}
                onChange={(d) => { setWonAt(d); setError(null); }}
                maxDate={new Date()}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: 'var(--space-2)' }}>
                Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as LeadSource | '')}
                disabled={isPending}
                style={selectStyle}
              >
                <option value="">— optional —</option>
                {LEAD_SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="new-deal-amount" style={labelStyle}>
              Deal Amount (₹) <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position:     'absolute',
                  left:         'var(--space-3)',
                  top:          '50%',
                  transform:    'translateY(-50%)',
                  fontSize:     'var(--text-sm)',
                  color:        'var(--theme-text-tertiary)',
                  pointerEvents:'none',
                  userSelect:   'none',
                }}
              >
                ₹
              </span>
              <input
                id="new-deal-amount"
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value.replace(/[^0-9.,]/g, ''));
                  setError(null);
                }}
                placeholder="0"
                disabled={isPending}
                style={{
                  ...inputStyle,
                  paddingLeft: 'calc(var(--space-3) + 1.25rem)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--theme-paper-border)'; }}
              />
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
              {error}
            </p>
          )}

          {isPending && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Spinner size="sm" />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                Recording deal…
              </span>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
