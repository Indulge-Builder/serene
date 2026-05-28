"use client";

/**
 * NotificationBell — bell icon with unread dot and panel.
 * Client component. Sits in the Sidebar footer (current bell position).
 * Unread indicator: dot only — never a number badge (spec L-04).
 * No Supabase calls here — all state managed through useNotifications hook.
 */

import { useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import type { Notification } from "@/lib/types/database";

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotificationBellProps {
  userId:      string;
  initialData: Notification[];
  variant?:    "sidebar" | "topbar";   // sidebar = canvas surface, topbar = paper surface
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell({
  userId,
  initialData,
  variant = "sidebar",
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const buttonRef       = useRef<HTMLButtonElement>(null);

  const { notifications, unreadCount, markRead, markAllRead } = useNotifications({
    userId,
    initialData,
  });

  const isSidebar = variant === "sidebar";

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        style={{
          position:        "relative",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          width:           "32px",
          height:          "32px",
          borderRadius:    "var(--radius-md)",
          border:          "none",
          background:      "transparent",
          color:           isSidebar ? "var(--theme-sidebar-text)" : "var(--theme-text-secondary)",
          cursor:          "pointer",
          flexShrink:      0,
          transition:      "background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isSidebar
            ? "var(--theme-sidebar-hover-bg)"
            : "var(--theme-paper-subtle)";
          e.currentTarget.style.color = isSidebar
            ? "var(--theme-canvas-text)"
            : "var(--theme-text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = isSidebar
            ? "var(--theme-sidebar-text)"
            : "var(--theme-text-secondary)";
        }}
      >
        <Bell style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />

        {/* Unread dot — single dot only, never a number badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position:     "absolute",
              top:          "4px",
              right:        "4px",
              width:        "8px",
              height:       "8px",
              borderRadius: "var(--radius-full)",
              background:   "var(--color-danger)",
              border:       `2px solid ${isSidebar ? "var(--theme-sidebar-bg)" : "var(--theme-paper)"}`,
            }}
          />
        )}
      </button>

      {/* Notification panel */}
      <NotificationPanel
        open={open}
        onClose={() => setOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        anchorRef={buttonRef}
      />
    </div>
  );
}
