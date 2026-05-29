'use client';

import { useState, useTransition } from 'react';
import { Phone, TrendingUp, Leaf, XCircle, Trash2, ChevronDown, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import { updateLeadStatus } from '@/lib/actions/leads';
import { CalledModal } from './CalledModal';
import { Modal } from '@/components/ui/modal';
import { formErrors } from '@/lib/validations/form-errors';
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE } from '@/lib/constants/lead-statuses';
import type { Lead, Profile, LeadStatus } from '@/lib/types/database';

type BadgeVariant = 'neutral' | 'info' | 'warning' | 'success' | 'accent' | 'danger';

const STATUS_BADGE_STYLES: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  neutral: { bg: 'var(--color-neutral-light)',  text: 'var(--color-neutral-text)',  border: 'var(--color-neutral-light)'  },
  info:    { bg: 'var(--color-info-light)',      text: 'var(--color-info-text)',     border: 'var(--color-info-light)'     },
  warning: { bg: 'var(--color-warning-light)',   text: 'var(--color-warning-text)',  border: 'var(--color-warning-light)'  },
  success: { bg: 'var(--color-success-light)',   text: 'var(--color-success-text)',  border: 'var(--color-success-light)'  },
  accent:  { bg: 'var(--theme-accent-surface)',  text: 'var(--theme-accent)',        border: 'var(--theme-accent-surface)' },
  danger:  { bg: 'var(--color-danger-light)',    text: 'var(--color-danger-text)',   border: 'var(--color-danger-light)'   },
};

type ActiveModal = 'called' | 'won' | 'nurturing' | 'lost' | 'junk' | null;

type Props = {
  lead: Lead;
  callerProfile: Profile;
};

