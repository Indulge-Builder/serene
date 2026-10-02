'use client';
// ElayaReplyCorrectDialog — "Correct this reply" on the admin chats page (2026-09-29): what kind of
// wrong it was and what the right answer is. Saving files an improvement request (the Requests
// queue), which Elaya reads as a known issue on every message until someone resolves it there.
// Form state only (A-06); the write is flagElayaReplyAction. Loaded on first open (the heavy-modal
// rule): the caller mounts it through next/dynamic behind useMountOnFirstOpen.
import { useState, useTransition } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { FormSelect } from '@/components/ui/FormSelect';
import { ChatMarkdown } from '@/components/ui/ChatMarkdown';
import { toast } from '@/lib/toast';
import { flagElayaReplyAction } from '@/lib/actions/elaya-chats';
import { ELAYA_REQUEST_KIND_LABELS, ELAYA_REQUEST_KINDS, type ElayaRequestKind } from '@/lib/constants/elaya-memory';

export type CorrectTarget = { messageId: string; reply: string; personName: string };

export function ElayaReplyCorrectDialog({
  target,
  onClose,
  onSaved,
}: {
  target: CorrectTarget | null;
  onClose: () => void;
  onSaved: (messageId: string, kind: ElayaRequestKind) => void;
}) {
  const [kind, setKind] = useState<ElayaRequestKind>('wrong_answer');
  const [correction, setCorrection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    if (pending) return;
    setError(null);
    onClose();
  }

  function save() {
    if (!target) return;
    setError(null);
    start(async () => {
      const res = await flagElayaReplyAction({ message_id: target.messageId, kind, correction });
      // Keep what they typed on an error (never clear a field on a failed save).
      if (res.error) { setError(res.error); return; }
      toast.success('Correction saved. Elaya reads it as a known issue from the next message.');
      onSaved(target.messageId, kind);
      setCorrection('');
      setKind('wrong_answer');
      onClose();
    });
  }

  return (
    <Dialog
      open={target !== null}
      onClose={close}
      pending={pending}
      title="Correct this reply"
      description={target ? `Elaya's reply to ${target.personName}. It goes to the Requests queue, where you mark it fixed.` : undefined}
      size="md"
      error={error}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={pending} disabled={pending || correction.trim().length < 3}>
            Save correction
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {target && (
          <div style={{
            maxHeight: 220,
            overflowY: 'auto',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--neu-surface-high)',
            boxShadow: 'var(--neu-shadow-chip)',
            fontSize: 'var(--text-sm)',
            lineHeight: 'var(--leading-relaxed)',
            color: 'var(--theme-text-primary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            <ChatMarkdown content={target.reply} />
          </div>
        )}
        <Field label="What went wrong">
          <FormSelect value={kind} onValueChange={(v) => setKind(v as ElayaRequestKind)}>
            {ELAYA_REQUEST_KINDS.map((k) => <option key={k} value={k}>{ELAYA_REQUEST_KIND_LABELS[k]}</option>)}
          </FormSelect>
        </Field>
        <Field label="What she should have said" hint="Write it the way you would tell her. She reads this, not the reply above." required>
          <Textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="The right answer, or what she should have done instead."
          />
        </Field>
      </div>
    </Dialog>
  );
}
