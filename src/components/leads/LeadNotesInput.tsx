'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Send } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { DictationButton } from '@/components/ui/DictationButton';
import { CardHeader } from '@/components/leads/CardHeader';
import { addLeadNote } from '@/lib/actions/leads';

type Props = {
  leadId: string;
  canAdd: boolean;
  onNoteAdded?: () => void;
};

export function LeadNotesInput({ leadId, canAdd, onNoteAdded }: Props) {
  const [content, setContent]     = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dictationBusy, setDictationBusy] = useState(false);  // recording OR transcribing
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const router                    = useRouter();

  // Voice dictation — the transcript lands here as an editable draft only.
  // Saving always goes through the same addLeadNote submit as a typed note.
  // The mic/stop/cancel cluster + record→transcribe flow live in DictationButton.
  const handleTranscript = (text: string) => {
    setError(null);
    setContent(prev => (prev.trim() ? `${prev.replace(/\s+$/, '')} ${text}` : text));
    textareaRef.current?.focus();
  };

  const isBusy = isPending || dictationBusy;

  const handleSubmit = () => {
    if (!content.trim() || isBusy) return;
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
      {/* Accent-surface variant of the shared strip — deltas via the style merges */}
      <CardHeader
        icon={BookOpen}
        label="Notes"
        style={{
          borderBottom: '1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent)',
          background:   'var(--theme-accent-surface)',
        }}
        iconStyle={{ color: 'var(--theme-accent)' }}
        labelStyle={{ color: 'var(--theme-accent)' }}
      />

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
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color:    'var(--theme-text-tertiary)',
                  margin:   0,
                }}
              >
                ⌘ + Enter to submit
              </p>

              <span
                style={{
                  display:    'inline-flex',
                  alignItems: 'center',
                  gap:        'var(--space-2)',
                }}
              >
              <DictationButton
                variant="inline"
                what="a note"
                onTranscript={handleTranscript}
                onError={(message) => setError(message)}
                onBusyChange={setDictationBusy}
              />

              <button
                onClick={handleSubmit}
                disabled={!content.trim() || isBusy}
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  gap:            'var(--space-2)',
                  padding:        'var(--space-2) var(--space-4)',
                  borderRadius:   'var(--radius-md)',
                  border:         '1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)',
                  background:     content.trim() && !isBusy
                    ? 'var(--theme-accent-surface)'
                    : 'transparent',
                  color:          'var(--theme-accent)',
                  fontSize:       'var(--text-xs)',
                  fontWeight:     'var(--weight-medium)',
                  cursor:         content.trim() && !isBusy ? 'pointer' : 'not-allowed',
                  opacity:        content.trim() && !isBusy ? 1 : 0.45,
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
