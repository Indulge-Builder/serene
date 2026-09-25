'use client';

// IntakeLessonsPanel — "What the team has taught the ticket AI" (0240). One block per kind of
// work: the approved lesson (what the prompts follow today), the draft waiting for the founder
// (editable, Approve or Discard), a "Write a lesson now" button, and the scoreboard of the
// drafts' verdicts by prompt version, so a lesson is judged by its numbers. "Download
// instructions.md" exports every approved lesson as one file: the same document a specialised
// ticket agent reads later. The founder approves; the machine never does.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Sparkles } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils/dates';
import { triggerBrowserDownload } from '@/lib/utils/export';
import { approveIntakeLessonAction, discardIntakeLessonAction, updateIntakeLessonAction, writeIntakeLessonNowAction } from '@/lib/actions/ticket-settings';
import { LESSON_KINDS, LESSON_LABELS, LESSON_MIN_REVIEWS } from '@/lib/constants/ticket-intake';
import type { DraftReviewScoreboardRow, IntakeLesson, LessonKind } from '@/lib/types/intake';

const FIELD: React.CSSProperties = { width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)', fontFamily: 'var(--font-mono)', resize: 'vertical', minHeight: 220 };
const BODY: React.CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)', color: 'var(--theme-text-primary)' };
const MUTED: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' };

/** The kinds a scoreboard source teaches (mirrors reviewFilter in services/intake-lessons.ts). */
const SOURCES_FOR: Record<LessonKind, string[]> = { intake: ['intake_card'], ticket_creator: ['intake_card', 'ticket_creator'], sentinel: ['sentinel'] };

function pct(n: number, of: number): string { return of > 0 ? `${Math.round((n / of) * 100)}%` : '—'; }

/** Every approved lesson as one Markdown file (the instruction file the founder asked for). */
function lessonsMarkdown(approved: IntakeLesson[]): string {
  const head = `# Serene ticket AI: what the team has taught it\n\nExported ${new Date().toISOString().slice(0, 10)}. One section per kind of work; each is the approved version the prompts follow today.\n`;
  const parts = approved.map((l) => `\n## ${LESSON_LABELS[l.kind]} (version ${l.version}, approved ${l.approved_at ? l.approved_at.slice(0, 10) : '—'})\n\n${l.body}\n`);
  return head + parts.join('');
}

