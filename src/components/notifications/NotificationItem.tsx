"use client";

/**
 * NotificationItem — single row in the notification panel.
 * The bell shows UNREAD only, so there is no read/unread visual split here:
 * every row is one clean uniform line (transparent at rest, paper-subtle on
 * hover) — no unread dot, no per-item card pill. Tap: whileTap scale 0.98
 * spring. Optimistic mark-read fires before navigation, which drops the row
 * from the list (it "goes away" once opened).
 */

import { MotionSelectionButton } from '@/components/ui/MotionButton';
import { useRouter } from "next/navigation";
import { UserPlus, Trophy, Clock, CheckSquare, AtSign, Info, AlertTriangle, MessageSquarePlus } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/dates";
import { assertNever } from "@/lib/utils/assert-never";
import type { Notification, NotificationType } from "@/lib/types/database";

// ─── Type → icon colour ────────────────────────────────────────────────────────

function getTypeIconColor(type: NotificationType): string {
  switch (type) {
    case "sla_breach_agent":     return "var(--color-warning-text)";
    case "sla_breach_manager":   return "var(--color-danger-text)";
    case "sla_breach_founder":   return "var(--color-danger-text)";
    case "task_overdue_manager": return "var(--color-danger-text)";
    case "ticket_sla_breach":     return "var(--color-danger-text)";
    case "ticket_member_unhappy": return "var(--color-danger-text)";
    case "ticket_sla_warning":    return "var(--color-warning-text)";
    default:                     return "var(--theme-accent)";
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
    case "sla_breach_agent":     return AlertTriangle;
    case "sla_breach_manager":   return AlertTriangle;
    case "sla_breach_founder":   return AlertTriangle;
    case "task_overdue_manager": return AlertTriangle;
    case "suggestion_resolved":  return MessageSquarePlus;
    // Sia tickets (migration 0195)
    case "ticket_assigned":       return CheckSquare;
    case "ticket_proposed":       return Info;
    case "ticket_sla_warning":    return Clock;
    case "ticket_sla_breach":     return AlertTriangle;
    case "ticket_member_replied": return AtSign;
    case "ticket_member_unhappy": return AlertTriangle;
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
  const Icon      = getTypeIcon(notification.type as NotificationType);
  const iconColor = getTypeIconColor(notification.type as NotificationType);

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
    <MotionSelectionButton
          appearance="option"
          type="button"
          onClick={handleClick}
          whileTap={{ scale: 0.98, transition: { type: "spring", bounce: 0, duration: 0.15 } }}
          style={{display:      "flex", alignItems:   "flex-start", gap:          "var(--space-3)", width:        "100%", padding:      "var(--space-3) var(--space-4)", textAlign:    "left"}}
        >
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
            fontWeight:  "var(--weight-medium)",
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
    </MotionSelectionButton>
  );
}
