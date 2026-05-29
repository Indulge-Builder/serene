"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { PersonalTasksTab } from "@/components/tasks/PersonalTasksTab";
import { GroupTasksTab } from "@/components/tasks/GroupTasksTab";
import { TabSelector, type TabItem } from "@/components/ui/TabSelector";
import type {
  PersonalTasksResult,
  TaskGroupRow,
} from "@/lib/services/tasks-service";
import type { UserRole, AppDomain } from "@/lib/types/database";

type Tab = "personal" | "group";

interface TasksShellProps {
  initialTab: Tab;
  personalResult: PersonalTasksResult;
  groupRows: TaskGroupRow[];
  currentUserId: string;
  currentUserName: string;
  callerRole: UserRole;
  callerDomain: AppDomain;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // createTrigger increments each time the header button is clicked.
  // Each tab watches it in a useEffect and opens its own modal.
  const [createTrigger, setCreateTrigger] = useState(0);

  const activeTab = initialTab;

  // Only manager+ can create group tasks
  const canCreateGroup = ["manager", "admin", "founder"].includes(callerRole);
  // Button is hidden on group tab for agents
  const showButton = activeTab === "personal" || canCreateGroup;

  function setTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    startTransition(() => {
      router.push(`/tasks?${params.toString()}`);
    });
  }

  const TABS: TabItem[] = [
    { id: "personal", label: "My Tasks" },
    { id: "group", label: "Group Tasks" },
  ];

  const buttonLabel = activeTab === "personal" ? "My Task" : "Group Task";

  return (
    <div>
      {/* Header row: tabs left, contextual button right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-6)",
        }}
      >
        <TabSelector
          tabs={TABS}
          activeTab={activeTab}
          onChange={(id) => setTab(id as Tab)}
          variant="pill"
        />

        {showButton && (
          <button
            type="button"
            onClick={() => setCreateTrigger((n) => n + 1)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              height: 36,
              padding: "0 var(--space-4)",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--theme-accent)",
              color: "var(--theme-accent-fg)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-semibold)",
              cursor: "pointer",
              transition: "var(--transition-interactive)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--theme-accent-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--theme-accent)";
            }}
          >
            <Plus style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
            {buttonLabel}
          </button>
        )}
      </div>

      {/* Tab panels */}
      {activeTab === "personal" ? (
        <PersonalTasksTab
          initialResult={personalResult}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          callerRole={callerRole}
          callerDomain={callerDomain}
          createTrigger={createTrigger}
        />
      ) : (
        <GroupTasksTab
          initialRows={groupRows}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          callerRole={callerRole}
          callerDomain={callerDomain}
          createTrigger={createTrigger}
        />
      )}
    </div>
  );
}
