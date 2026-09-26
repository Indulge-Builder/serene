'use client';

// MemberHealthCard — the happiness score with its reasons, and a manual adjustment for a
// bishop or queen (a signed delta with a note; an append-only health event).

import { FormSelect } from '@/components/ui/FormSelect';
import { Input } from '@/components/ui/Field';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HeartPulse } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { adjustMemberHealthAction } from '@/lib/actions/members';
import { formatDate } from '@/lib/utils/dates';
import { HealthPill } from './HealthPill';
import type { MemberHealth } from '@/lib/types/member';

export function MemberHealthCard({ clientId, health }: { clientId: string; health: MemberHealth }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState('5');
  const [note, setNote] = useState('');
  const hasEvents = health.events.length > 0 || health.base !== null;

  function submit() {
    start(async () => {
      const res = await adjustMemberHealthAction({ member_id: clientId, delta: Number(delta), note });
      if (res.error) { toast.danger(res.error); return; }
      toast.success('Recorded.');
      setOpen(false); setNote('');
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={HeartPulse} label="Health" right={<span style={{ marginLeft: 'auto' }}><HealthPill score={hasEvents ? health.score : null} /></span>} />
      <div style={{ padding: 'var(--space-5) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {!hasEvents ? (
          <EmptyState variant="inline" title="No signals yet." description="The score starts moving with the first ticket, message or note." />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
              <HealthPill score={health.score} size="lg" />
              <span style={{ fontSize: 'var(--text-xs)', color: health.trend30d >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>
                {health.trend30d >= 0 ? '+' : ''}{health.trend30d} in 30 days
              </span>
            </div>
            {health.base && (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--theme-text-tertiary)' }}>Serene's judgement, {health.base.score} on {formatDate(health.base.at, 'd MMM')}: </span>{health.base.verdict}
              </p>
            )}
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {health.reasons.map((r, i) => (
                <li key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span>{r.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: r.delta >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)', whiteSpace: 'nowrap' }}>{r.delta >= 0 ? '+' : ''}{r.delta} · {formatDate(r.observed_at, 'd MMM')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {open ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <FormSelect aria-label="Health adjustment"  value={delta} onValueChange={(nextValue) => setDelta(nextValue)} style={{ width: 96 }}>
                {[-20, -10, -5, -2, 2, 5, 10, 20].map((d) => <option key={d} value={d}>{d > 0 ? `+${d}` : d}</option>)}
              </FormSelect>
              <Input className="serene-input neu-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (required)" style={{ flex: 1 }} maxLength={300} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="xs" onClick={submit} loading={pending} disabled={!note.trim()}>Record</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" size="xs" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>Adjust by hand</Button>
        )}
      </div>
    </div>
  );
}
