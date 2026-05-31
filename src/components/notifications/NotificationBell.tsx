"use client";

/**
 * NotificationBell — bell icon with unread dot and panel.
 * Client component. Sits in the Sidebar footer (current bell position).
 * Unread indicator: dot only — never a number badge (spec L-04).
 * No Supabase calls here — all state managed through useNotifications hook.
 */

import { useRef, useState } from "react";
import { Bell } from "lucide-react";
import { motion } from "framer-motion";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { EASE_OUT_EXPO, EASE_SPRING } from "@/lib/constants/motion";
import type { Notification } from "@/lib/types/database";

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotificationBellProps {
  userId:      string;
  initialData: Notification[];
  variant?:    "sidebar" | "topbar";
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

  const isSidebar  = variant === "sidebar";
  const hasUnread  = unreadCount > 0;
  const isActive   = open || hasUnread;

  return (
    <div style={{ position: "relative" }}>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-label={`Notifications${hasUnread ? ` — ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.88, transition: { type: "spring", bounce: 0, duration: 0.2, ease: EASE_SPRING } }}
        transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
        style={{
          willChange:      "transform",
          position:        "relative",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          width:           "32px",
          height:          "32px",
          borderRadius:    "var(--radius-md)",
          border:          "none",
          background:      "transparent",
          color:           isActive
            ? (isSidebar ? "var(--theme-sidebar-active)" : "var(--theme-text-primary)")
            : (isSidebar ? "var(--theme-sidebar-text)"   : "var(--theme-text-secondary)"),
          cursor:          "pointer",
          flexShrink:      0,
          transition:      "color var(--transition-hover)",
        }}
      >
        <Bell style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />

        {/* Unread dot — always in DOM for layout stability. Animates in once on arrival. */}
        <motion.span
          key={hasUnread ? "on" : "off"}
          aria-hidden="true"
          initial={{ scale: 0 }}
          animate={{ scale: hasUnread ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          style={{
            position:     "absolute",
            top:          "4px",
            right:        "4px",
            width:        "6px",
            height:       "6px",
            borderRadius: "var(--radius-full)",
            background:   "var(--theme-accent)",
            opacity:      hasUnread ? 1 : 0,
            pointerEvents: "none",
          }}
        />
      </motion.button>

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
