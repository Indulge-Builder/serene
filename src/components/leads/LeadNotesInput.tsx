'use client';

import { Button } from '@/components/ui/Button';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Send } from 'lucide-react';
import { SeedMandala } from '@/components/ui/SeedMandala';
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
        borderRadius:  'var(--neu-radius-card)',
        boxShadow:     'var(--shadow-1)',
        overflow:      'hidden',
        display:       'flex',
        flexDirection: 'column',
        flex:          1,
      }}
    >
      {/* The accent-surface treatment this card pioneered is CardHeader's
          default now (2026-07-03) — no overrides needed. */}
      <CardHeader icon={BookOpen} label="Notes" />

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

              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={!content.trim() || isBusy}
              >
                {isPending ? (
                  <SeedMandala size={14} variant="currentColor" spin={3.5} />
                ) : (
                  <Send style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
                )}
                Post note
              </Button>
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
