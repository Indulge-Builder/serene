'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { FormChip } from '@/components/ui/TaskFormFields';
import { Modal } from '@/components/ui/modal';
import { createManualLead } from '@/lib/actions/leads';
import { getAssignableUsersAction } from '@/lib/actions/profiles';
import { CreateManualLeadSchema } from '@/lib/validations/lead-schema';
import { DOMAIN_LABELS, GIA_DOMAIN_FILTER_ITEMS } from '@/lib/constants/domains';
import { getDomainInterests, getServiceCategoryLabel } from '@/lib/constants/interests';
import { LEAD_SOURCE_OPTIONS } from '@/lib/constants/lead-sources';
import type { AppDomain, UserRole } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Agent = { id: string; full_name: string };

type CallerProfile = {
  id: string;
  role: UserRole;
  domain: AppDomain;
  full_name: string;
};

type FormValues = {
  first_name:        string;
  last_name:         string;
  phone:             string;
  email:             string;
  source:            string;
  domain:            string;
  assigned_to:       string;
  service_interests: string[];
};

type Props = {
  open:           boolean;
  onClose:        () => void;
  callerProfile:  CallerProfile;
  initialAgents:  Agent[];
  initialDomain:  AppDomain;
  onSuccess:      (leadId: string) => void;
};

// ─────────────────────────────────────────────
// Shared input / label styles
// ─────────────────────────────────────────────

const fieldLabel: React.CSSProperties = {
  display:       'block',
  fontSize:      'var(--text-2xs)',
  fontWeight:    'var(--weight-semibold)',
  letterSpacing: 'var(--tracking-widest)',
  textTransform: 'uppercase',
  color:         'var(--theme-text-tertiary)',
  marginBottom:  'var(--space-2)',
};

const fieldInput: React.CSSProperties = {
  width:        '100%',
  height:       '2.25rem',
  paddingLeft:  'var(--space-3)',
  paddingRight: 'var(--space-3)',
  border:       '1px solid var(--theme-paper-border)',
  borderRadius: 'var(--radius-sm)',
  background:   'var(--theme-paper)',
  fontSize:     'var(--text-sm)',
  color:        'var(--theme-text-primary)',
  outline:      'none',
  transition:   'var(--transition-hover)',
  boxSizing:    'border-box',
  fontFamily:   'var(--font-sans)',
};

