'use client';

import { useState, useTransition, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/modal';
import { createManualLead, listAgentsForDomain } from '@/lib/actions/leads';
import { CreateManualLeadSchema } from '@/lib/validations/lead-schema';
import { APP_DOMAINS, DOMAIN_LABELS } from '@/lib/constants/domains';
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
  first_name:    string;
  last_name:     string;
  phone:         string;
  email:         string;
  manual_source: string;
  domain:        string;
  assigned_to:   string;
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

function useFocusHandlers(ref: React.RefObject<HTMLInputElement | HTMLSelectElement | null>) {
  return {
    onFocus: () => {
      if (ref.current) {
        ref.current.style.borderColor = 'var(--theme-accent)';
        ref.current.style.boxShadow   = 'var(--shadow-focus)';
      }
    },
    onBlur: () => {
      if (ref.current) {
        ref.current.style.borderColor = 'var(--theme-paper-border)';
        ref.current.style.boxShadow   = 'none';
      }
    },
  };
}

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
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(CreateManualLeadSchema) as any,
    defaultValues: {
      first_name:    '',
      last_name:     '',
      phone:         '',
      email:         '',
      manual_source: '',
      domain:        callerProfile.domain,
      assigned_to:   callerProfile.id,
    },
  });

  const watchedDomain = watch('domain');

  // When domain changes (manager/admin/founder), refetch agents for the new domain.
  // This is the only permitted useEffect + data refetch as per spec.
  useEffect(() => {
    if (!canChangeDomain) return;
    if (watchedDomain === initialDomain) {
      setAgents(initialAgents);
      return;
    }
    let cancelled = false;

    startTransition(async () => {
      const result = await listAgentsForDomain(watchedDomain);
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
        first_name:    '',
        last_name:     '',
        phone:         '',
        email:         '',
        manual_source: '',
        domain:        callerProfile.domain,
        assigned_to:   callerProfile.id,
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
        first_name:    values.first_name,
        last_name:     values.last_name || undefined,
        phone:         values.phone,
        email:         values.email || undefined,
        domain:        values.domain,
        assigned_to:   values.assigned_to || undefined,
        manual_source: values.manual_source || undefined,
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
  function focusOn(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = 'var(--theme-accent)';
    e.currentTarget.style.boxShadow   = 'var(--shadow-focus)';
  }
  function focusOff(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = 'var(--theme-paper-border)';
    e.currentTarget.style.boxShadow   = 'none';
  }

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

        {/* Row 4: Source */}
        <div>
          <label htmlFor="al-source" style={fieldLabel}>
            Source
          </label>
          <div style={{ position: 'relative' }}>
            <select
              id="al-source"
              disabled={isPending}
              {...register('manual_source')}
              style={{
                ...fieldInput,
                paddingRight: 'var(--space-8)',
                appearance:   'none',
                cursor:       isPending ? 'not-allowed' : 'pointer',
                opacity:      isPending ? 0.6 : 1,
              }}
              onFocus={focusOn}
              onBlur={focusOff}
            >
              <option value="">— Select source —</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="website">Website</option>
              <option value="meta">Meta</option>
              <option value="google">Google</option>
              <option value="referral">Referral</option>
              <option value="ypo">YPO</option>
              <option value="events">Events</option>
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
                strokeWidth:   1.5,
              }}
            />
          </div>
        </div>

        {/* Row 5: Domain (manager/admin/founder only) */}
        {canChangeDomain && (
          <div>
            <label htmlFor="al-domain" style={fieldLabel}>
              Domain
            </label>
            <div style={{ position: 'relative' }}>
              <select
                id="al-domain"
                disabled={isPending}
                {...register('domain')}
                style={{
                  ...fieldInput,
                  paddingRight: 'var(--space-8)',
                  appearance:   'none',
                  cursor:       isPending ? 'not-allowed' : 'pointer',
                  opacity:      isPending ? 0.6 : 1,
                }}
                onFocus={focusOn}
                onBlur={focusOff}
              >
                {APP_DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {DOMAIN_LABELS[d]}
                  </option>
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
                  strokeWidth:   1.5,
                }}
              />
            </div>
            {errors.domain && (
              <p style={fieldError}>{errors.domain.message}</p>
            )}
          </div>
        )}

        {/* Row 6: Assign to */}
        <div>
          <label htmlFor="al-assigned-to" style={fieldLabel}>
            Assign to
          </label>
          {canChangeAssignee ? (
            <div style={{ position: 'relative' }}>
              <select
                id="al-assigned-to"
                disabled={isPending || agents.length === 0}
                {...register('assigned_to')}
                style={{
                  ...fieldInput,
                  paddingRight: 'var(--space-8)',
                  appearance:   'none',
                  cursor:       isPending || agents.length === 0 ? 'not-allowed' : 'pointer',
                  opacity:      isPending ? 0.6 : 1,
                }}
                onFocus={focusOn}
                onBlur={focusOff}
              >
                {agents.length === 0 ? (
                  <option value="">No active agents in this domain</option>
                ) : (
                  agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name}
                    </option>
                  ))
                )}
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
                  strokeWidth:   1.5,
                }}
              />
            </div>
          ) : (
            /* Agent: read-only display chip */
            <div
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                height:       '2rem',
                paddingLeft:  'var(--space-3)',
                paddingRight: 'var(--space-3)',
                borderRadius: 'var(--radius-full)',
                border:       '1px solid var(--theme-paper-border)',
                background:   'var(--theme-paper-subtle)',
                fontSize:     'var(--text-sm)',
                color:        'var(--theme-text-secondary)',
                fontWeight:   'var(--weight-medium)',
              }}
            >
              {callerProfile.full_name}
            </div>
          )}
          {errors.assigned_to && (
            <p style={fieldError}>{errors.assigned_to.message}</p>
          )}
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
