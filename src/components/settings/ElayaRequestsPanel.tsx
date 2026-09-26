'use client';
// ElayaRequestsPanel — the improvement requests the team raised with Elaya (migration 0237): what
// was asked, what she answered, what the user said was wrong, her own guess at the cause. The admin
// marks each fixed / declined / became a playbook with a note; open ones are folded into her prompt
// as known issues until then. Display + form state only (A-06); writes through actions/elaya-memory.ts.
import { FormSelect } from '@/components/ui/FormSelect';
import { Input } from '@/components/ui/Field';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils/dates';
import { resolveImprovementRequestAction } from '@/lib/actions/elaya-memory';
import { ELAYA_REQUEST_KIND_LABELS, ELAYA_REQUEST_STATUS_LABELS, ELAYA_REQUEST_STATUS_OPTIONS_FOR_PANEL, type ElayaRequestStatus } from '@/lib/constants/elaya-memory';
import type { ElayaImprovementRequestRow } from '@/lib/services/elaya-memory-service';
import { MessageSquareWarning } from 'lucide-react';


function Quote({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>{label}</span>
      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)', whiteSpace: 'pre-wrap' }}>{text.length > 700 ? text.slice(0, 700) + '…' : text}</p>
    </div>
  );
}

function RequestCard({ r }: { r: ElayaImprovementRequestRow }) {
  const router = useRouter();
  const [status, setStatus] = useState<ElayaRequestStatus>(r.status);
  const [note, setNote] = useState(r.admin_note ?? '');
  const [pending, start] = useTransition();
  const tone = r.status === 'open' ? 'var(--color-warning-text)' : r.status === 'fixed' ? 'var(--color-success-text)' : 'var(--theme-text-tertiary)';
  function save() {
    start(async () => {
      const res = await resolveImprovementRequestAction({ id: r.id, status, admin_note: note.trim() || undefined });
      if (res.error) { toast.danger(res.error); return; }
      toast.success(status === 'open' ? 'Kept open.' : `Marked ${ELAYA_REQUEST_STATUS_LABELS[status].toLowerCase()}. Elaya reads the note on the next message.`);
      router.refresh();
    });
  }
  return (
    <SectionCard
      title={`${ELAYA_REQUEST_KIND_LABELS[r.kind]} · ${r.requester ?? 'someone'}`}
      description={`${formatDate(r.created_at, 'dd MMM, HH:mm')} · ${r.channel}`}
      headerRight={<span className="label-micro" style={{ color: tone }}>{ELAYA_REQUEST_STATUS_LABELS[r.status]}</span>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', whiteSpace: 'pre-wrap' }}><strong>They said:</strong> {r.correction}</div>
        {r.diagnosis && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}><strong>Elaya's guess:</strong> {r.diagnosis}</div>}
        <Quote label="The question" text={r.question} />
        <Quote label="Her answer" text={r.answer} />
        <div className="serene-form-row" style={{ gap: 'var(--space-2)', alignItems: 'center', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--theme-paper-border)' }}>
          <FormSelect aria-label="Status" value={status} onValueChange={(nextValue) => setStatus(nextValue as ElayaRequestStatus)} style={{ width: '100%' }}>
            {ELAYA_REQUEST_STATUS_OPTIONS_FOR_PANEL.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </FormSelect>
          <Input style={{ width: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done, in one line. Elaya reads this." maxLength={1000} />
          <Button size="xs" variant="secondary" onClick={save} disabled={pending}>Save</Button>
        </div>
      </div>
    </SectionCard>
  );
}

export function ElayaRequestsPanel({ requests }: { requests: ElayaImprovementRequestRow[] }) {
  const open = requests.filter((r) => r.status === 'open');
  const done = requests.filter((r) => r.status !== 'open');
  if (requests.length === 0) return <EmptyState icon={MessageSquareWarning} framed title="Nothing raised yet." description="When someone tells Elaya she was wrong about the system, it lands here." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {open.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h2 className="type-section-title m-0">Open ({open.length})</h2>
          {open.map((r) => <RequestCard key={r.id} r={r} />)}
        </div>
      )}
      {done.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h2 className="type-section-title m-0">Decided ({done.length})</h2>
          {done.map((r) => <RequestCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}
