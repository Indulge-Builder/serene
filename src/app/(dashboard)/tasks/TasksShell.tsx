'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { PersonalTasksTab } from '@/components/tasks/PersonalTasksTab';
import { GroupTasksTab } from '@/components/tasks/GroupTasksTab';
import type { PersonalTasksResult, TaskGroupRow } from '@/lib/services/tasks-service';
import type { UserRole, AppDomain } from '@/lib/types/database';

type Tab = 'personal' | 'group';

interface TasksShellProps {
  initialTab:      Tab;
  personalResult:  PersonalTasksResult;
  groupRows:       TaskGroupRow[];
  currentUserId:   string;
  currentUserName: string;
  callerRole:      UserRole;
  callerDomain:    AppDomain;
}

export function TasksShell({
  initialTab,
  personalResult,
  groupRows,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
}: TasksShellProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeTab = initialTab;

  function setTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    startTransition(() => {
      router.push(`/tasks?${params.toString()}`);
    });
  }

  return (
    <div>
      {/* Tab bar */}
      <div
        style={{
          display:      'flex',
          gap:          0,
          marginBottom: 'var(--space-6)',
          borderBottom: '1px solid var(--theme-paper-border)',
        }}
        role="tablist"
        aria-label="Task views"
      >
        {(['personal', 'group'] as Tab[]).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(tab)}
              style={{
                padding:       'var(--space-2) var(--space-5)',
                borderRadius:  'var(--radius-sm) var(--radius-sm) 0 0',
                border:        'none',
                borderBottom:  isActive
                  ? '2px solid var(--theme-accent)'
                  : '2px solid transparent',
                background:    isActive ? 'var(--theme-accent-surface)' : 'transparent',
                color:         isActive ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                fontFamily:    'var(--font-sans)',
                fontSize:      'var(--text-sm)',
                fontWeight:    isActive ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                cursor:        'pointer',
                transition:    'all var(--duration-fast) var(--ease-in-out)',
                whiteSpace:    'nowrap',
                marginBottom:  '-1px',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color      = 'var(--theme-text-primary)';
                  e.currentTarget.style.background = 'var(--theme-paper-subtle)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color      = 'var(--theme-text-secondary)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {tab === 'personal' ? 'Personal' : 'Group'}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {activeTab === 'personal' ? (
        <PersonalTasksTab
          initialResult={personalResult}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          callerRole={callerRole}
          callerDomain={callerDomain}
        />
      ) : (
        <GroupTasksTab
          initialRows={groupRows}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          callerRole={callerRole}
          callerDomain={callerDomain}
        />
      )}
    </div>
  );
}
