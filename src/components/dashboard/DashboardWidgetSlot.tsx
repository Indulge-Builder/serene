'use client';

import { Suspense, lazy, useEffect, useState } from 'react';
import { WIDGET_MAP, type WidgetSize } from '@/lib/constants/dashboard-widgets';
import { WidgetSkeleton } from './WidgetSkeleton';
import type { UserRole, AppDomain } from '@/lib/types/database';

// Static dynamic import map — never use require() from a string.
// Each widget is code-split independently. Roles that cannot see a widget
// never load its bundle.
const WIDGET_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<WidgetProps>>> = {
  'agent-tasks':         lazy(() => import('./widgets/AgentTasksWidget').then((m) => ({ default: m.AgentTasksWidget }))),
  'agent-activity':      lazy(() => import('./widgets/AgentActivityWidget').then((m) => ({ default: m.AgentActivityWidget }))),
  'manager-lead-status': lazy(() => import('./widgets/ManagerLeadStatusWidget').then((m) => ({ default: m.ManagerLeadStatusWidget }))),
  'manager-lead-volume': lazy(() => import('./widgets/ManagerLeadVolumeWidget').then((m) => ({ default: m.ManagerLeadVolumeWidget }))),
  'manager-campaigns':   lazy(() => import('./widgets/ManagerCampaignWidget').then((m) => ({ default: m.ManagerCampaignWidget }))),
};

export type WidgetProps = {
  userId: string;
  role:   UserRole;
  domain: AppDomain;
};

type DashboardWidgetSlotProps = WidgetProps & {
  widgetId:   string;
  size:       WidgetSize;
  editMode:   boolean;
  onRemove:   (widgetId: string) => void;
  dragHandle?: React.ReactNode;
};

// Enforce minimum skeleton display time (V-08: never < 150ms)
function MinSkeletonBoundary({ size, children }: { size: WidgetSize; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return <WidgetSkeleton size={size} />;
  return <>{children}</>;
}

export function DashboardWidgetSlot({
  widgetId,
  size,
  editMode,
  onRemove,
  dragHandle,
  userId,
  role,
  domain,
}: DashboardWidgetSlotProps) {
  const definition = WIDGET_MAP[widgetId];
  const Component  = WIDGET_COMPONENTS[widgetId];

  if (!definition || !Component) return null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Edit mode overlay — drag handle + remove button */}
      {editMode && (
        <div
          style={{
            position:     'absolute',
            inset:        0,
            zIndex:       'var(--z-raised)',
            borderRadius: 'var(--radius-lg)',
            border:       '2px dashed var(--theme-accent)',
            pointerEvents: 'none',
          }}
        />
      )}

      {editMode && (
        <div
          style={{
            position:       'absolute',
            top:            'var(--space-2)',
            right:          'var(--space-2)',
            zIndex:         'calc(var(--z-raised) + 1)',
            display:        'flex',
            gap:            'var(--space-1)',
            alignItems:     'center',
          }}
        >
          {dragHandle}
          <button
            onClick={() => onRemove(widgetId)}
            aria-label={`Remove ${definition.label}`}
            style={{
              width:        '24px',
              height:       '24px',
              borderRadius: 'var(--radius-full)',
              border:       '1px solid var(--theme-paper-border)',
              background:   'var(--theme-paper)',
              color:        'var(--color-danger)',
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              fontSize:     '14px',
              lineHeight:   1,
            }}
          >
            ×
          </button>
        </div>
      )}

      <Suspense fallback={<WidgetSkeleton size={size} />}>
        <MinSkeletonBoundary size={size}>
          <Component userId={userId} role={role} domain={domain} />
        </MinSkeletonBoundary>
      </Suspense>
    </div>
  );
}
