"use client";

import { EmbeddedElayaChat } from "@/components/elaya/EmbeddedElayaChat";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
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
 */
export function ElayaPresenceCard({ size = "md" }: WidgetProps) {
  return (
    <div
      className="flex flex-col"
      style={{
        height: WIDGET_HEIGHT_BY_SIZE[size],
        background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
      }}
    >
      <EmbeddedElayaChat />
    </div>
  );
}
