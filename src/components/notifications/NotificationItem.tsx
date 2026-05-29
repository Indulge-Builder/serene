"use client";

/**
 * NotificationItem — single row in the notification panel.
 * Left dot indicates unread (always rendered to keep layout stable).
 * Icon mapped from notification type.
 */

import { useRouter } from "next/navigation";
import { UserPlus, Trophy, Clock, CheckSquare, AtSign, Info, AlertTriangle } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/dates";
import { assertNever } from "@/lib/utils/assert-never";
import type { Notification, NotificationType } from "@/lib/types/database";

// ─── Type → icon colour ────────────────────────────────────────────────────────

function getTypeIconColor(type: NotificationType): string {
  switch (type) {
    case "sla_breach_agent":   return "var(--color-warning-text)";
    case "sla_breach_manager": return "var(--color-danger-text)";
    default:                   return "var(--theme-text-secondary)";
  }
}

// ─── Type → icon map ─────────────────────────────────────────────────────────

function getTypeIcon(type: NotificationType): React.ElementType {
  switch (type) {
    case "lead_assigned":     return UserPlus;
    case "lead_won":          return Trophy;
    case "task_due":          return Clock;
    case "task_assigned":     return CheckSquare;
    case "mention":           return AtSign;
    case "system":            return Info;
    case "sla_breach_agent":  return AlertTriangle;
    case "sla_breach_manager": return AlertTriangle;
  }
  // TypeScript will error here at build time if a new NotificationType
  // is added to database.ts without a matching case above.
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
  const router     = useRouter();
  const isUnread   = notification.read_at === null;
  const Icon       = getTypeIcon(notification.type);
  const iconColor  = getTypeIconColor(notification.type);

  function handleClick() {
    onMarkRead(notification.id);

    if (notification.action_url) {
      // Validate: only relative paths allowed (pre-mortem item 2)
      const url = notification.action_url;
      if (url.startsWith("/") && !url.startsWith("//")) {
        router.push(url);
        onClose();
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display:        "flex",
        alignItems:     "flex-start",
        gap:            "var(--space-3)",
        width:          "100%",
        padding:        "var(--space-3) var(--space-4)",
        background:     "none",
        border:         "none",
        cursor:         "pointer",
        textAlign:      "left",
        transition:     "var(--transition-hover)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--theme-paper-subtle)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "none";
      }}
    >
      {/* Unread dot — always rendered, invisible when read (keeps layout stable) */}
      <div
        aria-hidden="true"
        style={{
          width:        "6px",
          height:       "6px",
          borderRadius: "var(--radius-full)",
          background:   isUnread ? "var(--color-danger)" : "transparent",
          flexShrink:   0,
          marginTop:    "6px",     // aligns with icon center
        }}
      />

      {/* Icon */}
      <div
        style={{
          width:          "32px",
          height:         "32px",
          borderRadius:   "var(--radius-full)",
          background:     "var(--theme-paper-subtle)",
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
            fontWeight:  isUnread ? "var(--weight-semibold)" : "var(--weight-normal)",
            color:       "var(--theme-text-primary)",
            lineHeight:  "var(--leading-snug)",
            overflow:    "hidden",
            textOverflow: "ellipsis",
            whiteSpace:  "nowrap",
          }}
        >
          {notification.title}
        </p>

        {notification.body && (
          <p
            style={{
              margin:      "2px 0 0",
              fontFamily:  "var(--font-sans)",
              fontSize:    "var(--text-xs)",
              fontWeight:  "var(--weight-normal)",
              color:       "var(--theme-text-secondary)",
              lineHeight:  "var(--leading-normal)",
              overflow:    "hidden",
              textOverflow: "ellipsis",
              whiteSpace:  "nowrap",
            }}
          >
            {notification.body}
          </p>
        )}

        <p
          style={{
            margin:     "var(--space-1) 0 0",
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-2xs)",
            color:      "var(--theme-text-tertiary)",
          }}
        >
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
    </button>
  );
}
