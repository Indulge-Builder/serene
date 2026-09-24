"use client";

import { MotionSelectionButton } from '@/components/ui/MotionButton';
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ENTER_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import { formatRelativeTime } from "@/lib/utils/dates";
import type { WhatsAppConversation } from "@/lib/types/whatsapp";

interface ConversationRowProps {
  conversation: WhatsAppConversation;
  isActive: boolean;
  hasUnread: boolean;
  onClick: () => void;
  /** Stagger entrance delay in ms — matches Performance agent roster */
  delay?: number;
}

export function ConversationRow({
  conversation,
  isActive,
  hasUnread,
  onClick,
  delay = 0,
}: ConversationRowProps) {
  const [hovered, setHovered] = useState(false);
  const isHighlighted = isActive || hovered;

  const displayName = conversation.lead_name ?? conversation.phone;

  const trailing = conversation.last_message_at
    ? formatRelativeTime(conversation.last_message_at)
    : null;

  const trailingColor = isHighlighted
    ? "var(--neu-accent-deep)"
    : "var(--theme-text-tertiary)";

  return (
    <MotionSelectionButton
          appearance="option" selected={isActive} aria-pressed={isActive}
          type="button"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
        duration: ENTER_DURATION,
        delay: delay / 1000,
        ease: EASE_OUT_EXPO,
      }}
          onClick={onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", width: "100%", textAlign: "left"}}
        >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Avatar name={displayName} size="sm" selected={isHighlighted} />
        {hasUnread && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "-2px",
              right: "-2px",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "var(--neu-accent-deep)",
              border: "2px solid var(--theme-paper)",
            }}
          />
        )}
      </div>

      <p
        style={{
          flex: 1,
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          fontWeight: isHighlighted
            ? "var(--weight-semibold)"
            : "var(--weight-normal)",
          color: isActive ? "var(--neu-accent-deep)" : "var(--theme-text-primary)",
          margin: 0,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition: "font-weight var(--duration-fast) var(--ease-in-out)",
        }}
      >
        {displayName}
      </p>

      {trailing && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-medium)",
            color: trailingColor,
            flexShrink: 0,
            letterSpacing: "-0.01em",
            transition: "color var(--duration-fast) var(--ease-in-out)",
          }}
        >
          {trailing}
        </span>
      )}
    </MotionSelectionButton>
  );
}

ConversationRow.displayName = "ConversationRow";
