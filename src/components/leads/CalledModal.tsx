'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { DictationButton } from '@/components/ui/DictationButton';
import { useRouter } from 'next/navigation';
import { addLeadCallNote, createLeadTaskAction } from '@/lib/actions/leads';
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { TASK_TYPES, TASK_TYPE_LABELS } from '@/lib/constants/task-types';
import { formErrors } from '@/lib/validations/form-errors';
import { Modal } from '@/components/ui/modal';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import type { CallOutcome, TaskType } from '@/lib/types/database';

const OUTCOME_ITEMS = CALL_OUTCOMES.map((o) => ({
  id:    o,
  label: CALL_OUTCOME_LABELS[o],
}));

// Chip button for task type selection
function TypeChip({
  label,
  active,
  onClick,
}: {
  label:   string;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding:      'var(--space-1) var(--space-3)',
        borderRadius: 'var(--radius-full)',
        border:       active
          ? '1px solid var(--theme-accent)'
          : '1px solid var(--theme-paper-border)',
        background:   active ? 'var(--theme-accent-surface)' : 'var(--theme-paper)',
        color:        active ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
        fontSize:     'var(--text-xs)',
        fontWeight:   'var(--weight-medium)',
        cursor:       'pointer',
        whiteSpace:   'nowrap',
        transition:   'all var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {label}
    </button>
  );
}

type Props = {
  leadId:  string;
  onClose: () => void;
};

