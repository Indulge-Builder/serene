'use client';

import { Plus } from 'lucide-react';
import { usePortalAnchor } from '@/hooks/usePortalAnchor';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import { DASHBOARD_WIDGETS } from '@/lib/constants/dashboard-widgets';
import type { UserRole } from '@/lib/types/database';

/**
 * Edit-mode "Add widget" control — the counterpart to the per-widget remove ×.
 * Removing a widget drops it from the layout; this brings any role-available
 * widget that isn't currently placed back onto the canvas (lands bottom-left,
 * RGL compacts it in). Only shown in edit mode (DashboardCanvas gates it).
 *
 * Anchored via the canonical usePortalAnchor + <FloatingPanel> (portal escape) —
 * never re-implement dropdown positioning inline.
 */
export function AddWidgetMenu({
  role,
  placedIds,
  onAdd,
}: {
  role: UserRole;
  placedIds: Set<string>;
  onAdd: (widgetId: string) => void;
}) {
  const isMobile = useMediaQuery(MQ.mobile);
  const anchor = usePortalAnchor({ estimatedWidth: 300, estimatedHeight: 280 });

  // Widgets this role can see that aren't on the canvas right now = the removed set.
  const available = DASHBOARD_WIDGETS.filter(
    (w) => w.roles.includes(role) && !placedIds.has(w.id),
  );

  return (
    <>
      <button
        ref={anchor.triggerRef}
        type="button"
        onClick={anchor.toggle}
        aria-expanded={anchor.open}
        aria-haspopup="menu"
        aria-label="Add a widget"
        className="serene-pressable serene-touch"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-1)',
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--weight-medium)',
          color: 'var(--theme-text-secondary)',
          background: 'var(--theme-paper-subtle)',
          border: '1px solid var(--theme-paper-border)',
          borderRadius: isMobile ? 'var(--radius-full)' : 'var(--radius-sm)',
          cursor: 'pointer',
          padding: isMobile ? 0 : '0 var(--space-3)',
          width: isMobile ? '32px' : undefined,
          height: '32px',
          flexShrink: 0,
        }}
      >
        <Plus size={isMobile ? 15 : 12} strokeWidth={1.5} />
        {!isMobile && 'Add widget'}
        {!isMobile && available.length > 0 && (
          <span
            style={{
              minWidth: '16px',
              height: '16px',
              padding: '0 var(--space-1)',
              borderRadius: 'var(--radius-full)',
              background: 'var(--theme-accent-surface)',
              color: 'var(--theme-accent)',
              fontSize: 'var(--text-2xs)',
              fontWeight: 'var(--weight-semibold)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {available.length}
          </span>
        )}
      </button>

      <FloatingPanel {...anchor.panelProps} panelKey="add-widget" style={{ width: '300px', padding: 'var(--space-2)' }}>
        {available.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 'var(--text-sm)',
              color: 'var(--theme-text-tertiary)',
              textAlign: 'center',
              padding: 'var(--space-3) var(--space-2)',
              margin: 0,
            }}
          >
            Every widget is already on your dashboard.
          </p>
        ) : (
          <div role="menu" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', maxHeight: '320px', overflowY: 'auto' }}>
            {available.map((w) => (
              <button
                key={w.id}
                role="menuitem"
                type="button"
                onClick={() => onAdd(w.id)}
                className="serene-pressable"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  width: '100%',
                  textAlign: 'left',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'background var(--duration-fast) var(--ease-in-out)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--theme-text-primary)' }}>
                    {w.label}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', lineHeight: 1.4 }}>
                    {w.description}
                  </span>
                </span>
                <Plus size={16} strokeWidth={1.5} style={{ color: 'var(--theme-accent)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </FloatingPanel>
    </>
  );
}
