"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { TabSelector, type TabItem } from "@/components/ui/TabSelector";
import { AgentRosterTab } from "@/components/settings/AgentRosterTab";
import { AgentShiftsTab } from "@/components/settings/AgentShiftsTab";
import type { AgentRosterRow, UserRole, AppDomain } from "@/lib/types/database";

type Tab = "roster" | "shifts";

const TABS: TabItem[] = [
  { id: "roster", label: "Assignment" },
  { id: "shifts", label: "Shifts" },
];

interface SettingsShellProps {
  initialTab:    Tab;
  initialRoster: AgentRosterRow[];
  callerRole:    UserRole;
  callerDomain:  AppDomain;
}

export function SettingsShell({
  initialTab,
  initialRoster,
  callerRole,
  callerDomain,
}: SettingsShellProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    startTransition(() => {
      router.replace(`/settings?${params.toString()}`);
    });
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <TabSelector
          tabs={TABS}
          activeTab={initialTab}
          onChange={(id) => setTab(id as Tab)}
          variant="pill"
          indicatorLayoutId="settings-tab-indicator"
        />
      </div>

      {initialTab === "roster" ? (
        <AgentRosterTab
          initialRoster={initialRoster}
          callerRole={callerRole}
          callerDomain={callerDomain}
        />
      ) : (
        <AgentShiftsTab
          initialRoster={initialRoster}
          callerRole={callerRole}
          callerDomain={callerDomain}
        />
      )}
    </div>
  );
}
