"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ElayaGlyph } from "@/components/ui/elaya-glyph";
import { useToast } from "@/hooks/useToast";
import { getElayaChatSeedAction } from "@/lib/actions/elaya";
import { formErrors } from "@/lib/validations/form-errors";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import type { ElayaChatSeed } from "@/lib/services/elaya-service";
import type { WidgetProps } from "../DashboardWidgetSlot";

// The chat surface (SSE loop + composer + voice) is code-split — it never sits
// in the dashboard route chunk; it loads when this widget mounts. ElayaChatShell
// already ships the embedded/chat-only mode built for exactly this — we render
// it as-is, just sized into the widget. No new chat code lives here.
const ElayaChatShell = dynamic(
  () => import("@/components/elaya/ElayaChatShell").then((m) => m.ElayaChatShell),
  { ssr: false },
);

/**
 * Elaya presence card — the /elaya chat screen shrunk into a dashboard widget.
 *
 * It is NOT a teaser that opens a modal. It IS the conversation: the same
 * ElayaChatShell (embedded mode — flush, chat-only) the /elaya page renders,
 * seeded with the user's single active conversation via getElayaChatSeedAction
 * (the SAME seed /elaya resolves — R-01). The user says hi and gets a reply
 * right here, inside the widget. No new chat plumbing, no second send.
 *
 * The seed is a client→server read (a 'use client' widget can't call
 * elaya-service directly — A-15), so it resolves on mount; until then the
 * breathing glyph holds the seat (a static glyph = Elaya absent — never that).
 */
export function ElayaPresenceCard({ size = "md" }: WidgetProps) {
  const toast = useToast;
  const [seed, setSeed] = useState<ElayaChatSeed | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getElayaChatSeedAction().then((res) => {
      if (!alive) return;
      if (res.error || !res.data) {
        setFailed(true);
        toast.danger(res.error ?? formErrors.elayaUnavailable);
        return;
      }
      setSeed(res.data);
    });
    return () => {
      alive = false;
    };
  }, [toast]);

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
      {seed ? (
        // The real chat, embedded (no card-in-a-card chrome) and chat-only
        // (no identity rail) — it flex-fills the widget box exactly.
        <ElayaChatShell
          conversationId={seed.conversationId}
          initialMessages={seed.initialMessages}
          greeting={seed.greeting}
          remainingToday={seed.remainingToday}
          embedded
        />
      ) : (
        // Seat holder while the conversation resolves — her breathing glyph,
        // never a static one. On failure the same glyph + a quiet line.
        <div
          className="flex flex-1 flex-col items-center justify-center"
          style={{ gap: "var(--space-3)", padding: "var(--space-5)" }}
        >
          <span style={{ color: "var(--theme-accent)", display: "flex" }}>
            <ElayaGlyph size={28} />
          </span>
          <span
            className="italic"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "var(--text-sm)",
              color: "var(--theme-text-tertiary)",
            }}
          >
            {failed ? "Elaya is catching her breath…" : "Elaya is gathering her thoughts…"}
          </span>
        </div>
      )}
    </div>
  );
}
