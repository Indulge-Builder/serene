"use client";

import { MessageSquarePlus } from "lucide-react";
import { EmbeddedElayaChat } from "@/components/elaya/EmbeddedElayaChat";
import { useSuggestionFeedback } from "@/components/suggestions/SuggestionFeedbackProvider";
import { useMediaQuery, MQ } from "@/hooks/useMediaQuery";
import type { WidgetProps } from "../DashboardWidgetSlot";

/**
 * Elaya presence card — the /elaya chat screen shrunk into a dashboard widget.
 *
 * It is NOT a teaser that opens a modal. It IS the conversation: the shared
 * EmbeddedElayaChat resolves the user's single active conversation on mount and
 * renders the same ElayaChatShell (embedded mode) the /elaya page renders, sized
 * into the widget. The user says hi and gets a reply right here. All the
 * seed-resolve + shell + breathing-glyph logic lives in EmbeddedElayaChat — the
 * SAME body the floating ElayaWidget composes (R-01). No chat code lives here.
 *
 * MOBILE-ONLY overlay: a small "Send feedback" trigger floats in the card's
 * top-right corner below md, opening the shared suggestion composer
 * (SuggestionFeedbackProvider). On desktop the Sidebar "Send feedback" item is
 * the entry, so the overlay is hidden there to keep the chat header clean.
 */
export function ElayaPresenceCard(_props: WidgetProps) {
  const { openComposer } = useSuggestionFeedback();
  const isMobile = useMediaQuery(MQ.mobile);

  return (
    <div
      className="flex flex-col"
      style={{
        position: "relative",
        height: "100%",
        background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
      }}
    >
      {isMobile && (
        <button
          type="button"
          aria-label="Send feedback"
          title="Send feedback"
          className="serene-pressable serene-touch"
          onClick={openComposer}
          style={{
            position: "absolute",
            top: "var(--space-3)",
            right: "var(--space-3)",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--theme-paper-border)",
            background: "var(--theme-paper-subtle)",
            color: "var(--theme-text-secondary)",
            cursor: "pointer",
          }}
        >
          <MessageSquarePlus style={{ width: "16px", height: "16px", strokeWidth: 1.5 }} />
        </button>
      )}

      <EmbeddedElayaChat />
    </div>
  );
}
