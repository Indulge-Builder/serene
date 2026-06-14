'use client';

// THE voice-dictation cluster — record → transcribe → hand the text back as an
// editable draft. The ONE place the mic/stop/cancel buttons, the m:ss elapsed
// counter and the "Transcribing…" indicator are expressed. Wraps the shared
// `useAudioRecorder` hook (codec negotiation, 2-min auto-stop, mic-track
// release) + `transcribeAudioAction` (Deepgram Nova-3 multilingual). Audio only
// ever exists as an in-memory Blob handed to the action — never persisted here.
//
// Two geometries, one behaviour:
//   variant="composer" — 32px pill buttons, sits as a <MessageBar leadingSlot>
//                         (Elaya chat, WhatsApp conversation composer).
//   variant="inline"   — 28px bordered buttons, sits in a form footer / label row
//                         (LeadNotesInput footer, CalledModal Note label row).
//
// It NEVER auto-sends: the transcript is appended to the consumer's draft via
// onTranscript(text); the consumer reviews and submits through its own path, so
// a garbled transcript can never reach a send/save unreviewed. Errors flow out
// through onError so each consumer keeps its own surface (toast vs inline).
//
// Renders null when MediaRecorder is unsupported — consumers may render their
// own affordances conditionally on `recorder.isSupported` only if they need the
// recording flag; most just mount this and let it hide itself.

import { Mic, Square, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { transcribeAudioAction } from '@/lib/actions/transcription';
import {
  useAudioRecorder,
  formatRecorderElapsed,
  DEFAULT_MAX_RECORDING_MS,
} from '@/hooks/useAudioRecorder';
import { useEffect, useState } from 'react';

const TRANSCRIPTION_EMPTY_MESSAGE =
  "Couldn't catch that — try again, or type it.";

export interface DictationButtonProps {
  /** Receives the transcribed text. The consumer appends it to its own draft. */
  onTranscript: (text: string) => void;
  /** Surfaced for recorder + transcription errors. Consumer picks toast vs inline. */
  onError?: (message: string) => void;
  /** Disable record (still allows stop while recording). */
  disabled?: boolean;
  /** `composer` — 32px pill (MessageBar leadingSlot). `inline` — 28px bordered (form footer). */
  variant?: 'composer' | 'inline';
  /** aria-label / title verb. Default "a message". e.g. "the note". */
  what?: string;
  /**
   * Fired with `true` while recording OR transcribing, `false` otherwise.
   * For consumers that must gate a submit/save while a take is in flight
   * (LeadNotesInput, CalledModal). Composer consumers ignore it — Enter-to-send
   * is already gated by the recorder being mid-take.
   */
  onBusyChange?: (busy: boolean) => void;
}

export function DictationButton({
  onTranscript,
  onError,
  disabled = false,
  variant = 'composer',
  what = 'a message',
  onBusyChange,
}: DictationButtonProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);

  const recorder = useAudioRecorder({
    onError: (message) => onError?.(message),
    onComplete: async ({ blob }) => {
      setIsTranscribing(true);
      const formData = new FormData();
      formData.append('audio', blob, 'voice-note');
      const result = await transcribeAudioAction(formData);
      setIsTranscribing(false);
      if (result.error || !result.data) {
        onError?.(result.error ?? TRANSCRIPTION_EMPTY_MESSAGE);
        return;
      }
      const text = result.data.text;
      if (!text) {
        onError?.(TRANSCRIPTION_EMPTY_MESSAGE);
        return;
      }
      onTranscript(text);
    },
  });

  const busy = recorder.isRecording || isTranscribing;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  if (!recorder.isSupported) return null;

  const isComposer = variant === 'composer';
  // While transcribing the take is captured but the record button is busy;
  // while recording it must stay enabled (it becomes Stop). disabled only
  // blocks the *start* edge.
  const startBlocked =
    disabled || isTranscribing || recorder.status === 'requesting';

  const btnSize = isComposer ? 32 : 28;
  const sq = `${btnSize}px`;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        flexShrink: 0,
      }}
    >
      {recorder.isRecording && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-danger)',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xs)',
              color: 'var(--theme-text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatRecorderElapsed(recorder.elapsedMs)} / {formatRecorderElapsed(DEFAULT_MAX_RECORDING_MS)}
          </span>
        </span>
      )}

      {isTranscribing && <Spinner size="sm" />}

      {recorder.isRecording && (
        <button
          type="button"
          onClick={recorder.cancel}
          aria-label="Discard recording"
          title="Discard recording"
          className="serene-pressable"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: sq,
            height: sq,
            borderRadius: isComposer ? 'var(--radius-sm)' : 'var(--radius-md)',
            border: isComposer ? 'none' : '1px solid var(--theme-paper-border)',
            background: 'transparent',
            color: 'var(--theme-text-tertiary)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <X style={{ width: '0.85rem', height: '0.85rem', strokeWidth: 1.5 }} />
        </button>
      )}

      <button
        type="button"
        onClick={recorder.isRecording ? recorder.stop : recorder.start}
        disabled={recorder.isRecording ? false : startBlocked}
        aria-label={recorder.isRecording ? 'Stop recording and transcribe' : `Dictate ${what}`}
        title={recorder.isRecording ? 'Stop & transcribe' : `Dictate ${what}`}
        className="serene-pressable"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: sq,
          height: sq,
          borderRadius: isComposer ? 'var(--radius-sm)' : 'var(--radius-md)',
          border: isComposer
            ? 'none'
            : recorder.isRecording
              ? '1px solid color-mix(in srgb, var(--color-danger) 40%, transparent)'
              : '1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)',
          background: recorder.isRecording
            ? 'var(--color-danger-light)'
            : 'transparent',
          color: recorder.isRecording
            ? 'var(--color-danger-text)'
            : 'var(--theme-accent)',
          cursor: startBlocked && !recorder.isRecording ? 'not-allowed' : 'pointer',
          opacity: startBlocked && !recorder.isRecording ? 0.45 : 1,
          flexShrink: 0,
          transition: 'opacity 150ms, background 150ms, border-color 150ms',
        }}
      >
        {recorder.isRecording ? (
          <Square style={{ width: '0.7rem', height: '0.7rem', strokeWidth: 1.5, fill: 'currentColor' }} />
        ) : (
          <Mic style={{ width: isComposer ? '0.9rem' : '0.8rem', height: isComposer ? '0.9rem' : '0.8rem', strokeWidth: 1.5 }} />
        )}
      </button>
    </span>
  );
}

DictationButton.displayName = 'DictationButton';
