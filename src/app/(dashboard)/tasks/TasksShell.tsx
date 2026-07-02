"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, useMemo } from "react";
import { MyTasksCalendarView } from "@/components/tasks/MyTasksCalendarView";
import { GroupTasksTab } from "@/components/tasks/GroupTasksTab";
import { TasksFilters } from "@/components/tasks/TasksFilters";
import { TabSelector, type TabItem } from "@/components/ui/TabSelector";
import { useTasksCreate } from "@/components/tasks/TasksCreateContext";
import { getPersonalTaskTagsAction } from "@/lib/actions/tasks";
import { DOMAIN_LABELS, compareDomainDisplayOrder } from "@/lib/constants/domains";
import type { AssignableUser } from "@/lib/types";
import {
  EMPTY_PERSONAL_TASK_FILTERS,
  EMPTY_GROUP_TASK_FILTERS,
  domainsInGroupRows,
  type PersonalTaskFiltersState,
  type GroupTaskFiltersState,
} from "@/lib/utils/task-client-filters";
import type {
  PersonalTasksResult,
  TaskGroupRow,
} from "@/lib/services/tasks-service";
import type { UserRole, AppDomain, Task } from "@/lib/types/database";
import type { TaskTab } from "./page";

interface TasksShellProps {
  initialTab:    TaskTab;
  validTabs:     TaskTab[];
  personalResult: PersonalTasksResult;
  groupRows:     TaskGroupRow[];
  currentUserId: string;
  currentUserName: string;
  callerRole:    UserRole;
  callerDomain:  AppDomain;
  initialAgents: AssignableUser[];
  initialTags:   string[];
}

export function TasksShell({
  initialTab,
  validTabs,
  personalResult,
  groupRows,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
  initialAgents,
  initialTags,
}: TasksShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const { createTrigger } = useTasksCreate();

  const [personalFilters, setPersonalFilters] = useState<PersonalTaskFiltersState>(
    EMPTY_PERSONAL_TASK_FILTERS,
  );
  const [groupFilters, setGroupFilters] = useState<GroupTaskFiltersState>(
    EMPTY_GROUP_TASK_FILTERS,
  );
  const [personalTagItems, setPersonalTagItems] = useState<string[]>(initialTags);

  // TasksAsync fetches tags only when the personal tab is active, and this
  // component never remounts on tab switches (per-tab filter state must
  // survive). Re-seed from the prop on every personal-tab RSC pass so a
  // user who landed on gia/group and switched here still gets fresh tags.
  useEffect(() => {
    if (initialTab === "personal") setPersonalTagItems(initialTags);
  }, [initialTab, initialTags]);
  const [personalVisibleCount, setPersonalVisibleCount] = useState(
    personalResult.tasks.length,
  );
  const [groupVisibleCount, setGroupVisibleCount] = useState(groupRows.length);

  const activeTab = initialTab;
  const isPrivileged = callerRole === "admin" || callerRole === "founder";

  const countLabel =
    activeTab === "personal"
      ? `${personalVisibleCount} ${personalVisibleCount === 1 ? "task" : "tasks"}`
      : `${groupVisibleCount} ${groupVisibleCount === 1 ? "group" : "groups"}`;

  const groupDomainItems = useMemo(
    () =>
      domainsInGroupRows(groupRows)
        .sort(compareDomainDisplayOrder)
        .map((d) => ({ id: d, label: DOMAIN_LABELS[d] ?? d })),
    [groupRows],
  );

  function setTab(tab: TaskTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    startTransition(() => {
      router.push(`/tasks?${params.toString()}`);
    });
  }

  // Derive the tab bar directly from the server-validated validTabs array.
  // This is the only correct source — rebuilding it client-side from initialTab
  // breaks when the user navigates between tabs (initialTab changes each RSC pass).
  const TAB_LABELS: Record<TaskTab, string> = {
    personal: "My Tasks",
    group:    "Group Tasks",
  };
  // validTabs is serialised from the server — key on its joined value so the
  // memo survives a fresh array reference per render.
  const validTabsKey = validTabs.join(",");
  const TABS: TabItem[] = useMemo(
    () => validTabs.map((t) => ({ id: t, label: TAB_LABELS[t] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validTabsKey],
  );

  return (
    <div>
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-4)",
          padding:      "var(--space-4) var(--space-5)",
          marginBottom: "var(--space-4)",
          background:   "var(--theme-paper)",
          border:       "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-md)",
          boxShadow:    "var(--shadow-1)",
          flexWrap:     "wrap",
        }}
      >
        {/* Tab tray can exceed narrow phone widths (3 tabs ≈ 330px) — scroll
            horizontally within the strip instead of overflowing the paper. */}
        <div
          style={{
            maxWidth:       '100%',
            minWidth:       0,
            overflowX:      'auto',
            scrollbarWidth: 'none',
            flexShrink:     0,
          }}
        >
          <TabSelector
            tabs={TABS}
            activeTab={activeTab}
            onChange={(id) => setTab(id as TaskTab)}
            variant="accent"
            indicatorLayoutId="tasks-page-tabs"
          />
        </div>

        <TasksFilters
          activeTab={activeTab}
          personalFilters={personalFilters}
          onPersonalFiltersChange={setPersonalFilters}
          personalTagItems={personalTagItems}
          groupFilters={groupFilters}
          onGroupFiltersChange={setGroupFilters}
          groupDomainItems={groupDomainItems}
          showGroupDomainFilter={isPrivileged}
        />

        {/* Result count — a stable sibling of the FilterBar, NOT inside it, so
            it never scrolls out of view on the mobile single-row scroll layout
            (the FilterBar's overflow-x). marginLeft:auto pins it to the strip's
            right edge on the wrapping desktop layout. */}
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
            whiteSpace: "nowrap",
            marginLeft: "auto",
            flexShrink: 0,
          }}
        >
          {countLabel}
        </span>
      </div>

      {/* Tab panels */}
      {activeTab === "personal" ? (
        <MyTasksCalendarView
          initialResult={personalResult}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          callerRole={callerRole}
          callerDomain={callerDomain}
          initialAgents={initialAgents}
          createTrigger={createTrigger}
          filters={personalFilters}
          onFilteredCountChange={setPersonalVisibleCount}
          onTagsMayHaveChanged={() => {
            getPersonalTaskTagsAction().then((r) => {
              if (r.data) setPersonalTagItems(r.data);
            }).catch(() => {});
          }}
        />
      ) : (
        <GroupTasksTab
          initialRows={groupRows}
          filters={groupFilters}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          callerRole={callerRole}
          callerDomain={callerDomain}
          initialAgents={initialAgents}
          createTrigger={createTrigger}
          onFilteredCountChange={setGroupVisibleCount}
        />
      )}
    </div>
  );
}

// Re-export type for consumers that need to import Task from the shell layer
export type { Task };
