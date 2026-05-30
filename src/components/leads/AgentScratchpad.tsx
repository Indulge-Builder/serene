'use client';

import { useCallback, useRef, useState } from 'react';
import { PenLine, Check } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { updateScratchpad } from '@/lib/actions/leads';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  leadId: string;
  initialContent: string;
  canEdit: boolean;
};

export function AgentScratchpad({ leadId, initialContent, canEdit }: Props) {
  const [content, setContent]     = useState(initialContent);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (text: string) => {
    setSaveState('saving');
    const result = await updateScratchpad({ leadId, content: text });
    setSaveState(result.error ? 'error' : 'saved');
    // Reset to idle after 2s
    setTimeout(() => setSaveState('idle'), 2000);
  }, [leadId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);
    if (!canEdit) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(text), 1000);
  };

  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        overflow:     'hidden',
        flex:         1,
        display:      'flex',
        flexDirection:'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          padding:      'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper-subtle)',
        }}
      >
        <PenLine
          style={{
            width:       '0.875rem',
            height:      '0.875rem',
            color:       'var(--theme-text-tertiary)',
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
            color:         'var(--theme-text-tertiary)',
          }}
        >
          Private Scratchpad
        </span>

        {/* Save indicator */}
        <span style={{ marginLeft: 'auto' }}>
          {saveState === 'saving' && (
            <Spinner size="sm" />
          )}
          {saveState === 'saved' && (
            <Check
              style={{
                width:       '0.75rem',
                height:      '0.75rem',
                color:       'var(--color-success)',
                strokeWidth: 2,
              }}
            />
          )}
          {saveState === 'error' && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>
              Not saved
            </span>
          )}
        </span>
      </div>

      {/* Textarea */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {canEdit ? (
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="Your private notes on this lead. Only you can see this."
            style={{
              flex:        1,
              minHeight:   '80px',
              padding:     'var(--space-4) var(--space-5)',
              border:      'none',
              outline:     'none',
              resize:      'vertical',
              background:  'var(--theme-paper)',
              fontFamily:  'var(--font-sans)',
              fontSize:    'var(--text-sm)',
              color:       'var(--theme-text-primary)',
              lineHeight:  'var(--leading-relaxed)',
            }}
          />
        ) : (
          <div
            style={{
              flex:       1,
              padding:    'var(--space-4) var(--space-5)',
              background: 'var(--theme-paper-subtle)',
            }}
          >
            {content ? (
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-secondary)',
                  lineHeight: 'var(--leading-relaxed)',
                  margin:     0,
                }}
              >
                {content}
              </p>
            ) : (
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-tertiary)',
                  fontStyle:  'italic',
                  margin:     0,
                }}
              >
                No scratchpad content.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer note */}
      {canEdit && (
        <div
          style={{
            padding:       'var(--space-2) var(--space-5)',
            borderTop:     '1px solid var(--theme-paper-border)',
            background:    'var(--theme-paper-subtle)',
          }}
        >
          <p
            style={{
              fontSize:  'var(--text-xs)',
              color:     'var(--theme-text-tertiary)',
              margin:    0,
            }}
          >
            Saves automatically. Cleared on reassignment.
          </p>
        </div>
      )}
    </div>
  );
}
