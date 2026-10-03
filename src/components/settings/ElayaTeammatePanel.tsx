'use client';
// ElayaTeammatePanel — the operating teammate's review surface (migration 0257): the switch (off /
// shadow / live per queendom) and every intervention Elaya decided deserved a move: the rule, the
// words, who she told or would have told, whether they saw it, how it ended. A person may mark a row
// seen / snoozed / resolved / dismissed. Display + form state only (A-06); writes through
// actions/elaya-teammate.ts.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Radar } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectionButton } from '@/components/ui/SelectionButton';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils/dates';
import { setInterventionStateAction, setTeammateModeAction } from '@/lib/actions/elaya-teammate';
import { INTERVENTION_KIND_LABELS, INTERVENTION_STATE_LABELS, TEAMMATE_MODES, type InterventionState, type TeammateMode } from '@/lib/constants/elaya-teammate';
import type { InterventionForPage } from '@/lib/services/elaya-teammate';

const MODE_LABELS: Record<TeammateMode, string> = { off: 'Off', shadow: 'Shadow (write, send nothing)', live: 'Live (send to the queendoms below)' };
const LIVE_STATES: readonly InterventionState[] = ['proposed', 'delivered', 'snoozed', 'acknowledged'];

function stateTone(state: InterventionState): string {
  if (state === 'delivered' || state === 'proposed') return 'var(--color-warning-text)';
  if (state === 'resolved') return 'var(--color-success-text)';
  return 'var(--theme-text-tertiary)';
}

function SwitchCard({ mode, liveQueendomIds, queendoms }: { mode: TeammateMode; liveQueendomIds: string[]; queendoms: { id: string; name: string }[] }) {
  const router = useRouter();
  const [nextMode, setNextMode] = useState<TeammateMode>(mode);
  const [live, setLive] = useState<Set<string>>(new Set(liveQueendomIds));
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      const res = await setTeammateModeAction({ mode: nextMode, queendomIds: [...live] });
      if (res.error) { toast.danger(res.error); return; }
      toast.success(nextMode === 'live' ? `Live for ${live.size} queendom${live.size === 1 ? '' : 's'}.` : nextMode === 'shadow' ? 'Shadow: she writes, sends nothing.' : 'Off.');
      router.refresh();
    });
  }
  return (
    <SectionCard title="The switch" description="Shadow first. Read what she would have sent, then turn on one queendom.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div role="radiogroup" aria-label="Mode" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {TEAMMATE_MODES.map((m) => (
            <SelectionButton key={m} appearance="choice" selected={nextMode === m} role="radio" aria-checked={nextMode === m} onClick={() => setNextMode(m)} disabled={pending} className="serene-pressable" style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sm)' }}>
              {MODE_LABELS[m]}
            </SelectionButton>
          ))}
        </div>
        <div>
          <span className="label-micro" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Live queendoms</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {queendoms.map((q) => {
              const on = live.has(q.id);
              return (
                <SelectionButton key={q.id} appearance="choice" selected={on} role="checkbox" aria-checked={on} disabled={pending} className="serene-pressable" style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sm)' }}
                  onClick={() => setLive((prev) => { const next = new Set(prev); if (next.has(q.id)) next.delete(q.id); else next.add(q.id); return next; })}>
                  {q.name}
                </SelectionButton>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="xs" variant="primary" onClick={save} disabled={pending} className="serene-btn-primary serene-pressable">{pending ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </SectionCard>
  );
}

function Card({ r }: { r: InterventionForPage }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const liveRow = LIVE_STATES.includes(r.state);
  function move(state: 'acknowledged' | 'snoozed' | 'resolved' | 'dismissed') {
    start(async () => {
      const res = await setInterventionStateAction({ id: r.id, state });
      if (res.error) { toast.danger(res.error); return; }
      toast.success(`Marked ${INTERVENTION_STATE_LABELS[state].toLowerCase()}.`);
      router.refresh();
    });
  }
  const sent = r.delivery.filter((d) => d.channel !== 'shadow');
  const shadow = r.delivery.some((d) => d.channel === 'shadow');
  const actionUrl = typeof r.evidence.action_url === 'string' ? r.evidence.action_url : null;
  return (
    <SectionCard
      title={`${INTERVENTION_KIND_LABELS[r.kind]} · ${r.checkpoint.replace(/_/g, ' ')}`}
      description={`${formatDate(r.created_at, 'dd MMM, HH:mm')}${r.queendom_name ? ` · ${r.queendom_name}` : ''}${r.member_name ? ` · ${r.member_name}` : ''}`}
      headerRight={<span className="label-micro" style={{ color: stateTone(r.state) }}>{INTERVENTION_STATE_LABELS[r.state]}{r.escalation_step > 0 ? ` · step ${r.escalation_step}` : ''}</span>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', whiteSpace: 'pre-wrap' }}><strong>{r.title}</strong> {r.body}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
          <strong>Why:</strong> {r.observation}
          {r.recipient_name && <> · <strong>To:</strong> {r.recipient_name}{r.recipient_role ? ` (${r.recipient_role})` : ''}</>}
          {shadow && sent.length === 0 && <> · <em>shadow: not sent</em></>}
          {sent.length > 0 && <> · <strong>Sent:</strong> {sent.map((d) => `${d.channel} ${formatDate(d.at, 'dd MMM HH:mm')}`).join(', ')}</>}
          {r.resolution && <> · <strong>Ended:</strong> {r.resolution.replace(/_/g, ' ').replace('evidence:', 'evidence, ')}</>}
          {actionUrl && <> · <a href={actionUrl} style={{ color: 'var(--neu-accent-deep)' }}>Open</a></>}
        </div>
        {liveRow && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--theme-paper-border)' }}>
            {r.state !== 'acknowledged' && <Button size="xs" variant="secondary" onClick={() => move('acknowledged')} disabled={pending}>Seen</Button>}
            <Button size="xs" variant="secondary" onClick={() => move('snoozed')} disabled={pending}>Snooze 2h</Button>
            <Button size="xs" variant="secondary" onClick={() => move('resolved')} disabled={pending}>Resolved</Button>
            <Button size="xs" variant="ghost" onClick={() => move('dismissed')} disabled={pending}>Dismiss</Button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export function ElayaTeammatePanel({ rows, mode, liveQueendomIds, queendoms }: { rows: InterventionForPage[]; mode: TeammateMode; liveQueendomIds: string[]; queendoms: { id: string; name: string }[] }) {
  const live = rows.filter((r) => LIVE_STATES.includes(r.state));
  const done = rows.filter((r) => !LIVE_STATES.includes(r.state));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <SwitchCard mode={mode} liveQueendomIds={liveQueendomIds} queendoms={queendoms} />
      {rows.length === 0 ? (
        <EmptyState icon={Radar} framed title="Nothing to say yet." description="When a ticket owes a last-mile check, a member goes quiet after options, or a request sits on no ticket, it lands here first." />
      ) : (
        <>
          {live.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <h2 className="type-section-title m-0">In flight ({live.length})</h2>
              {live.map((r) => <Card key={r.id} r={r} />)}
            </div>
          )}
          {done.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <h2 className="type-section-title m-0">Ended ({done.length})</h2>
              {done.slice(0, 60).map((r) => <Card key={r.id} r={r} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