function Draft({ lesson }: { lesson: IntakeLesson }) {
  const router = useRouter();
  const [body, setBody] = useState(lesson.body);
  const [pending, start] = useTransition();
  const dirty = body.trim() !== lesson.body.trim();
  const evidence = lesson.evidence as { reviews?: number; from_version?: number | null };

  const save = () => start(async () => {
    const r = await updateIntakeLessonAction({ lesson_id: lesson.id, body });
    if (r.error) { toast.danger(r.error); return; }
    toast.success('Draft saved.');
    router.refresh();
  });
  const approve = () => start(async () => {
    if (dirty) { const s = await updateIntakeLessonAction({ lesson_id: lesson.id, body }); if (s.error) { toast.danger(s.error); return; } }
    const r = await approveIntakeLessonAction({ lesson_id: lesson.id });
    if (r.error) { toast.danger(r.error); return; }
    toast.success(`Version ${lesson.version} is now what the AI follows.`);
    router.refresh();
  });
  const discard = () => start(async () => {
    const r = await discardIntakeLessonAction({ lesson_id: lesson.id });
    if (r.error) { toast.danger(r.error); return; }
    toast.success('Draft discarded.');
    router.refresh();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--theme-paper-subtle)', border: '1px solid var(--theme-paper-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Sparkles style={{ width: '1rem', height: '1rem', strokeWidth: 1.5, color: 'var(--neu-accent-deep)' }} />
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>Draft, version {lesson.version}, waiting for you</span>
        <span style={MUTED}>written {formatDate(lesson.created_at, 'd MMM, h:mm a')} from {evidence.reviews ?? '?'} verdicts{evidence.from_version ? ` on top of version ${evidence.from_version}` : ''}</span>
      </div>
      {lesson.summary && <p style={{ ...BODY, color: 'var(--theme-text-secondary)' }}>{lesson.summary}</p>}
      <textarea style={FIELD} value={body} onChange={(e) => setBody(e.target.value)} disabled={pending} aria-label="Lesson draft" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button size="sm" onClick={approve} loading={pending} loadingLabel="Working…">Approve{dirty ? ' with my edits' : ''}</Button>
        {dirty && <Button size="sm" variant="secondary" onClick={save} disabled={pending}>Save edits</Button>}
        <Button size="sm" variant="ghost" onClick={discard} disabled={pending}>Discard</Button>
        <span style={{ ...MUTED, marginLeft: 'auto' }}>Approving retires the current version; nothing is deleted.</span>
      </div>
    </div>
  );
}

function Kind({ kind, approved, draft, rows, history }: { kind: LessonKind; approved: IntakeLesson | null; draft: IntakeLesson | null; rows: DraftReviewScoreboardRow[]; history: IntakeLesson[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState(false);
  const decided = rows.reduce((n, r) => n + r.decided, 0);

  const writeNow = () => start(async () => {
    const r = await writeIntakeLessonNowAction({ kind });
    if (r.error) { toast.danger(r.error); return; }
    setQueued(true);
    toast.success('Writing. The draft appears here in a minute or two; refresh the page.');
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', color: 'var(--theme-text-primary)' }}>{LESSON_LABELS[kind]}</h3>
        <span style={MUTED}>{approved ? `version ${approved.version} approved ${formatDate(approved.approved_at ?? approved.created_at, 'd MMM')}` : 'nothing approved yet: the AI runs on its general instructions'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
          <Button size="sm" variant="secondary" onClick={writeNow} loading={pending} loadingLabel="Starting…" disabled={queued || Boolean(draft)}>{draft ? 'A draft is waiting' : queued ? 'Writing…' : 'Write a lesson now'}</Button>
        </div>
      </div>

      {draft && <Draft key={draft.id} lesson={draft} />}

      {approved ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Hide the approved lesson' : 'Read the approved lesson'}</Button>
          {open && <pre style={{ ...BODY, marginTop: 'var(--space-3)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--theme-paper-subtle)', fontFamily: 'inherit' }}>{approved.body}</pre>}
        </div>
      ) : !draft ? (
        <EmptyState variant="inline" title={`Nothing to teach yet. A draft is written from ${LESSON_MIN_REVIEWS} or more decisions, every Monday.`} />
      ) : null}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)', width: '100%' }}>
            <thead>
              <tr style={{ color: 'var(--theme-text-tertiary)', textAlign: 'left' }}>
                <th style={{ padding: '4px var(--space-3) 4px 0', fontWeight: 'var(--weight-medium)' }}>Prompt version</th>
                <th style={{ padding: '4px var(--space-3)', fontWeight: 'var(--weight-medium)' }}>Decided</th>
                <th style={{ padding: '4px var(--space-3)', fontWeight: 'var(--weight-medium)' }}>Accepted as drafted</th>
                <th style={{ padding: '4px var(--space-3)', fontWeight: 'var(--weight-medium)' }}>Edited first</th>
                <th style={{ padding: '4px var(--space-3)', fontWeight: 'var(--weight-medium)' }}>Dismissed</th>
                <th style={{ padding: '4px var(--space-3)', fontWeight: 'var(--weight-medium)' }}>With words</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.source}:${r.prompt_version}`} style={{ color: 'var(--theme-text-secondary)', borderTop: '1px solid var(--theme-paper-border)' }}>
                  <td style={{ padding: '6px var(--space-3) 6px 0', fontFamily: 'var(--font-mono)', color: 'var(--theme-text-primary)' }}>{r.prompt_version}<span style={MUTED}> · {r.source.replace('_', ' ')}</span></td>
                  <td style={{ padding: '6px var(--space-3)' }}>{r.decided}</td>
                  <td style={{ padding: '6px var(--space-3)' }}>{pct(r.accepted, r.decided)}</td>
                  <td style={{ padding: '6px var(--space-3)' }}>{pct(r.edited, r.decided)}</td>
                  <td style={{ padding: '6px var(--space-3)' }}>{pct(r.dismissed, r.decided)}</td>
                  <td style={{ padding: '6px var(--space-3)' }}>{r.with_feedback}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span style={MUTED}>{decided} decisions in the last 90 days. A lesson helps when the version after it is accepted as drafted more often.</span>
        </div>
      )}

      {history.length > 0 && <span style={MUTED}>Earlier: {history.map((h) => `v${h.version} (${h.status}, ${formatDate(h.created_at, 'd MMM')})`).join(' · ')}</span>}
    </div>
  );
}

export function IntakeLessonsPanel({ lessons, scoreboard }: { lessons: IntakeLesson[]; scoreboard: DraftReviewScoreboardRow[] }) {
  const approved = lessons.filter((l) => l.status === 'approved');
  const download = () => {
    if (approved.length === 0) { toast.warning('Nothing approved yet, so there is nothing to export.'); return; }
    triggerBrowserDownload(`serene-ticket-ai-instructions-${new Date().toISOString().slice(0, 10)}.md`, lessonsMarkdown(approved), 'text/markdown;charset=utf-8');
  };
  return (
    <SectionCard
      title="What the team has taught the ticket AI"
      description="Every approval, edit and dismissal on a suggested ticket is kept. Once a week (or on demand) the lesson writer turns the new ones into a plain-English instruction document. You approve it; only then does the AI follow it. Export the approved lessons as one file for the ticket agent."
      headerRight={<Button size="sm" variant="secondary" onClick={download} disabled={approved.length === 0}><Download style={{ width: '0.9rem', height: '0.9rem', strokeWidth: 1.5 }} /> Download instructions.md</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        {LESSON_KINDS.map((kind) => (
          <Kind
            key={kind} kind={kind}
            approved={lessons.find((l) => l.kind === kind && l.status === 'approved') ?? null}
            draft={lessons.find((l) => l.kind === kind && l.status === 'draft') ?? null}
            rows={scoreboard.filter((r) => SOURCES_FOR[kind].includes(r.source))}
            history={lessons.filter((l) => l.kind === kind && l.status === 'retired')}
          />
        ))}
      </div>
    </SectionCard>
  );
}
