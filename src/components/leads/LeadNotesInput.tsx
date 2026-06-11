'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Mic, Send, Square, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { addLeadNote } from '@/lib/actions/leads';
import { transcribeAudioAction } from '@/lib/actions/transcription';
import {
  useAudioRecorder,
  formatRecorderElapsed as formatElapsed,
  DEFAULT_MAX_RECORDING_MS as MAX_RECORDING_MS,
} from '@/hooks/useAudioRecorder';

type Props = {
  leadId: string;
  canAdd: boolean;
  onNoteAdded?: () => void;
};

export function LeadNotesInput({ leadId, canAdd, onNoteAdded }: Props) {
  const [content, setContent]     = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const router                    = useRouter();

  // Voice dictation — the transcript lands here as an editable draft only.
  // Saving always goes through the same addLeadNote submit as a typed note.
  const recorder = useAudioRecorder({
    maxDurationMs: MAX_RECORDING_MS,
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
      setContent(prev => (prev.trim() ? `${prev.replace(/\s+$/, '')} ${text}` : text));
      textareaRef.current?.focus();
    },
  });

  const isBusy = isPending || isTranscribing;

  const handleSubmit = () => {
    if (!content.trim() || isBusy || recorder.isRecording) return;
    setError(null);

    startTransition(async () => {
      const result = await addLeadNote({ leadId, content: content.trim() });
      if (result.error) {
        setError(result.error);
        return;
      }
      setContent('');
      textareaRef.current?.focus();
      router.refresh();
      onNoteAdded?.();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        background:    'var(--theme-paper)',
        border:        '1px solid var(--theme-paper-border)',
        borderRadius:  'var(--radius-lg)',
        boxShadow:     'var(--shadow-1)',
        overflow:      'hidden',
        display:       'flex',
        flexDirection: 'column',
        flex:          1,
      }}
    >
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          padding:      'var(--space-4) var(--space-5)',
          borderBottom: '1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent)',
          background:   'var(--theme-accent-surface)',
        }}
      >
        <BookOpen
          style={{
            width:       '0.875rem',
            height:      '0.875rem',
            color:       'var(--theme-accent)',
            strokeWidth: 1.5,
            flexShrink:  0,
          }}
        />
        <span
          style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         'var(--theme-accent)',
          }}
        >
          Notes
        </span>
      </div>

      {/* Input area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {canAdd ? (
          <>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a note for the team…"
              disabled={isPending}
              style={{
                flex:       1,
                minHeight:  '80px',
                padding:    'var(--space-4) var(--space-5)',
                border:     'none',
                outline:    'none',
                resize:     'vertical',
                background: 'var(--theme-paper)',
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-sm)',
                color:      'var(--theme-text-primary)',
                lineHeight: 'var(--leading-relaxed)',
                opacity:    isPending ? 0.6 : 1,
              }}
            />

            {error && (
              <p
                style={{
                  padding:    '0 var(--space-5) var(--space-2)',
                  fontSize:   'var(--text-xs)',
                  color:      'var(--color-danger-text)',
                  margin:     0,
                }}
              >
                {error}
              </p>
            )}

            {/* Footer: hint + submit */}
            <div
              style={{
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'space-between',
                padding:      'var(--space-3) var(--space-5)',
                borderTop:    '1px solid var(--theme-paper-border)',
                background:   'var(--theme-paper-subtle)',
              }}
            >
              {recorder.isRecording ? (
                <span
                  style={{
                    display:    'inline-flex',
                    alignItems: 'center',
                    gap:        'var(--space-2)',
                  }}
                >
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
              ) : isTranscribing ? (
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
              ) : (
                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color:    'var(--theme-text-tertiary)',
                    margin:   0,
                  }}
                >
                  ⌘ + Enter to submit
                </p>
              )}

              <span
                style={{
                  display:    'inline-flex',
                  alignItems: 'center',
                  gap:        'var(--space-2)',
                }}
              >
              {recorder.isSupported && recorder.isRecording && (
                <button
                  onClick={recorder.cancel}
                  aria-label="Discard recording"
                  title="Discard recording"
                  style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    width:        '28px',
                    height:       '28px',
                    borderRadius: 'var(--radius-md)',
                    border:       '1px solid var(--theme-paper-border)',
                    background:   'transparent',
                    color:        'var(--theme-text-tertiary)',
                    cursor:       'pointer',
                  }}
                >
                  <X style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
                </button>
              )}

              {recorder.isSupported && (
                <button
                  onClick={recorder.isRecording ? recorder.stop : recorder.start}
                  disabled={isBusy || recorder.status === 'requesting'}
                  aria-label={recorder.isRecording ? 'Stop recording and transcribe' : 'Dictate a note'}
                  title={recorder.isRecording ? 'Stop & transcribe' : 'Dictate a note'}
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

              <button
                onClick={handleSubmit}
                disabled={!content.trim() || isBusy || recorder.isRecording}
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  gap:            'var(--space-2)',
                  padding:        'var(--space-2) var(--space-4)',
                  borderRadius:   'var(--radius-md)',
                  border:         '1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)',
                  background:     content.trim() && !isBusy && !recorder.isRecording
                    ? 'var(--theme-accent-surface)'
                    : 'transparent',
                  color:          'var(--theme-accent)',
                  fontSize:       'var(--text-xs)',
                  fontWeight:     'var(--weight-medium)',
                  cursor:         content.trim() && !isBusy && !recorder.isRecording ? 'pointer' : 'not-allowed',
                  opacity:        content.trim() && !isBusy && !recorder.isRecording ? 1 : 0.45,
                  transition:     'opacity 150ms, background 150ms',
                }}
              >
                {isPending ? (
                  <Spinner size="sm" />
                ) : (
                  <Send style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
                )}
                Post note
              </button>
              </span>
            </div>
          </>
        ) : (
          <div
            style={{
              flex:       1,
              padding:    'var(--space-5)',
              background: 'var(--theme-paper-subtle)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-sm)',
                color:      'var(--theme-text-tertiary)',
                fontStyle:  'italic',
                margin:     0,
              }}
            >
              Notes can only be added by the assigned agent, manager, or admin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
