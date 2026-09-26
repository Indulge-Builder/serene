"use client";

import { Button } from '@/components/ui/Button';
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
 * MOBILE-ONLY header row: below md the card carries its own slim top row with
 * a "Send feedback" control, opening the shared suggestion composer
 * (SuggestionFeedbackProvider). It used to float over the chat header, where
 * "Daily limit reached" renders (mobile audit 2026-09-26). On desktop the
 * Sidebar "Send feedback" item is the entry, so the row is not rendered.
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
        borderRadius: "var(--neu-radius-card)",
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
      }}
    >
      {isMobile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-2)",
            padding: "var(--space-1) var(--space-2) var(--space-1) var(--space-4)",
            flexShrink: 0,
            borderBottom: "1px solid var(--theme-paper-border)",
          }}
        >
          <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>Elaya</span>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            aria-label="Send feedback"
            className="serene-pressable serene-touch"
            onClick={openComposer}
            iconLeft={MessageSquarePlus}
          >
            Send feedback
          </Button>
        </div>
      )}

      <EmbeddedElayaChat />
    </div>
  );
}
