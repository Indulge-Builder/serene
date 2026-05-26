"use client";

import { useTransition } from "react";
import { toggleUserActive } from "@/lib/actions/profiles";
import { toggleAgentRouting } from "@/lib/actions/agent-routing";
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <button
            type="button"
            role="switch"
            aria-checked={user.is_active}
            disabled={pendingActive}
            onClick={handleToggleActive}
            style={toggleStyle(user.is_active, pendingActive)}
          >
            <span style={thumbStyle(user.is_active)} />
          </button>
          <div>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-sm)",
                fontWeight: "var(--weight-medium)",
                color:      "var(--theme-text-primary)",
                margin:     0,
              }}
            >
              Account {user.is_active ? "active" : "inactive"}
            </p>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-xs)",
                color:      "var(--theme-text-tertiary)",
                margin:     "2px 0 0",
              }}
            >
              {user.is_active
                ? "User can log in and access the system."
                : "User is locked out of the system."}
            </p>
          </div>
        </div>
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
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <button
              type="button"
              role="switch"
              aria-checked={routingConfig.is_active}
              disabled={pendingRouting}
              onClick={handleToggleRouting}
              style={toggleStyle(routingConfig.is_active, pendingRouting)}
            >
              <span style={thumbStyle(routingConfig.is_active)} />
            </button>
            <div>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-sm)",
                  fontWeight: "var(--weight-medium)",
                  color:      "var(--theme-text-primary)",
                  margin:     0,
                }}
              >
                Lead routing {routingConfig.is_active ? "on" : "off"}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-xs)",
                  color:      "var(--theme-text-tertiary)",
                  margin:     "2px 0 0",
                }}
              >
                {routingConfig.is_active
                  ? "Agent receives new leads via round-robin."
                  : "Agent is paused — no new leads will be assigned."}
              </p>
            </div>
          </div>
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

function toggleStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    position:        "relative",
    width:           "40px",
    height:          "22px",
    borderRadius:    "var(--radius-full)",
    border:          "none",
    cursor:          disabled ? "not-allowed" : "pointer",
    background:      active ? "var(--theme-accent)" : "var(--theme-paper-border)",
    transition:      "background var(--duration-fast) var(--ease-in-out)",
    opacity:         disabled ? 0.6 : 1,
    flexShrink:      0,
    padding:         0,
  };
}

function thumbStyle(active: boolean): React.CSSProperties {
  return {
    position:    "absolute",
    top:         "3px",
    left:        active ? "21px" : "3px",
    width:       "16px",
    height:      "16px",
    borderRadius: "var(--radius-full)",
    background:  "var(--theme-paper)",
    boxShadow:   "var(--shadow-1)",
    transition:  "left var(--duration-fast) var(--ease-spring)",
    display:     "block",
  };
}
