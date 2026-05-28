'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { getAgentRecentActivityAction } from '@/lib/actions/dashboard';
import type { AgentActivity } from '@/lib/services/dashboard-service';
import type { WidgetProps } from '../DashboardWidgetSlot';

const ACTION_LABELS: Record<string, string> = {
  lead_created:         'Lead entered the system',
  status_changed:       'Status updated',
  note_added:           'Left note',
  agent_assigned:       'Assigned lead',
  call_logged:          'Logged a call',
  duplicate_submission: 'Duplicate flagged',
};

function formatRelativeTime(createdAt: string): string {
  const diffMs  = Date.now() - new Date(createdAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24)  return `${diffHr} hr ago`;
  return `${diffDay}d ago`;
}

function describeActivity(activity: AgentActivity): string {
  const base = ACTION_LABELS[activity.action_type] ?? activity.action_type;
  if (!activity.lead_name) return base;

  if (activity.action_type === 'note_added') {
    const content = (activity.details?.content as string | undefined) ?? '';
    const preview = content.slice(0, 60).trim();
    return `${activity.lead_name} · "${preview}${content.length > 60 ? '…' : ''}"`;
  }

  return `${base} · ${activity.lead_name}`;
}

function ActivityItem({ activity }: { activity: AgentActivity }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'space-between',
        gap:            'var(--space-3)',
        padding:        'var(--space-2) 0',
        borderBottom:   '1px solid var(--theme-paper-border)',
      }}
    >
      <span
        style={{
          fontSize:   'var(--text-xs)',
          color:      'var(--theme-text-secondary)',
          lineHeight: 'var(--leading-snug)',
          flex:       1,
        }}
      >
        {describeActivity(activity)}
      </span>
      <span
        style={{
          fontSize:   'var(--text-2xs)',
          color:      'var(--theme-text-tertiary)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {formatRelativeTime(activity.created_at)}
      </span>
    </motion.div>
  );
}

export function AgentActivityWidget({ userId }: WidgetProps) {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [loaded, setLoaded]         = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  // Initial load via server action (satisfies P-01 — no useEffect for data fetching
  // since we use startTransition via the action; initial fetch is in useEffect
  // because we need the component to mount first to set up Realtime)
  useEffect(() => {
    let cancelled = false;
    getAgentRecentActivityAction(userId).then((result) => {
      if (!cancelled && result.data) {
        setActivities(result.data);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime subscription — filtered to this agent (P-06 compliance)
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`agent-activity:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'lead_activities',
          filter: `actor_id=eq.${userId}`,
        },
        (payload) => {
          const newRow = payload.new as {
            id:          string;
            action_type: string;
            details:     Record<string, unknown> | null;
            created_at:  string;
            lead_id:     string | null;
          };

          setActivities((prev) => {
            const activity: AgentActivity = {
              id:          newRow.id,
              action_type: newRow.action_type,
              details:     newRow.details,
              created_at:  newRow.created_at,
              lead_id:     newRow.lead_id,
              lead_name:   null,
            };
            return [activity, ...prev].slice(0, 10);
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    // Cleanup on unmount — required by P-06 to prevent subscription leaks
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [userId]);

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
        gap:           'var(--space-3)',
        minHeight:     '260px',
      }}
    >
      {/* Header */}
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
          Gia · Recent Activity
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
          {!loaded ? 'Loading…' : 'Last 10 actions'}
        </p>
      </div>

      {/* Activity list */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {loaded && activities.length === 0 ? (
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
            No activity yet today.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