export function CalledModal({ leadId, onClose }: Props) {
  const router                           = useRouter();
  const [isPending, startTransition]     = useTransition();
  const [outcome, setOutcome]            = useState<CallOutcome | ''>('');
  const [note, setNote]                  = useState('');
  const [error, setError]                = useState<string | null>(null);

  // Next-step task fields
  const [taskType, setTaskType]  = useState<TaskType>('call');
  const [dueAt, setDueAt]        = useState<Date | null>(null);

  // Voice dictation — same stack as LeadNotesInput: transcript lands in the
  // note textarea as an editable draft, saved through the unchanged
  // addLeadCallNote path. The mic/stop/cancel cluster + record→transcribe flow
  // live in DictationButton. Closing the modal mid-recording unmounts that
  // component; useAudioRecorder's unmount cleanup discards the take and
  // releases the mic track.
  const [dictationBusy, setDictationBusy] = useState(false);  // recording OR transcribing
  const handleTranscript = (text: string) => {
    setError(null);
    setNote(prev => (prev.trim() ? `${prev.replace(/\s+$/, '')} ${text}` : text));
  };

  const isBusy = isPending || dictationBusy;

  const outcomeLabel = useMemo(
    () => (outcome ? CALL_OUTCOME_LABELS[outcome] : 'Select outcome…'),
    [outcome],
  );

  function validate(logTask = false): boolean {
    if (!outcome) {
      setError('Please select a call outcome.');
      return false;
    }
    if (!note.trim()) {
      setError(formErrors.required);
      return false;
    }
    if (logTask && !dueAt) {
      setError('Pick a due date and time for the follow-up task.');
      return false;
    }
    if (logTask && dueAt && dueAt.getTime() <= Date.now()) {
      setError('Pick a future date and time for the follow-up task.');
      return false;
    }
    return true;
  }

  // Left button — log call note only, no task
  function handleLogOnly() {
    setError(null);
    if (!validate()) return;

    startTransition(async () => {
      const result = await addLeadCallNote({
        leadId,
        content:     note,
        callOutcome: outcome as CallOutcome,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
      onClose();
    });
  }

  // Right button — log call note AND create follow-up task
  function handleLogWithTask() {
    setError(null);
    if (!validate(true)) return;

    const dueAtIso = dueAt!.toISOString();

    startTransition(async () => {
      // Step 1: log the call note
      const noteResult = await addLeadCallNote({
        leadId,
        content:     note,
        callOutcome: outcome as CallOutcome,
      });

      if (noteResult.error) {
        setError(noteResult.error);
        return;
      }

      // Step 2: create follow-up task (due required — schedules in-app reminder at due time)
      const taskResult = await createLeadTaskAction({
        leadId,
        taskType,
        priority: 'normal',
        dueAt:    dueAtIso,
      });

      if (taskResult.error) {
        setError(
          'Call logged, but the follow-up task could not be saved. Try again from Gia Tasks.',
        );
        router.refresh();
        return;
      }

      router.refresh();
      onClose();
    });
  }

  const fieldLabelStyle: React.CSSProperties = {
    display:       'block',
    fontSize:      'var(--text-2xs)',
    fontWeight:    'var(--weight-semibold)',
    letterSpacing: 'var(--tracking-widest)',
    textTransform: 'uppercase',
    color:         'var(--theme-text-tertiary)',
    marginBottom:  'var(--space-2)',
  };

  const modalTitle: ReactNode = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <Phone
        style={{
          width:       '1rem',
          height:      '1rem',
          color:       'var(--theme-accent)',
          strokeWidth: 1.5,
          flexShrink:  0,
        }}
        aria-hidden
      />
      Log a call
    </span>
  );

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={modalTitle}
      maxWidth="max-w-lg"
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-3)', width: '100%', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            type="button"
            onClick={handleLogOnly}
            disabled={isBusy}
            loading={isPending}
          >
            Log Update
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleLogWithTask}
            disabled={isBusy}
            loading={isPending}
            style={{ boxShadow: 'var(--shadow-accent-glow)' }}
          >
            Log Update + Task
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

        {/* Call outcome */}
        <div>
          <span id="call-outcome-label" style={fieldLabelStyle}>
            Call outcome <span style={{ color: 'var(--color-danger)' }}>*</span>
          </span>
          <div
            aria-labelledby="call-outcome-label"
            style={{ opacity: isPending ? 0.6 : 1, pointerEvents: isPending ? 'none' : 'auto' }}
          >
            <FilterDropdown
              label={outcomeLabel}
              items={OUTCOME_ITEMS}
              selected={outcome ? [outcome] : []}
              onChange={(next) => setOutcome((next[0] ?? '') as CallOutcome | '')}
              style={{ width: '100%', display: 'flex' }}
            />
          </div>
        </div>

        {/* Note */}
        <div>
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            'var(--space-2)',
              marginBottom:   'var(--space-2)',
            }}
          >
            <label htmlFor="call-note" style={{ ...fieldLabelStyle, marginBottom: 0 }}>
              Note <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>

            {/* Voice dictation cluster — shared DictationButton (inline variant) */}
            <DictationButton
              variant="inline"
              what="the note"
              onTranscript={handleTranscript}
              onError={(message) => setError(message)}
              onBusyChange={setDictationBusy}
            />
          </div>
          <textarea
            id="call-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened on this call? What did you discuss?"
            disabled={isPending}
            rows={3}
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
              transition:   'var(--transition-hover)',
              boxSizing:    'border-box',
              fontFamily:   'var(--font-sans)',
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

        {/* Follow-up task (optional — Log Update + Task) */}
        <div
          style={{
            borderTop:  '1px solid var(--theme-paper-border)',
            paddingTop: 'var(--space-4)',
          }}
        >
          {/* Task type chips */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <span style={fieldLabelStyle}>Follow-up type</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {TASK_TYPES.map((type) => (
                <TypeChip
                  key={type}
                  label={TASK_TYPE_LABELS[type]}
                  active={taskType === type}
                  onClick={() => setTaskType(type)}
                />
              ))}
            </div>
          </div>

          {/* Due date + time — required for Log Update + Task (drives Trigger.dev reminder) */}
          <div>
            <span style={fieldLabelStyle}>
              Due date &amp; time <span style={{ color: 'var(--color-danger)' }}>*</span>
            </span>
            <DatePicker
              value={dueAt}
              onChange={setDueAt}
              showTime
              placeholder="Pick a date and time…"
              disabled={isPending}
            />
            <p
              style={{
                margin:     'var(--space-2) 0 0',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
                lineHeight: 'var(--leading-relaxed)',
              }}
            >
              Assignee gets an in-app notification when this date and time is reached.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