export function StatusActionPanel({ lead, callerProfile }: Props) {
  const router                       = useRouter();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  const canAct =
    (callerProfile.role === 'agent' && lead.assigned_to === callerProfile.id) ||
    (callerProfile.role === 'manager' && lead.domain === callerProfile.domain) ||
    callerProfile.role === 'admin' ||
    callerProfile.role === 'founder';

  function closeModal() {
    setActiveModal(null);
    setError(null);
  }

  function fireStatusUpdate(status: LeadStatus, reason?: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateLeadStatus({ leadId: lead.id, status, reason });
      if (result.error) {
        setError(result.error);
        return;
      }
      closeModal();
      router.refresh();
    });
  }

  if (!canAct) return null;

  const status      = lead.status;
  const isTerminal  = status === 'won' || status === 'lost' || status === 'junk';
  const badgeVariant = LEAD_STATUS_BADGE[status];
  const badgeStyle   = STATUS_BADGE_STYLES[badgeVariant];

  return (
    <>
      <div
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow:    'var(--shadow-1)',
          padding:      'var(--space-4) var(--space-5)',
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
          flexWrap:     'wrap',
        }}
      >
        {/* Status pill — prominent, anchored left */}
        <div
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          'var(--space-2)',
            padding:      '0.375rem var(--space-4)',
            borderRadius: 'var(--radius-full)',
            background:   badgeStyle.bg,
            border:       `1px solid ${badgeStyle.border}`,
            color:        badgeStyle.text,
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-sm)',
            fontWeight:   'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-wide)',
            boxShadow:    'var(--shadow-1)',
            flexShrink:   0,
          }}
        >
          {/* Colored dot */}
          <span
            style={{
              width:        '7px',
              height:       '7px',
              borderRadius: 'var(--radius-full)',
              background:   badgeStyle.text,
              flexShrink:   0,
              opacity:      0.7,
            }}
          />
          {LEAD_STATUS_LABELS[status]}
        </div>

        {/* Vertical divider after status pill */}
        <div
          aria-hidden="true"
          style={{
            width:      '1px',
            height:     '28px',
            background: 'var(--theme-paper-border)',
            flexShrink: 0,
          }}
        />

        {/* Level Up — only when touched */}
        {status === 'touched' && (
          <ActionButton
            icon={<TrendingUp style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />}
            label="Level Up"
            variant="success"
            disabled={isPending}
            onClick={() => fireStatusUpdate('in_discussion')}
          />
        )}

        {/* Junk — only when touched */}
        {status === 'touched' && (
          <ActionButton
            icon={<Trash2 style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />}
            label="Junk"
            variant="ghost-danger"
            disabled={isPending}
            onClick={() => setActiveModal('junk')}
          />
        )}

        {/* Won — only when in_discussion */}
        {status === 'in_discussion' && (
          <ActionButton
            icon={<Trophy style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />}
            label="Won"
            variant="success"
            disabled={isPending}
            onClick={() => setActiveModal('won')}
          />
        )}

        {/* Nurture — only when in_discussion */}
        {status === 'in_discussion' && (
          <ActionButton
            icon={<Leaf style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />}
            label="Nurture"
            variant="accent"
            disabled={isPending}
            onClick={() => setActiveModal('nurturing')}
          />
        )}

        {/* Lost — only when in_discussion */}
        {status === 'in_discussion' && (
          <ActionButton
            icon={<XCircle style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />}
            label="Lost"
            variant="danger-outline"
            disabled={isPending}
            onClick={() => setActiveModal('lost')}
          />
        )}

        {/* Spacer pushes Called to the far right */}
        <div style={{ flex: 1 }} />

        {/* Vertical divider before Called */}
        <div
          aria-hidden="true"
          style={{
            width:      '1px',
            height:     '28px',
            background: 'var(--theme-paper-border)',
            flexShrink: 0,
          }}
        />

        {/* Called — always on the far right */}
        <ActionButton
          icon={<Phone style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />}
          label="Called"
          variant="primary"
          disabled={isPending || isTerminal}
          onClick={() => setActiveModal('called')}
        />
      </div>

      {/* Inline error (e.g. Level Up transition failure) */}
      {error && !activeModal && (
        <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>
          {error}
        </p>
      )}

      {/* Modals */}
      {activeModal === 'called' && (
        <CalledModal leadId={lead.id} onClose={closeModal} />
      )}

      {activeModal === 'won' && (
        <ConfirmModal
          title="Mark as Won"
          description="This lead has converted. The journey will close at Won."
          confirmLabel="Mark as Won"
          confirmVariant="success"
          isPending={isPending}
          error={error}
          onClose={closeModal}
          onConfirm={() => fireStatusUpdate('won')}
        />
      )}

      {activeModal === 'nurturing' && (
        <ConfirmModal
          title="Move to Nurturing"
          description="This lead isn't ready now. A follow-up task will be created automatically in 3 months."
          confirmLabel="Move to Nurturing"
          confirmVariant="accent"
          isPending={isPending}
          error={error}
          onClose={closeModal}
          onConfirm={() => fireStatusUpdate('nurturing')}
        />
      )}

      {activeModal === 'lost' && (
        <ReasonModal
          title="Mark as Lost"
          description="Provide a reason so the team can learn from this."
          confirmLabel="Mark Lost"
          isPending={isPending}
          error={error}
          onClose={closeModal}
          onConfirm={(reason) => fireStatusUpdate('lost', reason)}
        />
      )}

      {activeModal === 'junk' && (
        <ReasonModal
          title="Mark as Junk"
          description="Provide a reason — wrong number, spam, or other."
          confirmLabel="Mark Junk"
          isPending={isPending}
          error={error}
          onClose={closeModal}
          onConfirm={(reason) => fireStatusUpdate('junk', reason)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Action button
// ─────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'success' | 'accent' | 'danger-outline' | 'ghost-danger';

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--theme-accent)',
    color:      'var(--theme-accent-fg)',
    border:     'none',
    boxShadow:  'var(--shadow-accent-glow)',
  },
  secondary: {
    background: 'var(--theme-paper-subtle)',
    color:      'var(--theme-text-primary)',
    border:     '1px solid var(--theme-paper-border)',
    boxShadow:  'var(--shadow-1)',
  },
  success: {
    background: 'var(--color-success-light)',
    color:      'var(--color-success-text)',
    border:     '1px solid var(--color-success-light)',
  },
  accent: {
    background: 'var(--theme-accent-surface)',
    color:      'var(--theme-accent)',
    border:     '1px solid var(--theme-accent-surface)',
  },
  'danger-outline': {
    background: 'transparent',
    color:      'var(--color-danger-text)',
    border:     '1px solid var(--color-danger)',
  },
  'ghost-danger': {
    background: 'transparent',
    color:      'var(--color-danger-text)',
    border:     'none',
  },
};

