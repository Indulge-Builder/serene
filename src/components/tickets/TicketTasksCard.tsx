'use client';

// TicketTasksCard — the ticket's sub-work: the tasks spun off it, and the form to spin one
// off (title, who, priority, due). The task is a normal personal task (reminders,
// notifications, My Tasks) linked back here through task_ticket_meta.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListTodo, Plus } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { DueDateField, PriorityChipRow, resolveDueAt, type DuePreset } from '@/components/ui/TaskFormFields';
import { toast } from '@/lib/toast';
import { createTicketTaskAction } from '@/lib/actions/tickets';
import { formatRelativeTime } from '@/lib/utils/dates';
import type { TicketDetail, StaffOption } from '@/lib/types/ticket';
import type { TaskPriority } from '@/lib/types/database';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const SELECT: React.CSSProperties = { padding: '6px var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit' };

export function TicketTasksCard({ ticketId, tasks, staff, defaultAssignee }: { ticketId: string; tasks: TicketDetail['tasks']; staff: StaffOption[]; defaultAssignee: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<string>(defaultAssignee ?? '');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [preset, setPreset] = useState<DuePreset | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const t = title.trim(); if (!t || pending) return;
    setError(null);
    start(async () => {
      const r = await createTicketTaskAction({ ticket_id: ticketId, title: t, assigned_to: assignee || null, priority, due_at: resolveDueAt(preset, date) });
      if (r.error) { setError(r.error); return; }
      setTitle(''); setPreset(null); setDate(null); setOpen(false);
      toast.success('Task created.');
      router.refresh();
    });
  }

  return (
    <div style={SHELL}>
      <CardHeader icon={ListTodo} label="Sub-work" right={
        <span style={{ marginLeft: 'auto' }}>
          <Button variant="ghost" size="xs" onClick={() => setOpen((o) => !o)} iconMotion="rotate"><Plus style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} /> Task</Button>
        </span>
      } />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--theme-paper-border)' }}>
            <input className="serene-input neu-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing" maxLength={255} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <select style={SELECT} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Me</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <PriorityChipRow value={priority} onChange={setPriority} variant="dot" deselectNonNormal />
            </div>
            <DueDateField optional preset={preset} onPresetChange={setPreset} date={date} onDateChange={setDate} />
            {error && <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="xs" onClick={submit} loading={pending} disabled={!title.trim()}>Create task</Button>
            </div>
          </div>
        )}
        {tasks.length === 0 ? (
          !open && <EmptyState variant="inline" title="No tasks yet." description="Spin work off this ticket with Task; it lands in My Tasks with the usual reminders." />
        ) : tasks.map((t) => (
          <div key={t.id} style={{ fontSize: 'var(--text-sm)' }}>
            <Link href={`/tasks/${t.id}`} style={{ color: 'var(--neu-accent-deep)' }}>{t.title}</Link>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', marginLeft: 'var(--space-2)' }}>{t.status.replace(/_/g, ' ')}{t.due_at ? ` · due ${formatRelativeTime(t.due_at)}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
