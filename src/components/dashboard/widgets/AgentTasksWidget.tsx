'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { RefreshCcw, CheckSquare, AlertCircle, Users } from 'lucide-react';
import { getAgentTasksSummaryAction } from '@/lib/actions/dashboard';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils/dates';
import { formatCompact } from '@/lib/utils/numbers';
import type { AgentTask } from '@/lib/services/dashboard-service';
import type { WidgetProps } from '../DashboardWidgetSlot';

const TASK_TYPE_LABELS: Record<string, string> = {
  call:              'Call',
  whatsapp_message:  'WhatsApp',
  email:             'Email',
  general_follow_up: 'Follow-up',
};

type AgentTasksData = {
  tasks:         AgentTask[];
  newLeadsCount: number;
};

// This component is lazy-loaded — receives initialData from the server action
// run in the outer async wrapper (AgentTasksWidgetLoader).
// It owns client-side refresh via the server action.
export function AgentTasksWidget({ userId }: WidgetProps) {
  const [data, setData]              = useState<AgentTasksData | null>(null);
  const [loaded, setLoaded]          = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await getAgentTasksSummaryAction(userId);
      if (!cancelled && result.data) {
        setData(result.data);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const tasks         = data?.tasks ?? [];
  const newLeadsCount = data?.newLeadsCount ?? 0;
  const overdue       = tasks.filter((t) => t.is_overdue);
  const upcoming      = tasks.filter((t) => !t.is_overdue);

  function handleRefresh() {
    startTransition(async () => {
      const result = await getAgentTasksSummaryAction(userId);
      if (result.data) setData(result.data);
    });
  }

  return (
    <div
      style={{
        borderRadius:  'var(--radius-lg)',
        border:        '1px solid var(--theme-paper-border)',
        background:    'var(--theme-paper)',
        boxShadow:     'var(--shadow-1)',
        padding:       'var(--space-5)',
        display:       'flex',
        flexDirection: 'column',
        gap:           'var(--space-4)',
        minHeight:     '260px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p
            style={{
              fontSize:      'var(--text-2xs)',
              fontWeight:    'var(--weight-medium)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color:         'var(--theme-text-tertiary)',
              margin:        0,
              marginBottom:  'var(--space-1)',
            }}
          >
            Gia · My Tasks
          </p>
          <p
            style={{
              fontSize:   'var(--text-md)',
              fontFamily: 'var(--font-serif)',
              fontStyle:  'italic',
              color:      'var(--theme-text-primary)',
              margin:     0,
            }}
          >
            {isPending && !loaded
              ? 'Loading…'
              : tasks.length === 0
                ? 'Clear for now.'
                : `${formatCompact(tasks.length)} open task${tasks.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={handleRefresh}
          disabled={isPending}
          title="Refresh"
          style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--theme-paper-border)', flexShrink: 0 }}
          iconLeft={RefreshCcw}
          size="xs"
        />
      </div>

      {/* Overdue tasks */}
      {overdue.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <p
            style={{
              fontSize:      'var(--text-2xs)',
              fontWeight:    'var(--weight-medium)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color:         'var(--color-danger-text)',
              margin:        0,
              display:       'flex',
              alignItems:    'center',
              gap:           'var(--space-1)',
            }}
          >
            <AlertCircle size={10} strokeWidth={2} />
            Overdue
          </p>
          {overdue.map((task) => (
            <Link
              key={task.id}
              href={`/leads/${task.lead_id}`}
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                padding:        'var(--space-2) var(--space-3)',
                borderRadius:   'var(--radius-sm)',
                background:     'var(--color-danger-light)',
                border:         '1px solid transparent',
                textDecoration: 'none',
                gap:            'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontSize:     'var(--text-sm)',
                  color:        'var(--color-danger-text)',
                  fontWeight:   'var(--weight-medium)',
                  flex:         1,
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}
              >
                {TASK_TYPE_LABELS[task.task_type] ?? task.task_type} · {task.lead_name}
              </span>
              {task.due_at && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', whiteSpace: 'nowrap' }}>
                  {formatDate(task.due_at, 'dd MMM')}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Upcoming tasks */}
      {upcoming.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {overdue.length > 0 && (
            <p
              style={{
                fontSize:      'var(--text-2xs)',
                fontWeight:    'var(--weight-medium)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color:         'var(--theme-text-tertiary)',
                margin:        0,
              }}
            >
              Today
            </p>
          )}
          {upcoming.map((task) => (
            <Link
              key={task.id}
              href={`/leads/${task.lead_id}`}
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                padding:        'var(--space-2) var(--space-3)',
                borderRadius:   'var(--radius-sm)',
                background:     'var(--theme-paper-subtle)',
                border:         '1px solid var(--theme-paper-border)',
                textDecoration: 'none',
                gap:            'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontSize:     'var(--text-sm)',
                  color:        'var(--theme-text-primary)',
                  flex:         1,
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}
              >
                <CheckSquare
                  size={12}
                  strokeWidth={1.5}
                  style={{ marginRight: 'var(--space-1)', color: 'var(--theme-text-tertiary)', verticalAlign: 'middle' }}
                />
                {TASK_TYPE_LABELS[task.task_type] ?? task.task_type} · {task.lead_name}
              </span>
              {task.due_at && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap' }}>
                  {formatDate(task.due_at, 'dd MMM')}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Empty state — only show when loaded */}
      {loaded && tasks.length === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-sm)',
            color:      'var(--theme-text-tertiary)',
            textAlign:  'center',
            padding:    'var(--space-6) 0',
            margin:     0,
          }}
        >
          Nothing due today. Enjoy the quiet.
        </p>
      )}

      {/* New leads footer */}
      {newLeadsCount > 0 && (
        <Link
          href="/leads?status=new"
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            'var(--space-2)',
            padding:        'var(--space-2) var(--space-3)',
            borderRadius:   'var(--radius-sm)',
            background:     'var(--theme-accent-surface)',
            border:         '1px solid transparent',
            textDecoration: 'none',
            marginTop:      'auto',
          }}
        >
          <Users size={12} strokeWidth={1.5} style={{ color: 'var(--theme-accent)' }} />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-accent)', fontWeight: 'var(--weight-medium)' }}>
            {formatCompact(newLeadsCount)} new lead{newLeadsCount === 1 ? '' : 's'} waiting
          </span>
        </Link>
      )}
    </div>
  );
}
