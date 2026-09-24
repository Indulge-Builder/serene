'use client';
// ElayaPlaybooksPanel — the founder's playbooks (migration 0234): a list on the left, one editor
// on the right, and a Try-it box that runs a question through the real brain and shows what
// fired (specialist, playbook, tools). Display + form state only (A-06); every write goes through
// actions/elaya-playbooks.ts; the try-it rides the SAME transport the /elaya page uses
// (streamElayaChat) on the user's own active conversation.
import { SelectionButton } from '@/components/ui/SelectionButton';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Play, Wand2 } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ChatMarkdown } from '@/components/ui/ChatMarkdown';
import { EmptyState } from '@/components/ui/EmptyState';
import { DictationButton } from '@/components/ui/DictationButton';
import { toast } from '@/lib/toast';
import { streamElayaChat } from '@/components/elaya/elaya-stream';
import { upsertElayaPlaybookAction, deleteElayaPlaybookAction, draftElayaPlaybookAction } from '@/lib/actions/elaya-playbooks';
import type { ElayaPlaybookRow } from '@/lib/services/elaya-playbooks-service';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)',
  background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
};

type Draft = { id?: string; title: string; example_questions: string; instructions: string; active: boolean };
const EMPTY: Draft = { title: '', example_questions: '', instructions: '', active: true };
const toDraft = (p: ElayaPlaybookRow): Draft => ({ id: p.id, title: p.title, example_questions: p.example_questions.join('\n'), instructions: p.instructions, active: p.active });

type Trace = { specialist: string | null; toolsUsed: string[]; playbook: { id: string; title: string } | null };