const fieldError: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color:    'var(--color-danger-text)',
  margin:   '0',
  marginTop: 'var(--space-1)',
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function AddLeadModal({
  open,
  onClose,
  callerProfile,
  initialAgents,
  initialDomain,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicateLeadId, setDuplicateLeadId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);

  const canChangeDomain = callerProfile.role !== 'agent';
  const canChangeAssignee = callerProfile.role !== 'agent';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(CreateManualLeadSchema) as any,
    defaultValues: {
      first_name:        '',
      last_name:         '',
      phone:             '',
      email:             '',
      source:            '',
      domain:            callerProfile.domain,
      assigned_to:       callerProfile.id,
      service_interests: [],
    },
  });

  const watchedSource     = watch('source');
  const watchedDomain     = watch('domain');
  const watchedAssignedTo = watch('assigned_to');
  const watchedInterests  = watch('service_interests');

  // Domain-scoped interest options — ids from DOMAIN_INTERESTS, labels from
  // the single resolver in lib/constants/interests.ts (never a re-typed list).
  const interestOptions = useMemo(
    () =>
      getDomainInterests(watchedDomain).map((id) => ({
        id,
        label: getServiceCategoryLabel(id),
      })),
    [watchedDomain],
  );

  function toggleInterest(id: string) {
    const current = getValues('service_interests') ?? [];
    setValue(
      'service_interests',
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  const sourceLabel = useMemo(() => {
    if (!watchedSource) return 'Select source…';
    return LEAD_SOURCE_OPTIONS.find((o) => o.id === watchedSource)?.label ?? watchedSource;
  }, [watchedSource]);

  const domainLabel = useMemo(
    () => DOMAIN_LABELS[watchedDomain as AppDomain] ?? watchedDomain,
    [watchedDomain],
  );

  const agentItems = useMemo(
    () => agents.map((a) => ({ id: a.id, label: a.full_name })),
    [agents],
  );

  const assigneeLabel = useMemo(() => {
    if (agents.length === 0) return 'No one to assign in this domain';
    const match = agents.find((a) => a.id === watchedAssignedTo);
    return match?.full_name ?? 'Select assignee…';
  }, [agents, watchedAssignedTo]);

  // When domain changes (manager/admin/founder), refetch agents for the new domain.
  // This is the only permitted useEffect + data refetch as per spec.
  useEffect(() => {
    if (!canChangeDomain) return;

    // Failure-mode guard (call-intelligence Phase 1.1): a domain switch must
    // clear picks outside the new domain's vocabulary — 'travel' selected
    // under onboarding must never silently submit under shop. Runs on every
    // switch, including switching back to the initial domain.
    const vocab = getDomainInterests(watchedDomain);
    const current = getValues('service_interests') ?? [];
    const kept = current.filter((i) => vocab.includes(i));
    if (kept.length !== current.length) setValue('service_interests', kept);

    if (watchedDomain === initialDomain) {
      setAgents(initialAgents);
      return;
    }
    let cancelled = false;

    startTransition(async () => {
      const result = await getAssignableUsersAction(watchedDomain as AppDomain);
      if (cancelled) return;
      const list = result.data ?? [];
      setAgents(list);
      // Reset assigned_to to the first agent in the new domain (or empty)
      const first = list[0]?.id ?? '';
      setValue('assigned_to', first);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedDomain, canChangeDomain]);

  // Reset form state when modal is opened
  useEffect(() => {
    if (open) {
      reset({
        first_name:        '',
        last_name:         '',
        phone:             '',
        email:             '',
        source:            '',
        domain:            callerProfile.domain,
        assigned_to:       callerProfile.id,
        service_interests: [],
      });
      setServerError(null);
      setDuplicateLeadId(null);
      setAgents(initialAgents);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    if (!isPending) onClose();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onSubmit(values: any) {
    setServerError(null);
    setDuplicateLeadId(null);

    startTransition(async () => {
      const result = await createManualLead({
        first_name:        values.first_name,
        last_name:         values.last_name || undefined,
        phone:             values.phone,
        email:             values.email || undefined,
        domain:            values.domain,
        assigned_to:       values.assigned_to || undefined,
        source:            values.source || undefined,
        service_interests: values.service_interests ?? [],
      });

      if (result.error) {
        setServerError(result.error);
        return;
      }

      if (result.data?.duplicate) {
        setDuplicateLeadId(result.data.leadId);
        return;
      }

      if (result.data?.leadId) {
        onSuccess(result.data.leadId);
        router.refresh();
        onClose();
      }
    });
  }

  // ─────────────────────────────────────────────
  // Shared input focus style handlers (inline)
  // ─────────────────────────────────────────────
  function focusOn(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--theme-accent)';
    e.currentTarget.style.boxShadow   = 'var(--shadow-focus)';
  }
  function focusOff(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--theme-paper-border)';
    e.currentTarget.style.boxShadow   = 'none';
  }

  const dropdownWrapStyle = {
    opacity:       isPending ? 0.6 : 1,
    pointerEvents: isPending ? 'none' as const : 'auto' as const,
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Lead"
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="add-lead-form"
            disabled={isPending}
            loading={isPending}
            style={{ minWidth: '6.5rem', boxShadow: 'var(--shadow-accent-glow)' }}
          >
            {isPending ? 'Adding…' : '+ Add Lead'}
          </Button>
        </>
      }
    >
      {/* Duplicate warning banner */}
      {duplicateLeadId && (
        <div
          style={{
            display:      'flex',
            alignItems:   'flex-start',
            gap:          'var(--space-3)',
            background:   'var(--color-warning-light)',
            border:       '1px solid var(--color-warning)',
            borderRadius: 'var(--radius-md)',
            padding:      'var(--space-3)',
            marginBottom: 'var(--space-5)',
          }}
        >
          <AlertTriangle
            style={{
              width:      '1rem',
              height:     '1rem',
              color:      'var(--color-warning-text)',
              flexShrink: 0,
              marginTop:  '1px',
              strokeWidth: 1.5,
            }}
          />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-warning-text)', margin: 0, lineHeight: 'var(--leading-normal)' }}>
            An active lead with this phone number already exists.{' '}
            <a
              href={`/leads/${duplicateLeadId}`}
              style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-warning-text)', textDecoration: 'underline' }}
            >
              View existing lead →
            </a>
          </p>
        </div>
      )}

      <form
        id="add-lead-form"
        onSubmit={handleSubmit(onSubmit)}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
      >
        {/* Row 1: First name + Last name */}
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:                 'var(--space-4)',
          }}
          className="add-lead-name-row"
        >
          <div>
            <label htmlFor="al-first-name" style={fieldLabel}>
              First name <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              id="al-first-name"
              type="text"
              autoComplete="off"
              disabled={isPending}
              placeholder="First name"
              {...register('first_name')}
              style={{ ...fieldInput, opacity: isPending ? 0.6 : 1 }}
              onFocus={focusOn}
              onBlur={focusOff}
            />
            {errors.first_name && (
              <p style={fieldError}>{errors.first_name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="al-last-name" style={fieldLabel}>
              Last name
            </label>
            <input
              id="al-last-name"
              type="text"
              autoComplete="off"
              disabled={isPending}
              placeholder="Last name"
              {...register('last_name')}
              style={{ ...fieldInput, opacity: isPending ? 0.6 : 1 }}
              onFocus={focusOn}
              onBlur={focusOff}
            />
          </div>
        </div>

        {/* Row 2: Phone */}
        <div>
          <label htmlFor="al-phone" style={fieldLabel}>
            Phone <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <input
            id="al-phone"
            type="tel"
            autoComplete="off"
            disabled={isPending}
            placeholder="+91 98765 43210"
            {...register('phone')}
            style={{ ...fieldInput, opacity: isPending ? 0.6 : 1 }}
            onFocus={focusOn}
            onBlur={focusOff}
          />
          {errors.phone && (
            <p style={fieldError}>{errors.phone.message}</p>
          )}
        </div>

        {/* Row 3: Email */}
        <div>
          <label htmlFor="al-email" style={fieldLabel}>
            Email
          </label>
          <input
            id="al-email"
            type="email"
            autoComplete="off"
            disabled={isPending}
            placeholder="name@example.com"
            {...register('email')}
            style={{ ...fieldInput, opacity: isPending ? 0.6 : 1 }}
            onFocus={focusOn}
            onBlur={focusOff}
          />
          {errors.email && (
            <p style={fieldError}>{errors.email.message}</p>
          )}
        </div>

        {/* Row 4: Source · Domain · Assign to */}
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: canChangeDomain
              ? 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)'
              : 'minmax(0, 1fr) minmax(0, 1fr)',
            gap:                 'var(--space-4)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <span id="al-source-label" style={fieldLabel}>
              Source
            </span>
            <div aria-labelledby="al-source-label" style={dropdownWrapStyle}>
              <FilterDropdown
                label={sourceLabel}
                items={LEAD_SOURCE_OPTIONS}
                selected={watchedSource ? [watchedSource] : []}
                onChange={(next) => setValue('source', next[0] ?? '')}
                fullWidth
                menuPortal
                hideCountBadge
              />
            </div>
          </div>

          {canChangeDomain && (
            <div style={{ minWidth: 0 }}>
              <span id="al-domain-label" style={fieldLabel}>
                Domain
              </span>
              <div aria-labelledby="al-domain-label" style={dropdownWrapStyle}>
                <FilterDropdown
                  label={domainLabel}
                  items={GIA_DOMAIN_FILTER_ITEMS}
                  selected={watchedDomain ? [watchedDomain] : []}
                  onChange={(next) => setValue('domain', next[0] ?? callerProfile.domain)}
                  fullWidth
                  menuPortal
                  hideCountBadge
                />
              </div>
              {errors.domain && (
                <p style={fieldError}>{errors.domain.message}</p>
              )}
            </div>
          )}

          <div style={{ minWidth: 0 }}>
            <span id="al-assigned-to-label" style={fieldLabel}>
              Assign to
            </span>
            {canChangeAssignee ? (
              <div
                aria-labelledby="al-assigned-to-label"
                style={{
                  ...dropdownWrapStyle,
                  pointerEvents: isPending || agents.length === 0 ? 'none' : dropdownWrapStyle.pointerEvents,
                  opacity:       isPending || agents.length === 0 ? 0.6 : dropdownWrapStyle.opacity,
                }}
              >
                <FilterDropdown
                  label={assigneeLabel}
                  items={agentItems}
                  selected={watchedAssignedTo ? [watchedAssignedTo] : []}
                  onChange={(next) => setValue('assigned_to', next[0] ?? '')}
                  fullWidth
                  menuPortal
                  hideCountBadge
                />
              </div>
            ) : (
              <div
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  height:       '2.25rem',
                  paddingLeft:  'var(--space-3)',
                  paddingRight: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border:       '1px solid var(--theme-paper-border)',
                  background:   'var(--theme-paper-subtle)',
                  fontSize:     'var(--text-sm)',
                  color:        'var(--theme-text-secondary)',
                  fontWeight:   'var(--weight-medium)',
                  maxWidth:     '100%',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}
              >
                {callerProfile.full_name}
              </div>
            )}
            {errors.assigned_to && (
              <p style={fieldError}>{errors.assigned_to.message}</p>
            )}
          </div>
        </div>

        {/* Row 5: Service interests — optional, domain-scoped multi-select.
            Options follow the Domain field above; empty selection = '{}'. */}
        <div>
          <span id="al-interests-label" style={fieldLabel}>
            Interests{' '}
            <span style={{ textTransform: 'none', letterSpacing: 'normal', fontWeight: 'var(--weight-normal)' }}>
              (optional)
            </span>
          </span>
          <div
            role="group"
            aria-labelledby="al-interests-label"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
          >
            {interestOptions.map((opt) => (
              <FormChip
                key={opt.id}
                label={opt.label}
                active={(watchedInterests ?? []).includes(opt.id)}
                disabled={isPending}
                onClick={() => toggleInterest(opt.id)}
              />
            ))}
          </div>
        </div>

        {/* Server error */}
        {serverError && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  );
}
