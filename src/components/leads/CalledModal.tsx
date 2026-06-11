'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { Mic, Phone, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Spinner } from '@/components/ui/Spinner';
import { useRouter } from 'next/navigation';
import { addLeadCallNote, createLeadTaskAction } from '@/lib/actions/leads';
import { transcribeAudioAction } from '@/lib/actions/transcription';
import {
  useAudioRecorder,
  formatRecorderElapsed as formatElapsed,
  DEFAULT_MAX_RECORDING_MS as MAX_RECORDING_MS,
} from '@/hooks/useAudioRecorder';
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
  // addLeadCallNote path. Closing the modal mid-recording unmounts this
  // component; useAudioRecorder's unmount cleanup discards the take and
  // releases the mic track.
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorder = useAudioRecorder({
    onError: (message) => setError(message),
    onComplete: async ({ blob }) => {
      setIsTranscribing(true);
      setError(null);
      const formData = new FormData();
      formData.append('audio', blob, 'voice-note');
      const result = await transcribeAudioAction(formData);
      setIsTranscribing(false);
      if (result.error || !result.data) {
        setError(result.error);
        return;
      }
      const text = result.data.text;
      if (!text) {
        setError("Couldn't hear anything in that recording. Please try again.");
        return;
      }
      setNote(prev => (prev.trim() ? `${prev.replace(/\s+$/, '')} ${text}` : text));
    },
  });

  const isBusy = isPending || isTranscribing;

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
            disabled={isBusy || recorder.isRecording}
            loading={isPending}
          >
            Log Update
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleLogWithTask}
            disabled={isBusy || recorder.isRecording}
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

            {/* Voice dictation cluster — mirrors LeadNotesInput */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {recorder.isRecording && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      width:        '8px',
                      height:       '8px',
                      borderRadius: 'var(--radius-full)',
                      background:   'var(--color-danger)',
                      flexShrink:   0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize:   'var(--text-xs)',
                      color:      'var(--theme-text-secondary)',
                    }}
                  >
                    {formatElapsed(recorder.elapsedMs)} / {formatElapsed(MAX_RECORDING_MS)}
                  </span>
                </span>
              )}
              {isTranscribing && (
                <span
                  style={{
                    display:    'inline-flex',
                    alignItems: 'center',
                    gap:        'var(--space-2)',
                    fontSize:   'var(--text-xs)',
                    color:      'var(--theme-text-tertiary)',
                  }}
                >
                  <Spinner size="sm" />
                  Transcribing…
                </span>
              )}
              {recorder.isSupported && recorder.isRecording && (
                <button
                  type="button"
                  onClick={recorder.cancel}
                  aria-label="Discard recording"
                  title="Discard recording"
                  style={{
                    display:        'inline-flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    width:          '28px',
                    height:         '28px',
                    borderRadius:   'var(--radius-md)',
                    border:         '1px solid var(--theme-paper-border)',
                    background:     'transparent',
                    color:          'var(--theme-text-tertiary)',
                    cursor:         'pointer',
                  }}
                >
                  <X style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
                </button>
              )}
              {recorder.isSupported && (
                <button
                  type="button"
                  onClick={recorder.isRecording ? recorder.stop : recorder.start}
                  disabled={isBusy || recorder.status === 'requesting'}
                  aria-label={recorder.isRecording ? 'Stop recording and transcribe' : 'Dictate the note'}
                  title={recorder.isRecording ? 'Stop & transcribe' : 'Dictate the note'}
                  style={{
                    display:        'inline-flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    width:          '28px',
                    height:         '28px',
                    borderRadius:   'var(--radius-md)',
                    border:         recorder.isRecording
                      ? '1px solid color-mix(in srgb, var(--color-danger) 40%, transparent)'
                      : '1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)',
                    background:     recorder.isRecording ? 'var(--color-danger-light)' : 'transparent',
                    color:          recorder.isRecording ? 'var(--color-danger-text)' : 'var(--theme-accent)',
                    cursor:         isBusy ? 'not-allowed' : 'pointer',
                    opacity:        isBusy ? 0.45 : 1,
                    transition:     'opacity 150ms, background 150ms, border-color 150ms',
                  }}
                >
                  {recorder.isRecording ? (
                    <Square style={{ width: '0.7rem', height: '0.7rem', strokeWidth: 1.5, fill: 'currentColor' }} />
                  ) : (
                    <Mic style={{ width: '0.8rem', height: '0.8rem', strokeWidth: 1.5 }} />
                  )}
                </button>
              )}
            </span>
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