export function ElayaPlaybooksPanel({ initialPlaybooks, conversationId }: { initialPlaybooks: ElayaPlaybookRow[]; conversationId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [drafted, setDrafted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ElayaPlaybookRow | null>(null);
  const [pending, start] = useTransition();

  function save() {
    const example_questions = draft.example_questions.split('\n').map((q) => q.trim()).filter(Boolean);
    start(async () => {
      const r = await upsertElayaPlaybookAction({ id: draft.id, title: draft.title, example_questions, instructions: draft.instructions, active: draft.active });
      if (r.error || !r.data) { toast.danger(r.error ?? 'Could not save.'); return; }
      toast.success(draft.id ? 'Playbook updated. Live on the next message.' : 'Playbook added. Live on the next message.');
      setDraft(toDraft(r.data));
      setDrafted(false);
      router.refresh();
    });
  }
  function remove(p: ElayaPlaybookRow) {
    start(async () => {
      const r = await deleteElayaPlaybookAction({ id: p.id });
      setConfirmDelete(null);
      if (r.error) { toast.danger(r.error); return; }
      toast.success('Playbook deleted.');
      if (draft.id === p.id) setDraft(EMPTY);
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <SpeakPlaybook onDraft={(d) => { setDraft({ title: d.title, example_questions: d.example_questions.join('\n'), instructions: d.instructions, active: true }); setDrafted(true); }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 'var(--space-6)', alignItems: 'start' }} className="serene-playbooks-grid">
        <SectionCard title="Playbooks" description="One per kind of question. Click to edit." headerRight={<Button size="xs" variant="secondary" iconLeft={Plus} iconMotion="rotate" onClick={() => setDraft(EMPTY)}>New</Button>} bodyPadding={false}>
          {initialPlaybooks.length === 0 ? (
            <div style={{ padding: 'var(--space-6)' }}><EmptyState variant="inline" size="sm" title="No playbooks yet. Write the first one on the right." /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {initialPlaybooks.map((p) => (
                <SelectionButton
                  appearance="row"
                  key={p.id}
                  type="button"
                  onClick={() => setDraft(toDraft(p))}
                  className="serene-pressable text-left"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-5)',
                    borderBottom: '1px solid var(--theme-paper-border)',
                    borderBottomWidth: 1,
                    width: '100%',
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', fontWeight: 'var(--weight-medium)' }}>{p.title}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.example_questions[0]}</span>
                  </span>
                  <span style={{ fontSize: 'var(--text-2xs)', color: p.active ? 'var(--color-success-text)' : 'var(--theme-text-tertiary)', flexShrink: 0 }}>{p.active ? 'on' : 'off'}</span>
                </SelectionButton>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={draft.id ? 'Edit playbook' : drafted ? 'Preview: drafted from your notes' : 'New playbook'} description="Example questions are how people really ask (one per line). The instructions are the method: what to look at, which time window, what to lead with. Elaya reads them word for word.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {drafted && !draft.id && (
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--theme-accent-surface)',
                color: "var(--neu-accent-deep)",
                fontSize: 'var(--text-sm)',
              }}>
                Elaya shaped your notes into this draft. Read it, change anything, then press <strong>Add playbook</strong> to approve. Nothing is saved until you do.
              </div>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Title</span>
              <input style={INPUT} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What's happening in a queendom" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Example questions, one per line</span>
              <textarea style={{ ...INPUT, minHeight: 88, resize: 'vertical' }} value={draft.example_questions} onChange={(e) => setDraft({ ...draft, example_questions: e.target.value })} placeholder={"what all happened in Ananyshree\nhow is Anishqa's queendom doing\nupdate me on Sanika's team"} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Instructions for Elaya</span>
              <textarea style={{ ...INPUT, minHeight: 220, resize: 'vertical', lineHeight: 'var(--leading-normal)' }} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                placeholder={"1. Check whether a time frame was given in the recent messages. If not, cover today in full, and the last 3 and 7 days in brief.\n2. Only that queendom: its Freshdesk group, its members' groups.\n3. Lead with what needs attention..."} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {draft.id && (
                  <Button size="sm" variant="ghost" iconLeft={Trash2} onClick={() => setConfirmDelete(initialPlaybooks.find((p) => p.id === draft.id) ?? null)} disabled={pending}>Delete</Button>
                )}
                <Button size="sm" onClick={save} loading={pending} loadingLabel="Saving…" disabled={!draft.title.trim() || !draft.instructions.trim() || !draft.example_questions.trim()}>
                  {draft.id ? 'Save changes' : 'Add playbook'}
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <TryIt conversationId={conversationId} />

      <ConfirmDialog open={Boolean(confirmDelete)} title="Delete this playbook?" body={<span>Elaya stops following “{confirmDelete?.title}” on the next message. This cannot be undone.</span>} confirmLabel="Delete" danger pending={pending} onConfirm={() => confirmDelete && remove(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      <style>{`@media (max-width: 900px) { .serene-playbooks-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

/** Say it, or type it: "when I ask X, I need Y, Z…" → Elaya drafts the playbook → the founder approves in the editor. */
function SpeakPlaybook({ onDraft }: { onDraft: (d: { title: string; example_questions: string[]; instructions: string }) => void }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  function draftIt() {
    start(async () => {
      const r = await draftElayaPlaybookAction({ notes });
      if (r.error || !r.data) { toast.danger(r.error ?? 'Could not draft that.'); return; }
      onDraft(r.data);
      toast.success('Draft ready below. Review it, then approve.');
    });
  }
  return (
    <SectionCard title="Speak a playbook" description="Press the mic and say it the way you would tell a colleague: what people will ask, and everything the answer must cover. Or type it. Elaya turns it into a draft you approve.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <textarea style={{ ...INPUT, minHeight: 110, resize: 'vertical', lineHeight: 'var(--leading-normal)' }} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="When I ask what's happening in a queendom: first check if I gave a time frame, otherwise today in full and the last 3 and 7 days in short; only that queendom's tickets and its members' groups; tell me who is waiting on us first…" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <DictationButton variant="inline" what="a playbook" onTranscript={(t) => setNotes((n) => (n ? n.trimEnd() + ' ' : '') + t)} onError={(m) => toast.danger(m)} onBusyChange={setBusy} />
          <Button size="sm" onClick={draftIt} loading={pending} loadingLabel="Drafting…" iconLeft={Wand2} disabled={busy || notes.trim().length < 20}>Draft with Elaya</Button>
        </div>
      </div>
    </SectionCard>
  );
}

/** Ask the real Elaya and see what fired. Runs on the user's own active conversation, like the /elaya page. */
function TryIt({ conversationId }: { conversationId: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [trace, setTrace] = useState<Trace | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const answerRef = useRef('');

  async function run() {
    const q = question.trim();
    if (!q || running) return;
    setRunning(true); setAnswer(''); setTrace(null); setTools([]); answerRef.current = '';
    try {
      await streamElayaChat({ message: q, conversationId }, {
        onMeta: () => {},
        onDelta: (t) => { answerRef.current += t; setAnswer(answerRef.current); },
        onTool: (name) => setTools((prev) => [...prev, name]),
        onDone: (tr) => setTrace(tr ?? null),
        onStreamError: (m) => toast.danger(m),
        onRejected: (p) => toast.danger(p.error ?? 'Elaya could not take that question.'),
      });
    } catch {
      toast.danger('Could not reach Elaya.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <SectionCard title="Try it" description="Ask a real question. The answer and what fired (playbook, specialist, tools) show below. This runs in your own Elaya conversation.">
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <input style={INPUT} value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } }} placeholder="what all happened in Ananyshree" disabled={running} />
        <Button size="md" onClick={() => void run()} loading={running} loadingLabel="Asking…" iconLeft={Play} disabled={!question.trim()}>Ask</Button>
      </div>
      {(tools.length > 0 || trace) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
          <Chip label="playbook" value={trace ? (trace.playbook?.title ?? 'none') : '…'} strong={Boolean(trace?.playbook)} />
          <Chip label="specialist" value={trace?.specialist ?? '…'} />
          <Chip label="tools" value={tools.length ? tools.join(', ') : 'none'} />
        </div>
      )}
      {answer && (
        <div style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--theme-paper-subtle)',
          fontSize: 'var(--text-sm)',
          color: 'var(--theme-text-primary)',
        }}>
          <ChatMarkdown content={answer} />
        </div>
      )}
    </SectionCard>
  );
}

function Chip({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex',
      gap: 6,
      alignItems: 'center',
      padding: '3px var(--space-3)',
      borderRadius: 'var(--radius-full)',
      border: '1px solid var(--theme-paper-border)',
      background: strong ? 'var(--theme-accent-surface)' : 'var(--theme-paper)',
    }}>
      <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>{label}</span>
      <span style={{ color: strong ? 'var(--theme-accent)' : 'var(--theme-text-primary)' }}>{value}</span>
    </span>
  );
}
