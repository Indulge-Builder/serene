'use client';

// VendorNotesCard — the vendor's notes, newest first, plus the composer.
//
// Many notes per vendor, each keeping who wrote it and when (migration 0186) —
// the lead-notes shape. Append-only: a correction is a new note, never an edit.
// The composer posts optimistically and reconciles from the action's returned
// row, so a slow round trip never leaves the note looking lost.

import { useOptimistic, useRef, useState, useTransition } from 'react';
import { PenLine } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { CardHeader } from '@/components/leads/CardHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { addVendorNoteAction } from '@/lib/actions/vendors';
import { formatDate } from '@/lib/utils/dates';
import { VENDOR_NOTE_MAX_LENGTH } from '@/lib/constants/vendors';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { VendorNoteWithAuthor } from '@/lib/types/vendor';

type DisplayNote = VendorNoteWithAuthor & { pending?: boolean };

export function VendorNotesCard({
  vendorId,
  notes,
  currentUserName,
}: {
  vendorId: string;
  notes: VendorNoteWithAuthor[];
  currentUserName: string;
}) {
  const [committed, setCommitted] = useState<DisplayNote[]>(notes);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [display, addOptimistic] = useOptimistic(
    committed,
    (current, incoming: DisplayNote) => [incoming, ...current],
  );

  function submit() {
    const content = draft.trim();
    if (!content || isPending) return;
    setError(null);

    startTransition(async () => {
      addOptimistic({
        id: `optimistic-${Date.now()}`,
        vendor_id: vendorId,
        author_id: '',
        content,
        created_at: new Date().toISOString(),
        author: { full_name: currentUserName },
        pending: true,
      });

      const result = await addVendorNoteAction({ vendor_id: vendorId, content });
      if (result.error || !result.data) {
        // The optimistic row is discarded when the transition ends; the draft is
        // deliberately NOT cleared, so nothing the user typed is ever lost.
        setError(result.error ?? 'Could not add that note.');
        return;
      }
      setCommitted((prev) => [{ ...result.data!, author: { full_name: currentUserName } }, ...prev]);
      setDraft('');
    });
  }

  return (
    <div
      style={{
        background: 'var(--theme-paper)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      <CardHeader
        icon={PenLine}
        label="Notes"
        right={
          display.length > 0 ? (
            <span
              style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}
            >
              {display.length}
            </span>
          ) : undefined
        }
      />

      {display.length === 0 ? (
        <div style={{ padding: 'var(--space-8) var(--space-6) var(--space-4)' }}>
          <EmptyState variant="inline" title="Nothing noted yet." />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {display.map((note) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: note.pending ? 0.6 : 1, y: 0 }}
              transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                padding: 'var(--space-4) var(--space-6)',
                borderBottom: '1px solid var(--theme-paper-border)',
              }}
            >
              <Avatar name={note.author?.full_name ?? 'Unknown'} size="sm" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-1)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>
                    {note.author?.full_name ?? 'Unknown'}
                  </span>
                  <time
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}
                    dateTime={note.created_at}
                  >
                    {note.pending ? 'Saving…' : formatDate(note.created_at, 'd MMM, h:mm a')}
                  </time>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-sm)',
                    color: 'var(--theme-text-primary)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {note.content}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div
        style={{
          padding: 'var(--space-4) var(--space-6) var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          }}
          maxLength={VENDOR_NOTE_MAX_LENGTH}
          placeholder="Add a note about this vendor."
          className="serene-input neu-input"
          rows={3}
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: '76px',
            padding: 'var(--space-3) var(--space-4)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            color: 'var(--theme-text-primary)',
            outline: 'none',
          }}
        />
        {error && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>{error}</span>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            onClick={submit}
            disabled={draft.trim().length === 0}
            loading={isPending}
            loadingLabel="Adding…"
          >
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}
