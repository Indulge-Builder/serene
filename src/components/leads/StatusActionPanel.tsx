'use client';

import { useEffect, useState, useTransition, useOptimistic, useRef } from 'react';
import { Phone, TrendingUp, Leaf, XCircle, Trash2, Trophy, Zap } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { FAST_DURATION, EXIT_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import { updateLeadStatus, recordDeal } from '@/lib/actions/leads';
import { CalledModal } from './CalledModal';
import { WonDealModal } from './WonDealModal';
import { Modal } from '@/components/ui/modal';
import { formErrors } from '@/lib/validations/form-errors';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/lib/constants/lead-statuses';
import { JUNK_REASONS, LOST_REASONS, RESOLUTION_REASON_LABELS } from '@/lib/constants/lead-resolution-reasons';
import type { Lead, Profile, LeadStatus } from '@/lib/types/database';
import type { DealDuration, DealCategory } from '@/lib/constants/deal-types';

type ActiveModal = 'called' | 'won' | 'nurturing' | 'lost' | 'junk' | 'revive' | null;

type Props = {
  lead: Lead;
  callerProfile: Profile;
};

export function StatusActionPanel({ lead, callerProfile }: Props) {
  const router                        = useRouter();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [isPending, startTransition]  = useTransition();
  const [error, setError]             = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(lead.status);

  /* Keep the active modal mounted through its close so the Dialog can play its
     exit animation (open=false drives the fade/scale-out — unmounting on close
     would cut it; see Heavy modal loading rule). `renderedModal` follows
     `activeModal` immediately on open and lags one EXIT_DURATION on close.
     `modalKey` bumps on each open so the next open remounts with fresh state. */
  const [renderedModal, setRenderedModal] = useState<ActiveModal>(null);
  const [modalKey, setModalKey]           = useState(0);
  const exitTimer                         = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    if (activeModal) {
      setRenderedModal(activeModal);
      setModalKey((k) => k + 1);
    } else {
      // Hold the closing modal mounted (open=false) until the exit completes.
      exitTimer.current = setTimeout(
        () => setRenderedModal(null),
        EXIT_DURATION * 1000 + 50,
      );
    }
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [activeModal]);

  const canAct =
    (callerProfile.role === 'agent' && lead.assigned_to === callerProfile.id) ||
    (callerProfile.role === 'manager' && lead.domain === callerProfile.domain) ||
    callerProfile.role === 'admin' ||
    callerProfile.role === 'founder';

  function closeModal() {
    setActiveModal(null);
    setError(null);
  }

  function fireStatusUpdate(newStatus: LeadStatus, reason?: string) {
    setError(null);
    startTransition(async () => {
      setOptimisticStatus(newStatus);
      const result = await updateLeadStatus({ leadId: lead.id, status: newStatus, reason });
      if (result.error) {
        setError(result.error);
        throw new Error(result.error);
      }
      closeModal();
      router.refresh();
    });
  }

  function fireDeal(deal: { deal_duration: DealDuration | null; deal_category: DealCategory | null; deal_amount: number }) {
    setError(null);
    startTransition(async () => {
      setOptimisticStatus('won');
      // deal_type is intentionally NOT sent — recordDeal derives it from the lead's domain.
      const result = await recordDeal({
        leadId:        lead.id,
        deal_duration: deal.deal_duration,
        deal_category: deal.deal_category,
        deal_amount:   deal.deal_amount,
      });
      if (result.error) {
        setError(result.error);
        throw new Error(result.error);
      }
      closeModal();
      router.refresh();
    });
  }

  const isMobile = useMediaQuery(MQ.mobile);

  if (!canAct) return null;

  const isTerminal = optimisticStatus === 'won' || optimisticStatus === 'lost' || optimisticStatus === 'junk';
  const badgeStyle = LEAD_STATUS_COLORS[optimisticStatus];

  /* Status pill — prominent, anchored left. Status changes transition:
     colours dissolve via CSS, the label crossfades (M-04 — data never flashes). */
  const statusPill = (
    <div
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          'var(--space-2)',
        padding:      '0.375rem var(--space-4)',
        borderRadius: 'var(--radius-full)',
        background:   badgeStyle.light,
        border:       `1px solid ${badgeStyle.border}`,
        color:        badgeStyle.text,
        fontFamily:   'var(--font-sans)',
        fontSize:     'var(--text-sm)',
        fontWeight:   'var(--weight-semibold)',
        letterSpacing: 'var(--tracking-wide)',
        boxShadow:    'var(--shadow-1)',
        flexShrink:   0,
        transition:   'background var(--duration-slow) var(--ease-in-out), border-color var(--duration-slow) var(--ease-in-out), color var(--duration-slow) var(--ease-in-out)',
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
          transition:   'background var(--duration-slow) var(--ease-in-out)',
        }}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={optimisticStatus}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
        >
          {LEAD_STATUS_LABELS[optimisticStatus]}
        </motion.span>
      </AnimatePresence>
    </div>
  );

  // Stage-specific actions for the current status
  const stageActions: {
    key:     string;
    icon:    React.ReactNode;
    label:   string;
    variant: ButtonVariant;
    onClick: () => void;
  }[] = [];

  if (optimisticStatus === 'touched') {
    stageActions.push(
      {
        key:     'level-up',
        icon:    <TrendingUp style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />,
        label:   'Level Up',
        variant: 'success',
        onClick: () => fireStatusUpdate('in_discussion'),
      },
      {
        key:     'junk',
        icon:    <Trash2 style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />,
        label:   'Junk',
        variant: 'ghost-danger',
        onClick: () => setActiveModal('junk'),
      },
    );
  }

  if (optimisticStatus === 'in_discussion') {
    stageActions.push(
      {
        key:     'won',
        icon:    <Trophy style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />,
        label:   'Won',
        variant: 'success',
        onClick: () => setActiveModal('won'),
      },
      {
        key:     'nurture',
        icon:    <Leaf style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />,
        label:   'Nurture',
        variant: 'accent',
        onClick: () => setActiveModal('nurturing'),
      },
      {
        key:     'lost',
        icon:    <XCircle style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />,
        label:   'Lost',
        variant: 'danger-outline',
        onClick: () => setActiveModal('lost'),
      },
    );
  }

  if (optimisticStatus === 'junk') {
    stageActions.push({
      key:     'revive',
      icon:    <Zap style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />,
      label:   'Revive Lead',
      variant: 'revive',
      onClick: () => setActiveModal('revive'),
    });
  }

  /* Called — always present; phone icon rings on approach */
  const calledButton = (
    <ActionButton
      icon={<Phone style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />}
      label="Called"
      variant="primary"
      className="serene-icon-ring-hover"
      disabled={isPending || isTerminal}
      onClick={() => setActiveModal('called')}
    />
  );

  const verticalDivider = (
    <div
      aria-hidden="true"
      style={{
        width:      '1px',
        height:     '28px',
        background: 'var(--theme-paper-border)',
        flexShrink: 0,
      }}
    />
  );

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
          gap:          'var(--space-3)',
          ...(isMobile
            ? { flexDirection: 'column' as const, alignItems: 'stretch' as const }
            : { alignItems: 'center' as const, flexWrap: 'wrap' as const }),
        }}
      >
        {isMobile ? (
          /* Mobile: pill + Called on the top row, stage actions in an
             equal-width row below — no orphaned dividers, no wrap drift. */
          <>
            <div
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                gap:            'var(--space-3)',
              }}
            >
              {statusPill}
              {calledButton}
            </div>
            {stageActions.length > 0 && (
              <div
                style={{
                  display:             'grid',
                  gridTemplateColumns: `repeat(${stageActions.length}, minmax(0, 1fr))`,
                  gap:                 'var(--space-2)',
                }}
              >
                {stageActions.map(({ key, ...action }) => (
                  <ActionButton key={key} {...action} disabled={isPending} fluid />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {statusPill}
            {verticalDivider}
            {stageActions.map(({ key, ...action }) => (
              <ActionButton key={key} {...action} disabled={isPending} />
            ))}
            {/* Spacer pushes Called to the far right */}
            <div style={{ flex: 1 }} />
            {verticalDivider}
            {calledButton}
          </>
        )}
      </div>

      {/* Inline error (e.g. Level Up transition failure) */}
      {error && !activeModal && (
        <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>
          {error}
        </p>
      )}

      {/* Modals — each stays mounted through its close so the Dialog's
         exit animation plays (open=false drives the fade/scale-out, never an
         abrupt unmount). `renderedModal` lags `activeModal` on close: it holds
         the last modal type until the exit finishes, then clears. `key` is the
         open generation, so each fresh open remounts with clean form state. */}
      {renderedModal === 'called' && (
        <CalledModal
          key={modalKey}
          open={activeModal === 'called'}
          leadId={lead.id}
          onClose={closeModal}
        />
      )}

      {renderedModal === 'won' && (
        <WonDealModal
          key={modalKey}
          open={activeModal === 'won'}
          leadId={lead.id}
          domain={lead.domain}
          isPending={isPending}
          error={error}
          onClose={closeModal}
          onConfirm={fireDeal}
        />
      )}

      {renderedModal === 'nurturing' && (
        <ConfirmModal
          key={modalKey}
          open={activeModal === 'nurturing'}
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

      {renderedModal === 'lost' && (
        <ReasonModal
          key={modalKey}
          open={activeModal === 'lost'}
          title="Mark as Lost"
          description="Provide a reason so the team can learn from this."
          confirmLabel="Mark Lost"
          status="lost"
          isPending={isPending}
          error={error}
          onClose={closeModal}
          onConfirm={(reason) => fireStatusUpdate('lost', reason)}
        />
      )}

      {renderedModal === 'junk' && (
        <ReasonModal
          key={modalKey}
          open={activeModal === 'junk'}
          title="Mark as Junk"
          description="Provide a reason — wrong number, spam, or other."
          confirmLabel="Mark Junk"
          status="junk"
          isPending={isPending}
          error={error}
          onClose={closeModal}
          onConfirm={(reason) => fireStatusUpdate('junk', reason)}
        />
      )}

      {renderedModal === 'revive' && (
        <ConfirmModal
          key={modalKey}
          open={activeModal === 'revive'}
          title="Revive this Lead"
          description="This will move the lead back to In Discussion. All previous history — calls, notes, and activity — will be preserved."
          confirmLabel="Revive Lead"
          confirmVariant="revive"
          isPending={isPending}
          error={error}
          onClose={closeModal}
          onConfirm={() => fireStatusUpdate('in_discussion')}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Action button
// ─────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'success' | 'accent' | 'danger-outline' | 'ghost-danger' | 'revive';

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
    background: 'var(--color-success)',
    color:      'var(--color-success-fg)',
    border:     '1px solid var(--color-success)',
    boxShadow:  '0 0 0 1px color-mix(in srgb, var(--color-success) 40%, transparent), 0 2px 8px color-mix(in srgb, var(--color-success) 25%, transparent)',
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
  revive: {
    background: 'var(--color-warning-light)',
    color:      'var(--color-warning-text)',
    border:     '1px solid var(--color-warning)',
    fontWeight: 'var(--weight-semibold)' as string,
  },
};

function ActionButton({
  icon,
  label,
  variant,
  disabled,
  onClick,
  className,
  fluid = false,
}: {
  icon: React.ReactNode;
  label: string;
  variant: ButtonVariant;
  disabled: boolean;
  onClick: () => void;
  className?: string;
  /** Fill the grid cell (equal-width mobile stage-action row) */
  fluid?: boolean;
}) {
  const base = VARIANT_STYLES[variant];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className ? `serene-pressable ${className}` : 'serene-pressable'}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            'var(--space-2)',
        height:         '2.25rem',
        paddingLeft:    'var(--space-4)',
        paddingRight:   'var(--space-4)',
        // Grid cell already sizes the button; fill it and allow the label to
        // ellipsize on very narrow viewports rather than overflow the cell.
        ...(fluid ? { width: '100%', minWidth: 0, overflow: 'hidden' } : null),
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
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span
        style={{
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
          minWidth:     0,
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────
// Confirm modal (Nurturing)
// ─────────────────────────────────────────────
function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  confirmVariant,
  isPending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant: 'success' | 'accent' | 'revive';
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const confirmStyle: React.CSSProperties =
    confirmVariant === 'success' ? { background: 'var(--color-success)',      color: 'var(--color-success-fg)'   } :
    confirmVariant === 'revive'  ? { background: 'var(--color-warning)',       color: 'var(--color-warning-fg)'  } :
                                   { background: 'var(--theme-accent)',        color: 'var(--theme-accent-fg)'    };

  return (
    <Modal
      open={open}
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
// Inline option rows — no portal, no overflow/clipping dependency.
// FilterDropdown was not suitable here: its absolute panel clips inside modal body.
// ─────────────────────────────────────────────
const JUNK_REASON_ITEMS  = JUNK_REASONS.map(({ id, label }) => ({ id, label }));
const LOST_REASON_ITEMS  = LOST_REASONS.map(({ id, label }) => ({ id, label }));

const microLabelStyle: React.CSSProperties = {
  display:       'block',
  fontSize:      'var(--text-2xs)',
  fontWeight:    'var(--weight-semibold)',
  letterSpacing: 'var(--tracking-widest)',
  textTransform: 'uppercase',
  color:         'var(--theme-text-tertiary)',
  marginBottom:  'var(--space-2)',
};

function ReasonModal({
  open,
  title,
  description,
  confirmLabel,
  status,
  isPending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  status: 'junk' | 'lost';
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [selected, setSelected]     = useState<string[]>([]);
  const [noteText, setNoteText]     = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  const reasonItems  = status === 'junk' ? JUNK_REASON_ITEMS : LOST_REASON_ITEMS;
  const selectedId   = selected[0] ?? '';
  const isOther      = selectedId === 'other';
  const noteRequired = isOther;
  const canSubmit    = selectedId !== '' && (!noteRequired || noteText.trim().length > 0);

  function handleTextareaInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    setNoteText(el.value);
  }

  function handleSubmit() {
    if (!selectedId) {
      setLocalError(formErrors.required);
      return;
    }
    if (noteRequired && !noteText.trim()) {
      setLocalError('Please describe the reason.');
      return;
    }
    setLocalError(null);

    // Compose p_reason: 'other' → freetext; else → label + optional note
    let composed: string;
    if (isOther) {
      composed = noteText.trim();
    } else {
      const label = RESOLUTION_REASON_LABELS[selectedId] ?? selectedId;
      composed = noteText.trim() ? `${label} — ${noteText.trim()}` : label;
    }

    onConfirm(composed);
  }

  return (
    <Modal
      open={open}
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
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !canSubmit}
            loading={isPending}
          >
            {isPending ? 'Saving…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)', lineHeight: 'var(--leading-normal)', margin: 0 }}>
          {description}
        </p>

        {/* Reason picker — inline rows, no portal, no overflow clipping */}
        <div style={{ opacity: isPending ? 0.6 : 1, pointerEvents: isPending ? 'none' : 'auto' }}>
          <span style={microLabelStyle}>
            Reason <span style={{ color: 'var(--color-danger)' }}>*</span>
          </span>
          <div
            style={{
              display:       'flex',
              flexDirection: 'column',
              gap:           'var(--space-1)',
            }}
          >
            {reasonItems.map((item) => {
              const active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected([item.id])}
                  style={{
                    display:      'flex',
                    alignItems:   'center',
                    gap:          'var(--space-3)',
                    width:        '100%',
                    padding:      'var(--space-2) var(--space-3)',
                    background:   active ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
                    border:       `1px solid ${active ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor:       'pointer',
                    transition:   'var(--transition-hover)',
                    textAlign:    'left',
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-sm)',
                    fontWeight:   'var(--weight-medium)',
                    color:        active ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
                  }}
                >
                  {/* Radio dot */}
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink:     0,
                      width:          16,
                      height:         16,
                      borderRadius:   'var(--radius-full)',
                      border:         `1.5px solid ${active ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                    }}
                  >
                    {active && (
                      <span style={{
                        width:        7,
                        height:       7,
                        borderRadius: 'var(--radius-full)',
                        background:   'var(--theme-accent)',
                        display:      'block',
                      }} />
                    )}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Textarea — optional unless 'Other' is selected (§7.4 auto-grow spec) */}
        <div>
          <span style={microLabelStyle}>
            {isOther ? (
              <>Note <span style={{ color: 'var(--color-danger)' }}>*</span></>
            ) : (
              'Note (optional)'
            )}
          </span>
          <textarea
            ref={textareaRef}
            value={noteText}
            onInput={handleTextareaInput}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={isOther ? 'Describe why (required)' : 'Add a note (optional)'}
            disabled={isPending}
            rows={3}
            style={{
              width:        '100%',
              minHeight:    '80px',
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
              transition:   'height var(--duration-base) var(--ease-out-soft), border-color var(--duration-fast) var(--ease-in-out)',
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

        {(localError ?? error) && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
            {localError ?? error}
          </p>
        )}
      </div>
    </Modal>
  );
}
