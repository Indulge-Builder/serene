"use client";

import { useTransition } from "react";
import { toggleUserActive } from "@/lib/actions/profiles";
import { toggleAgentRouting } from "@/lib/actions/agent-routing";
import { Toggle } from '@/components/ui/Toggle';
import type { Profile, AgentRoutingConfig } from "@/lib/types/database";

type Props = {
  user:              Profile;
  routingConfig:     AgentRoutingConfig | null;
  isPrivileged:      boolean;
  canToggleRouting:  boolean;
};

export function UserStatusControls({
  user,
  routingConfig,
  isPrivileged,
  canToggleRouting,
}: Props) {
  const [pendingActive,  startActiveTransition]  = useTransition();
  const [pendingRouting, startRoutingTransition] = useTransition();

  function handleToggleActive() {
    const fd = new FormData();
    fd.set("id",        user.id);
    fd.set("is_active", String(!user.is_active));
    startActiveTransition(async () => { await toggleUserActive(fd); });
  }

  function handleToggleRouting() {
    if (!routingConfig) return;
    const fd = new FormData();
    fd.set("agent_id",  user.id);
    fd.set("is_active", String(!routingConfig.is_active));
    startRoutingTransition(async () => { await toggleAgentRouting(fd); });
  }

  const showRouting = user.role === "agent" && canToggleRouting && routingConfig !== null;

  return (
    <div
      style={{
        padding:   "var(--space-4) var(--space-8)",
        display:   "flex",
        gap:       "var(--space-6)",
        flexWrap:  "wrap",
        alignItems: "center",
      }}
    >
      {/* Account active toggle */}
      {isPrivileged && (
        <Toggle
          checked={user.is_active}
          onChange={handleToggleActive}
          disabled={pendingActive}
          label={`Account ${user.is_active ? "active" : "inactive"}`}
          description={
            user.is_active
              ? "User can log in and access the system."
              : "User is locked out of the system."
          }
        />
      )}

      {/* Routing active toggle — agents only */}
      {showRouting && routingConfig && (
        <>
          {isPrivileged && (
            <div
              style={{
                width:      "1px",
                height:     "40px",
                background: "var(--theme-paper-border)",
              }}
            />
          )}
          <Toggle
            checked={routingConfig.is_active}
            onChange={handleToggleRouting}
            disabled={pendingRouting}
            label={`Lead routing ${routingConfig.is_active ? "on" : "off"}`}
            description={
              routingConfig.is_active
                ? "Agent receives new leads via round-robin."
                : "Agent is paused — no new leads will be assigned."
            }
          />
        </>
      )}

      {/* When neither control is visible (e.g. manager viewing non-agent) */}
      {!isPrivileged && !showRouting && (
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-sm)",
            color:      "var(--theme-text-tertiary)",
            margin:     0,
          }}
        >
          {user.is_active ? "Active" : "Inactive"}
          {user.is_on_leave && " · On leave"}
        </p>
      )}
    </div>
  );
}