function ActionButton({
  icon,
  label,
  variant,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  variant: ButtonVariant;
  disabled: boolean;
  onClick: () => void;
}) {
  const base = VARIANT_STYLES[variant];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            'var(--space-2)',
        height:         '2.25rem',
        paddingLeft:    'var(--space-4)',
        paddingRight:   'var(--space-4)',
        borderRadius:   'var(--radius-sm)',
        fontSize:       'var(--text-sm)',
        fontWeight:     'var(--weight-medium)',
        cursor:         disabled ? 'not-allowed' : 'pointer',
        opacity:        disabled ? 0.5 : 1,
        transition:     'var(--transition-interactive)',
        whiteSpace:     'nowrap',
        fontFamily:     'var(--font-sans)',
        ...base,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────
// Confirm modal (Nurturing)
// ─────────────────────────────────────────────
function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmVariant,
  isPending,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant: 'success' | 'accent';
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const confirmStyle: React.CSSProperties = confirmVariant === 'success'
    ? { background: 'var(--color-success)', color: 'var(--color-success-text)' }
    : { background: 'var(--theme-accent)', color: 'var(--theme-accent-fg)' };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={title}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            loading={isPending}
            style={confirmStyle}
          >
            {isPending ? 'Saving…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)', lineHeight: 'var(--leading-normal)', margin: 0 }}>
        {description}
      </p>
      {error && (
        <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>
          {error}
        </p>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Reason modal (Lost / Junk)
// ─────────────────────────────────────────────
const REASON_OPTIONS = [
  'Wrong number',
  'Not interested',
  'Duplicate lead',
  'Spam / bot submission',
  'No response after multiple attempts',
  'Other',
];

function ReasonModal({
  title,
  description,
  confirmLabel,
  isPending,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [selected, setSelected]     = useState('');
  const [custom, setCustom]         = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const reason = selected === 'Other' ? custom.trim() : selected;
    if (!reason) {
      setLocalError(formErrors.required);
      return;
    }
    setLocalError(null);
    onConfirm(reason);
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="submit"
            form="reason-modal-form"
            disabled={isPending}
            loading={isPending}
          >
            {isPending ? 'Saving…' : confirmLabel}
          </Button>
        </>
      }
    >
      <form id="reason-modal-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)', lineHeight: 'var(--leading-normal)', margin: 0 }}>
          {description}
        </p>

        <div>
          <label
            htmlFor="reason-select"
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
            Reason <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <select
              id="reason-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
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
                color:        selected ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
                appearance:   'none',
                cursor:       isPending ? 'not-allowed' : 'pointer',
                outline:      'none',
              }}
            >
              <option value="" disabled>Select a reason…</option>
              {REASON_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
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

        {selected === 'Other' && (
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Describe the reason…"
            rows={3}
            disabled={isPending}
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
              fontFamily:   'var(--font-sans)',
              boxSizing:    'border-box',
            }}
          />
        )}

        {(localError ?? error) && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
            {localError ?? error}
          </p>
        )}
      </form>
    </Modal>
  );
}
