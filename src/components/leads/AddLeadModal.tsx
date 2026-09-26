'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
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
  display: 'block',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-medium)',
  color: 'var(--theme-text-secondary)',
  marginBottom: 'var(--space-2)',
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
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentRetry, setAgentRetry] = useState(0);
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
    if (agentsLoading) return 'Loading assignees…';
    if (agentError) return 'Assignees unavailable';
    if (agents.length === 0) return 'No one to assign in this domain';
    const match = agents.find((a) => a.id === watchedAssignedTo);
    return match?.full_name ?? 'Select assignee…';
  }, [agents, watchedAssignedTo, agentsLoading, agentError]);

  // When domain changes (manager/admin/founder), refetch agents for the new domain.
  // This is the only permitted useEffect + data refetch as per spec.
  useEffect(() => {
    if (!open || !canChangeDomain) return;
    setAgentError(null);

    // Failure-mode guard (call-intelligence Phase 1.1): a domain switch must
    // clear picks outside the new domain's vocabulary — 'travel' selected
    // under onboarding must never silently submit under shop. Runs on every
    // switch, including switching back to the initial domain.
    const vocab = getDomainInterests(watchedDomain);
    const current = getValues('service_interests') ?? [];
    const kept = current.filter((i) => vocab.includes(i));
    if (kept.length !== current.length) setValue('service_interests', kept);

    // Seeded initial domain → use the seed. Otherwise fetch: a switched domain,
    // OR the initial domain with no seed (the /leads page stopped seeding on
    // 2026-09-16 so its header never waits on this list; the modal mounts on
    // first open, so this runs once, at open, not at page load).
    const isInitialDomain = watchedDomain === initialDomain;
    if (isInitialDomain && initialAgents.length > 0) {
      setAgents(initialAgents);
      setAgentsLoading(false);
      return;
    }
    let cancelled = false;

    setAgentsLoading(true);
    setAgents([]);
    void (async () => {
      try {
        const result = await getAssignableUsersAction(watchedDomain as AppDomain);
        if (cancelled) return;
        if (result.error) { setAgentError(result.error); return; }
        const list = result.data ?? [];
        setAgents(list);
        // Keep a valid current choice; otherwise use the first eligible assignee.
        const currentAssignee = getValues('assigned_to');
        if (!list.some(agent => agent.id === currentAssignee)) setValue('assigned_to', list[0]?.id ?? '');
      } catch {
        if (!cancelled) setAgentError('Could not load assignees. Try again.');
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, watchedDomain, canChangeDomain, agentRetry]);

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
      // Unseeded: keep the list fetched on first open (the domain reset above
      // re-runs the fetch effect only if the domain actually changed).
      if (initialAgents.length > 0) setAgents(initialAgents);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    if (!isPending) onClose();
  }

  function onSubmit(values: FormValues) {
    if (isPending || agentsLoading || agentError) return;
    setServerError(null);
    setDuplicateLeadId(null);

    startTransition(async () => {
      try {
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
        } else {
          setServerError("The lead could not be saved. Your entries are still here.");
        }
      } catch {
        setServerError("We could not confirm whether the lead was saved. Check the leads list before trying again.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Lead"
      maxWidth="max-w-xl"
      pending={isPending}
      error={serverError ? <Alert tone="danger">{serverError}</Alert> : undefined}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="add-lead-form"
            disabled={isPending || agentsLoading || !!agentError}
            loading={isPending}
            loadingLabel="Adding…"
            style={{ minWidth: '6.5rem' }}
          >
            {isPending ? 'Adding…' : '+ Add Lead'}
          </Button>
        </>
      }
    >
      {/* Duplicate warning banner */}
      {duplicateLeadId && (
        <Alert tone="warning" style={{ marginBottom: 'var(--space-5)' }}>
          An active lead with this phone number already exists.{' '}
          <a href={`/leads/${duplicateLeadId}`}>View existing lead →</a>
        </Alert>
      )}

      <form
        id="add-lead-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-busy={isPending}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
      >
        {/* Row 1: First name + Last name */}
        <div className="serene-form-row add-lead-name-row">
          <Field htmlFor="al-first-name" label="First name" required error={errors.first_name?.message}>
            <Input
              id="al-first-name"
              type="text"
              autoComplete="off"
              disabled={isPending}
              placeholder="First name"
              {...register('first_name')}
            />
          </Field>

          <Field htmlFor="al-last-name" label="Last name" error={errors.last_name?.message}>
            <Input
              id="al-last-name"
              type="text"
              autoComplete="off"
              disabled={isPending}
              placeholder="Last name"
              {...register('last_name')}
            />
          </Field>
        </div>

        {/* Row 2: Phone */}
        <Field htmlFor="al-phone" label="Phone" required error={errors.phone?.message}>
          <Input
            id="al-phone"
            type="tel"
            autoComplete="off"
            disabled={isPending}
            placeholder="+91 98765 43210"
            {...register('phone')}
          />
        </Field>

        {/* Row 3: Email */}
        <Field htmlFor="al-email" label="Email" error={errors.email?.message}>
          <Input
            id="al-email"
            type="email"
            autoComplete="off"
            disabled={isPending}
            placeholder="name@example.com"
            {...register('email')}
          />
        </Field>

        {/* Row 4: Source · Domain · Assign to */}
        <div className="serene-form-row">
          <div style={{ minWidth: 0 }}>
            <span id="al-source-label" style={fieldLabel}>
              Source
            </span>
            <div aria-labelledby="al-source-label">
              <FilterDropdown
                disabled={isPending}
                ariaLabel={`Source: ${sourceLabel}`}
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
              <div aria-labelledby="al-domain-label">
                <FilterDropdown
                  disabled={isPending}
                  clearable={false}
                  ariaLabel={`Domain: ${domainLabel}`}
                  invalid={!!errors.domain}
                  ariaDescribedBy={errors.domain ? "al-domain-error" : undefined}
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
                <p id="al-domain-error" role="alert" style={fieldError}>{errors.domain.message}</p>
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
              >
                <FilterDropdown
                  disabled={isPending || agentsLoading || !!agentError || agents.length === 0}
                  ariaLabel={`Assign to: ${assigneeLabel}`}
                  invalid={!!errors.assigned_to}
                  ariaDescribedBy={errors.assigned_to ? "al-assigned-error" : undefined}
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
              <p id="al-assigned-error" role="alert" style={fieldError}>{errors.assigned_to.message}</p>
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

        {agentError && <Alert tone="danger" action={<Button variant="ghost" size="sm" onClick={() => setAgentRetry(value => value + 1)}>Retry loading assignees</Button>}>{agentError}</Alert>}
      </form>
    </Modal>
  );
}
