"use client";

import { formatRelativeTime } from "@/lib/utils/dates";
import type { WhatsAppConversation } from "@/lib/types/whatsapp";

interface ConversationRowProps {
  conversation:         WhatsAppConversation;
  isActive:             boolean;
  hasUnread:            boolean;
  onClick:              () => void;
}

export function ConversationRow({
  conversation,
  isActive,
  hasUnread,
  onClick,
}: ConversationRowProps) {
  const isResolved = conversation.status === "resolved";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display:         "flex",
        alignItems:      "flex-start",
        gap:             "var(--space-3)",
        width:           "100%",
        padding:         "var(--space-3) var(--space-4)",
        border:          "none",
        borderLeft:      isActive ? "2px solid var(--theme-accent)" : "2px solid transparent",
        borderRadius:    0,
        background:      isActive ? "var(--theme-accent-surface)" : "transparent",
        cursor:          "pointer",
        textAlign:       "left",
        transition:      "background var(--duration-fast) var(--ease-in-out)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "var(--theme-paper-subtle)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {/* Unread dot */}
      <div
        style={{
          width:          "8px",
          height:         "8px",
          borderRadius:   "50%",
          background:     hasUnread ? "var(--theme-accent)" : "transparent",
          flexShrink:     0,
          marginTop:      "6px",
          transition:     "background var(--duration-fast) var(--ease-in-out)",
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: name + timestamp */}
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "var(--space-2)",
            marginBottom: "var(--space-1)",
          }}
        >
          <span
            style={{
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              fontWeight:   "var(--weight-medium)",
              color:        "var(--theme-text-primary)",
              flex:         1,
              minWidth:     0,
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
            }}
          >
            {conversation.lead_name ?? conversation.phone}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize:   "10px",
              color:      "var(--theme-text-tertiary)",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {conversation.last_message_at
              ? formatRelativeTime(conversation.last_message_at)
              : ""}
          </span>
        </div>

        {/* Row 2: phone */}
        <p
          style={{
            fontFamily:   "var(--font-mono)",
            fontSize:     "var(--text-xs)",
            color:        "var(--theme-text-tertiary)",
            margin:       "0 0 var(--space-1)",
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}
        >
          {conversation.lead_phone ?? conversation.phone}
        </p>

        {/* Row 3: status badge */}
        {isResolved && (
          <span
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              padding:      "1px var(--space-2)",
              borderRadius: "var(--radius-full)",
              background:   "var(--color-success)",
              color:        "var(--color-success-text)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-2xs)",
              fontWeight:   "var(--weight-semibold)",
            }}
          >
            Resolved
          </span>
        )}
      </div>
    </button>
  );
}

ConversationRow.displayName = "ConversationRow";
