"use client";

/**
 * NotificationItem — single row in the notification panel.
 * Unread: paper-subtle bg + shadow-1. Read: transparent, hover adds paper-subtle.
 * Box-shadow state is set via class swap only — never animated (paint cost).
 * Tap: whileTap scale 0.98 spring. Optimistic mark-read before navigation.
 */

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { UserPlus, Trophy, Clock, CheckSquare, AtSign, Info, AlertTriangle } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/dates";
import { assertNever } from "@/lib/utils/assert-never";
import type { Notification, NotificationType } from "@/lib/types/database";

// ─── Type → icon colour ────────────────────────────────────────────────────────

function getTypeIconColor(type: NotificationType): string {
  switch (type) {
    case "sla_breach_agent":    return "var(--color-warning-text)";
    case "sla_breach_manager":  return "var(--color-danger-text)";
    default:                    return "var(--theme-accent)";
  }
}

// ─── Type → icon map ─────────────────────────────────────────────────────────

function getTypeIcon(type: NotificationType): React.ElementType {
  switch (type) {
    case "lead_assigned":      return UserPlus;
    case "lead_won":           return Trophy;
    case "task_due":           return Clock;
    case "task_assigned":      return CheckSquare;
    case "mention":            return AtSign;
    case "system":             return Info;
    case "sla_breach_agent":   return AlertTriangle;
    case "sla_breach_manager": return AlertTriangle;
  }
  return assertNever(type);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotificationItemProps {
  notification: Notification;
  onMarkRead:   (id: string) => void;
  onClose:      () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationItem({ notification, onMarkRead, onClose }: NotificationItemProps) {
  const router    = useRouter();
  const isUnread  = notification.read_at === null;
  const Icon      = getTypeIcon(notification.type);
  const iconColor = getTypeIconColor(notification.type);

  function handleClick() {
    // Optimistic mark-read before navigation
    onMarkRead(notification.id);

    if (notification.action_url) {
      const url = notification.action_url;
      if (url.startsWith("/") && !url.startsWith("//")) {
        router.push(url);
        onClose();
      }
    }
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={{ scale: 0.98, transition: { type: "spring", bounce: 0, duration: 0.15 } }}
      style={{
        display:      "flex",
        alignItems:   "flex-start",
        gap:          "var(--space-3)",
        width:        "100%",
        padding:      "var(--space-3) var(--space-4)",
        // Unread: paper-subtle + shadow-1. Read: transparent.
        // box-shadow transition omitted intentionally — animating it causes paint on every frame.
        background:   isUnread ? "var(--theme-paper-subtle)" : "transparent",
        boxShadow:    isUnread ? "var(--shadow-1)"           : "none",
        borderRadius: isUnread ? "var(--radius-md)"          : "0",
        border:       "none",
        cursor:       "pointer",
        textAlign:    "left",
        transition:   "background var(--transition-hover)",
        margin:       isUnread ? "0 var(--space-2)" : 0,
      }}
      onMouseEnter={(e) => {
        if (!isUnread) {
          (e.currentTarget as HTMLElement).style.background = "var(--theme-paper-subtle)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isUnread) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
    >
      {/* Unread dot — always in DOM, opacity-controlled for layout stability */}
      <div
        aria-hidden="true"
        style={{
          width:        "6px",
          height:       "6px",
          borderRadius: "var(--radius-full)",
          background:   "var(--theme-accent)",
          opacity:      isUnread ? 1 : 0,
          flexShrink:   0,
          marginTop:    "8px",
        }}
      />

      {/* Type icon container */}
      <div
        style={{
          width:          "28px",
          height:         "28px",
          borderRadius:   "var(--radius-sm)",
          background:     "var(--theme-accent-surface)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          color:          iconColor,
        }}
      >
        <Icon style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin:      0,
            fontFamily:  "var(--font-sans)",
            fontSize:    "var(--text-sm)",
            fontWeight:  isUnread ? "var(--weight-medium)" : "var(--weight-normal)",
            color:       "var(--theme-text-primary)",
            lineHeight:  "var(--leading-snug)",
          }}
        >
          {notification.title}
        </p>

        {notification.body && (
          <p
            style={{
              margin:              "2px 0 0",
              fontFamily:          "var(--font-sans)",
              fontSize:            "var(--text-xs)",
              fontWeight:          "var(--weight-normal)",
              color:               "var(--theme-text-secondary)",
              lineHeight:          "var(--leading-relaxed)",
              overflow:            "hidden",
              display:             "-webkit-box",
              WebkitLineClamp:     2,
              WebkitBoxOrient:     "vertical",
            }}
          >
            {notification.body}
          </p>
        )}

        <p
          style={{
            margin:     "var(--space-1) 0 0",
            fontFamily: "var(--font-mono)",
            fontSize:   "var(--text-2xs)",
            color:      "var(--theme-text-tertiary)",
          }}
        >
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
    </motion.button>
  );
}
