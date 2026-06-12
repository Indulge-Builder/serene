"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { MyTasksCalendarView } from "@/components/tasks/MyTasksCalendarView";
import { GroupTasksTab } from "@/components/tasks/GroupTasksTab";
import { GiaTasksTab } from "@/components/tasks/GiaTasksTab";
import { CreateGiaTaskModal } from "@/components/tasks/CreateGiaTaskModal";
import { TasksFilters } from "@/components/tasks/TasksFilters";
import { TabSelector, type TabItem } from "@/components/ui/TabSelector";
import { useTasksCreate } from "@/components/tasks/TasksCreateContext";
import { useCreateTriggerModal } from "@/hooks/useCreateTriggerModal";
import { getPersonalTaskTagsAction } from "@/lib/actions/tasks";
import { DOMAIN_LABELS, compareDomainDisplayOrder } from "@/lib/constants/domains";
import type { AssignableUser } from "@/lib/types";
import {
  EMPTY_PERSONAL_TASK_FILTERS,
  EMPTY_GROUP_TASK_FILTERS,
  EMPTY_GIA_TASK_FILTERS,
  domainsInGroupRows,
  filterGiaTasks,
  giaFiltersActiveCount,
  type PersonalTaskFiltersState,
  type GroupTaskFiltersState,
  type GiaTaskFiltersState,
} from "@/lib/utils/task-client-filters";
import type {
  PersonalTasksResult,
  TaskGroupRow,
  GiaTask,
} from "@/lib/services/tasks-service";
import type { UserRole, AppDomain, Task } from "@/lib/types/database";
import type { TaskTab } from "./page";

interface TasksShellProps {
  initialTab:    TaskTab;
  validTabs:     TaskTab[];
  personalResult: PersonalTasksResult;
  groupRows:     TaskGroupRow[];
  giaTasks:      GiaTask[];
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
  giaTasks,
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
  const [giaFilters, setGiaFilters] = useState<GiaTaskFiltersState>(
    EMPTY_GIA_TASK_FILTERS,
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
  const [giaVisibleCount, setGiaVisibleCount] = useState(giaTasks.length);

  // Gia modal state (create trigger from AddTaskButton → requestCreate)
  const [giaCreateOpen, setGiaCreateOpen] = useState(false);
  const [giaTasksList, setGiaTasksList] = useState<GiaTask[]>(giaTasks);

  const activeTab = initialTab;
  const isPrivileged = callerRole === "admin" || callerRole === "founder";

  const groupDomainItems = useMemo(
    () =>
      domainsInGroupRows(groupRows)
        .sort(compareDomainDisplayOrder)
        .map((d) => ({ id: d, label: DOMAIN_LABELS[d] ?? d })),
    [groupRows],
  );

  const openGiaCreateIfActive = useCallback(() => {
    if (activeTab === "gia") setGiaCreateOpen(true);
  }, [activeTab]);
  useCreateTriggerModal(createTrigger, openGiaCreateIfActive);

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
    gia:      "Gia Tasks",
    personal: "My Tasks",
    group:    "Group Tasks",
  };
  const TABS: TabItem[] = useMemo(
    () => validTabs.map((t) => ({ id: t, label: TAB_LABELS[t] })),
    // validTabs is serialised from the server — stable reference per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validTabs.join(",")],
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
          giaFilters={giaFilters}
          onGiaFiltersChange={setGiaFilters}
          resultCount={
            activeTab === "gia"      ? giaVisibleCount :
            activeTab === "personal" ? personalVisibleCount :
                                       groupVisibleCount
          }
          resultNoun={
            activeTab === "gia"      ? (giaVisibleCount === 1 ? "task" : "tasks") :
            activeTab === "personal" ? (personalVisibleCount === 1 ? "task" : "tasks") :
                                       (groupVisibleCount === 1 ? "group" : "groups")
          }
        />
      </div>

      {/* Tab panels */}
      {activeTab === "gia" ? (
        <>
          <GiaTasksTab
            initialTasks={giaTasksList}
            filters={giaFilters}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            callerRole={callerRole}
            callerDomain={callerDomain}
            createTrigger={createTrigger}
            onFilteredCountChange={setGiaVisibleCount}
            onTaskCreated={(task) => {
              setGiaTasksList((prev) => [task, ...prev]);
            }}
          />
          <AnimatePresence>
            {giaCreateOpen && (
              <CreateGiaTaskModal
                open={giaCreateOpen}
                onClose={() => setGiaCreateOpen(false)}
                onTaskCreated={(task) => {
                  setGiaTasksList((prev) => [task, ...prev]);
                  setGiaVisibleCount((n) => n + 1);
                  setGiaCreateOpen(false);
                }}
                callerRole={callerRole}
              />
            )}
          </AnimatePresence>
        </>
      ) : activeTab === "personal" ? (
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

// Re-export type for consumers that need to import GiaTask from the shell layer
export type { Task };
