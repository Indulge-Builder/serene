'use client';

// FounderPerformanceShell — client component.
// Owns the Agents / Domains tab state (never written to URL — Invariant 14).
// agentsSlot is a server-rendered subtree passed as a prop (RSC composition pattern).
// Both tabs share the same period/customFrom/customTo from URL params.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { PerformancePeriod } from '@/lib/services/performance-service';
import type { DomainHealthCard } from '@/lib/types/index';
import type { AppDomain } from '@/lib/types/database';

// Loaded on intent (perf audit G-3): the Domains tab is the only Recharts
// consumer in the founder shell, so its chunk is fetched on first tab click
// instead of shipping in the /performance initial chunk.
const DomainOverviewPanel = dynamic(
  () => import('@/components/performance/DomainOverviewPanel').then((mod) => mod.DomainOverviewPanel),
  { loading: () => <DomainsTabFallback /> },
);

function DomainsTabFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: '300px', borderRadius: 'var(--radius-lg)' }} />
    </div>
  );
}

type Tab = 'agents' | 'domains';

type Props = {
  domain:              AppDomain;
  period:              PerformancePeriod;
  customFrom?:         string;
  customTo?:           string;
  initialDomainHealth: DomainHealthCard[];
  agentsSlot:          React.ReactNode;
};

export function FounderPerformanceShell({
  period,
  customFrom,
  customTo,
  initialDomainHealth,
  agentsSlot,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('agents');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {(['agents', 'domains'] as Tab[]).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                padding:      '5px 14px',
                borderRadius: 'var(--radius-full)',
                border:       '1px solid transparent',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-sm)',
                fontWeight:   isActive ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                cursor:       'pointer',
                transition:   'background 150ms ease, color 150ms ease, border-color 150ms ease',
                background:   isActive ? 'var(--theme-accent-surface)' : 'transparent',
                color:        isActive ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                borderColor:  isActive
                  ? 'color-mix(in srgb, var(--theme-accent) 22%, transparent)'
                  : 'transparent',
              }}
            >
              {tab === 'agents' ? 'Agents' : 'Domains'}
            </button>
          );
        })}
      </div>

      {/* Tab content — agentsSlot is a server-rendered subtree */}
      <div style={{ display: activeTab === 'agents' ? 'block' : 'none' }}>
        {agentsSlot}
      </div>

      {activeTab === 'domains' && (
        <DomainOverviewPanel
          initialData={initialDomainHealth}
          period={period}
          customFrom={customFrom}
          customTo={customTo}
        />
      )}
    </div>
  );
}
