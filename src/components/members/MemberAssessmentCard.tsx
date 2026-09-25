'use client';

// MemberAssessmentCard — "Serene's judgement" on the member page (migration 0241): the score,
// the four readings (engagement, satisfaction, value, risk), the one-line verdict, strengths,
// concerns and the next actions, with when it was judged and on how much record. "Assess now"
// queues a fresh judgement (Trigger.dev, a minute); the page shows it on refresh. The pulse
// numbers underneath are the plain activity facts the judgement rests on.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Gavel, RefreshCw } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { HealthPill } from '@/components/members/HealthPill';
import { toast } from '@/lib/toast';
import { formatDate, formatRelativeTime } from '@/lib/utils/dates';
import { assessMemberNowAction } from '@/lib/actions/members';
import { ASSESSMENT_RISK_LABELS } from '@/lib/constants/member-assessment';
import type { MemberAssessment, MemberPulse } from '@/lib/types/member';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' };
const MUTED: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' };
const RISK_STYLE: Record<MemberAssessment['risk'], React.CSSProperties> = {
  low: { background: 'var(--color-success-light)', color: 'var(--color-success-text)' },
  watch: { background: 'var(--color-warning-light)', color: 'var(--color-warning-text)' },
  high: { background: 'var(--color-danger-light)', color: 'var(--color-danger-text)' },
};

function Reading({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
      <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', color: 'var(--theme-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}<span style={MUTED}>/100</span></span>
    </div>
  );
}

function Lines({ title, items, tone }: { title: string; items: string[]; tone?: 'danger' }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="label-micro" style={{ color: tone === 'danger' ? 'var(--color-danger-text)' : 'var(--theme-text-tertiary)', marginBottom: 'var(--space-2)' }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: '1.1em', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', lineHeight: 1.5 }}>
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}

export function MemberAssessmentCard({ memberId, assessment, pulse }: { memberId: string; assessment: MemberAssessment | null; pulse: MemberPulse | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState(false);

  const assessNow = () => start(async () => {
    const r = await assessMemberNowAction({ member_id: memberId });
    if (r.error) { toast.danger(r.error); return; }
    setQueued(true);
    toast.success('Serene is reading the record. The judgement lands here in a minute; refresh the page.');
  });

  return (
    <div style={SHELL}>
      <CardHeader
        icon={Gavel}
        label="Serene's judgement"
        right={<Button size="xs" variant="ghost" onClick={queued ? () => router.refresh() : assessNow} loading={pending} loadingLabel="Starting…"><RefreshCw style={{ width: '0.8rem', height: '0.8rem', strokeWidth: 1.5 }} /> {queued ? 'Refresh' : assessment ? 'Assess again' : 'Assess now'}</Button>}
      />
      <div style={BODY}>
        {!assessment ? (
          <EmptyState variant="inline" title="Not judged yet." description="Every Active member is judged weekly from the chat, the requests, the facts and the health signals. Or ask now." />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <HealthPill score={assessment.score} size="lg" />
              <span style={{ display: 'inline-flex', padding: '2px var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', ...RISK_STYLE[assessment.risk] }}>{ASSESSMENT_RISK_LABELS[assessment.risk]}</span>
              <span style={{ ...MUTED, marginLeft: 'auto' }}>judged {formatRelativeTime(assessment.assessed_at)} on {assessment.inputs.events} conversations, {assessment.inputs.tickets} requests, {assessment.inputs.facts} facts · confidence {Math.round(assessment.confidence * 100)}%</span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--theme-text-primary)' }}>{assessment.verdict}</p>
            <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
              <Reading label="Engagement" value={assessment.engagement} />
              <Reading label="Satisfaction" value={assessment.satisfaction} />
              <Reading label="Value to us" value={assessment.value} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 'var(--space-5)' }}>
              <Lines title="Going well" items={assessment.strengths} />
              <Lines title="Concerns" items={assessment.concerns} tone="danger" />
              <Lines title="Do next" items={assessment.actions} />
            </div>
          </>
        )}
        {pulse && (
          <span style={MUTED}>
            Pulse: activity {pulse.activity_score}/100 · last contact {pulse.last_contact_at ? formatDate(pulse.last_contact_at, 'd MMM') : 'never'} · {pulse.member_messages_30d} messages from them and {pulse.staff_messages_30d} from us in 30 days · {pulse.tickets_90d} requests in 90 days ({pulse.open_tickets} open{pulse.escalated_90d ? `, ${pulse.escalated_90d} escalated` : ''}) · counted {formatRelativeTime(pulse.computed_at)}
          </span>
        )}
      </div>
    </div>
  );
}
