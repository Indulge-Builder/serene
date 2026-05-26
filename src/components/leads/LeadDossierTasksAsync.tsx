import { CalendarClock } from 'lucide-react';
import { getNextLeadTask } from '@/lib/services/leads-service';
import { TASK_TYPE_LABELS } from '@/lib/constants/task-types';
import { formatDate } from '@/lib/utils/dates';

type Props = {
  leadId: string;
};

export async function LeadDossierTasksAsync({ leadId }: Props) {
  const task = await getNextLeadTask(leadId);

  if (!task) return null;

  const isOverdue = task.due_at && new Date(task.due_at) < new Date();

  return (
    <div
      style={{
        background:   isOverdue ? 'var(--color-danger-light)' : 'var(--theme-accent-surface)',
        border:       `1px solid ${isOverdue ? 'var(--color-danger)' : 'var(--theme-paper-border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding:      'var(--space-4) var(--space-5)',
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-4)',
      }}
    >
      <CalendarClock
        style={{
          width:       '1.25rem',
          height:      '1.25rem',
          color:       isOverdue ? 'var(--color-danger-text)' : 'var(--theme-accent)',
          strokeWidth: 1.5,
          flexShrink:  0,
        }}
      />

      <div style={{ flex: 1 }}>
        <p
          style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         isOverdue ? 'var(--color-danger-text)' : 'var(--theme-accent)',
            margin:        '0 0 var(--space-1)',
          }}
        >
          {isOverdue ? 'Overdue Task' : 'Next Task'}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            color:      isOverdue ? 'var(--color-danger-text)' : 'var(--theme-text-primary)',
            margin:     0,
          }}
        >
          {TASK_TYPE_LABELS[task.task_type]}
        </p>
      </div>

      {task.due_at && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize:   'var(--text-xs)',
            color:      isOverdue ? 'var(--color-danger-text)' : 'var(--theme-text-tertiary)',
            margin:     0,
            whiteSpace: 'nowrap',
          }}
        >
          Due {formatDate(task.due_at, 'dd MMM yyyy')}
        </p>
      )}
    </div>
  );
}
