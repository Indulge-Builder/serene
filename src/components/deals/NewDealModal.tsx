'use client';

import { Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { SelectionButton } from '@/components/ui/SelectionButton';
import { useState, useEffect, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/modal';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
import { DatePicker } from '@/components/ui/DatePicker';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { createWalkInDeal, listAgentsForDealDomain } from '@/lib/actions/deals';
import { DEAL_CELEBRATE_STORAGE_KEY } from '@/components/deals/DealCard';
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

  // FilterDropdown item lists + trigger labels (themed single-select — never a native <select>)
  const domainItems = useMemo(
    () => GIA_DOMAINS.map((d) => ({ id: d, label: DOMAIN_LABELS[d] })),
    [],
  );
  const agentItems = useMemo(
    () => agents.map((a) => ({ id: a.id, label: a.full_name })),
    [agents],
  );
  const categoryItems = useMemo(
    () =>
      categories
        ? DEAL_CATEGORY_OPTIONS.filter((opt) => categories.includes(opt.id))
        : [],
    [categories],
  );

  const assigneeLabel =
    agents.find((a) => a.id === assignedTo)?.full_name ?? 'Unassigned';
  const categoryLabel =
    categoryItems.find((opt) => opt.id === category)?.label ?? 'Select category…';
  const sourceLabel =
    LEAD_SOURCE_OPTIONS.find((opt) => opt.id === source)?.label ?? 'Optional';

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
    if (isPending) return;
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

    const amount = Number(amountStr.replace(/,/g, ''));
    if (!amountStr.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Please enter a valid deal amount.');
      return;
    }
    if (amount > 100_000_000) {
      setError('Amount seems too large. Please verify.');
      return;
    }

    startTransition(async () => {
      try {
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

        if (result.error || !result.data?.dealId) {
          setError(result.error ?? "The deal could not be saved. Your entries are still here.");
          return;
        }

        // Stamp the new deal for the one-shot Won petal fall — the freshly
        // rendered DealCard claims it after router.refresh() (polish §03).
        if (result.data?.dealId) {
          try {
            sessionStorage.setItem(DEAL_CELEBRATE_STORAGE_KEY, result.data.dealId);
          } catch {
            // decorative only — never block the save on storage
          }
        }

        // Close first, THEN refresh. router.refresh() refetches the current
        // route's RSC payload; if it is fired right before handleClose()
        // unmounts the modal inside the SAME transition, the refetch is
        // deprioritised against the teardown and frequently discarded — so the
        // new deal doesn't appear until the Client Router Cache expires. Closing
        // first lets the refresh run against the live /deals route owned by the
        // still-mounted page (the AddLeadModal order). revalidatePath('/deals',
        // 'page') in createWalkInDeal is the authoritative server-side bust; this
        // refresh just pulls the freshly-revalidated payload immediately.
        handleClose();
        router.refresh();
      } catch {
        setError("We could not confirm whether the deal was saved. Check the deals list before trying again.");
      }
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
    fontSize:      'var(--text-xs)',
    fontWeight:    'var(--weight-semibold)',
    color:         'var(--theme-text-tertiary)',
    marginBottom:  'var(--space-2)',
  };

  return (
    <Modal
      error={error ? <Alert tone="danger">{error}</Alert> : undefined}
      open={open}
      pending={isPending}
      onClose={handleClose}
      title={step === 'contact' ? 'New Deal — Contact' : 'New Deal — Details'}
      maxWidth="max-w-md"
      footer={
        step === 'contact' ? (
          <>
            <Button variant="ghost" type="button" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="new-deal-contact-form" disabled={isPending}>
              Next →
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => { setError(null); setStep('contact'); }}
              disabled={isPending}
              style={{ display: 'inline-flex', alignItems: 'center', height: '2.25rem' }}
            >
              ← Back
            </Button>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" type="button" onClick={handleClose} disabled={isPending}>
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
        <form id="new-deal-contact-form" noValidate onSubmit={event => { event.preventDefault(); handleNext(); }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Contact name */}
          <div>
            <label htmlFor="new-deal-name" style={labelStyle}>
              Name <span style={{ color: "var(--color-danger-text)" }}>*</span>
            </label>
            <Input
              type="text"
              id="new-deal-name"
              disabled={isPending}
              value={contactName}
              onChange={(e) => { setContactName(e.target.value); setError(null); }}
              placeholder="Full name"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="new-deal-phone" style={labelStyle}>
              Phone <span style={{ color: "var(--color-danger-text)" }}>*</span>
            </label>
            <Input
              type="tel"
              id="new-deal-phone"
              disabled={isPending}
              value={contactPhone}
              onChange={(e) => { setContactPhone(e.target.value); setError(null); }}
              placeholder="+91 98765 43210"
            />
          </div>

          {/* Email (optional) */}
          <div>
            <label htmlFor="new-deal-email" style={labelStyle}>Email</label>
            <Input
              type="email"
              id="new-deal-email"
              disabled={isPending}
              value={contactEmail}
              onChange={(e) => { setContactEmail(e.target.value); setError(null); }}
              placeholder="optional"
            />
          </div>

          {/* Domain — admin/founder only */}
          {canPickDomain && (
            <div>
              <label style={labelStyle}>Domain</label>
              <div style={{ pointerEvents: isPending ? 'none' : undefined, opacity: isPending ? 0.6 : 1 }}>
                <FilterDropdown
                  disabled={isPending}
                  clearable={false}
                  ariaLabel={`Domain: ${DOMAIN_LABELS[domain]}`}
                  label={DOMAIN_LABELS[domain]}
                  items={domainItems}
                  selected={[domain]}
                  onChange={(next) => handleDomainChange((next[0] as AppDomain) ?? domain)}
                  fullWidth
                  menuPortal
                  hideCountBadge
                />
              </div>
            </div>
          )}

          {/* Agent — manager+ */}
          {isManagerPlus && (
            <div>
              <label style={labelStyle}>Assign to</label>
              {loadingAgents ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', height: '2.5rem' }}>
                  <LogoSpinner size="sm" />
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                    Loading agents…
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    pointerEvents: isPending || agents.length === 0 ? 'none' : undefined,
                    opacity:       isPending || agents.length === 0 ? 0.6 : 1,
                  }}
                >
                  <FilterDropdown
                    disabled={isPending || agents.length === 0}
                    label={assigneeLabel}
                    items={agentItems}
                    selected={assignedTo ? [assignedTo] : []}
                    onChange={(next) => setAssignedTo(next[0] ?? '')}
                    fullWidth
                    menuPortal
                    hideCountBadge
                  />
                </div>
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

        </form>
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
                  color:      "var(--neu-accent-deep)",
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
                Product Category <span style={{ color: "var(--color-danger-text)" }}>*</span>
              </p>
              <div style={{ pointerEvents: isPending ? 'none' : undefined, opacity: isPending ? 0.6 : 1 }}>
                <FilterDropdown
                  disabled={isPending}
                  label={categoryLabel}
                  items={categoryItems}
                  selected={category ? [category] : []}
                  onChange={(next) => { setCategory((next[0] ?? null) as DealCategory | null); setError(null); }}
                  fullWidth
                  menuPortal
                  hideCountBadge
                />
              </div>
            </div>
          )}

          {/* Duration — membership only */}
          {dealType === 'membership' && (
            <div>
              <p style={{ ...labelStyle, margin: '0 0 var(--space-3) 0' }}>
                Duration <span style={{ color: "var(--color-danger-text)" }}>*</span>
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {DEAL_DURATIONS.map((d) => (
                  <SelectionButton
                    appearance="choice"
                    selected={duration === d}
                    aria-pressed={duration === d}
                    key={d}
                    type="button"
                    onClick={() => { setDuration(d); setError(null); }}
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

          {/* Deal date + Source — side by side */}
          <div className="serene-form-row">
            <div>
              <p style={{ ...labelStyle, margin: '0 0 var(--space-2) 0' }}>
                Deal Date <span style={{ color: "var(--color-danger-text)" }}>*</span>
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
              <div style={{ pointerEvents: isPending ? 'none' : undefined, opacity: isPending ? 0.6 : 1 }}>
                <FilterDropdown
                  disabled={isPending}
                  label={sourceLabel}
                  items={LEAD_SOURCE_OPTIONS}
                  selected={source ? [source] : []}
                  onChange={(next) => setSource((next[0] ?? '') as LeadSource | '')}
                  fullWidth
                  menuPortal
                  hideCountBadge
                />
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="new-deal-amount" style={labelStyle}>
              Deal Amount (₹) <span style={{ color: "var(--color-danger-text)" }}>*</span>
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
              <Input
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
                  paddingLeft: 'calc(var(--space-3) + 1.25rem)',
                }}
              />
            </div>
          </div>


          {isPending && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <LogoSpinner size="sm" />
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
