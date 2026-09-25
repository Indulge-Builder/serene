"use client";

/**
 * NotificationPanel — dropdown panel anchored to the bell button.
 * Desktop: fixed dropdown (380px wide). Max-height 480px.
 * Entrance: opacity 0→1, y 6→0, 400ms --ease-out-expo.
 * Exit:     opacity 0, y -4, 250ms --ease-in-expo.
 * Closes on outside click, Escape, or item click with action_url.
 */

import { useModalFocus } from '@/hooks/useModalFocus';
import { Button } from '@/components/ui/Button';
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { m as motion, AnimatePresence } from "framer-motion";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { MotionRow } from "@/components/ui/RowMotion";
import { useMediaQuery, MQ } from "@/hooks/useMediaQuery";
import {
  ENTER_DURATION,
  EXIT_DURATION,
  FAST_DURATION,
  EASE_OUT_EXPO,
  EASE_IN_EXPO,
} from "@/lib/constants/motion";
import type { Notification } from "@/lib/types/database";

// ─── Panel variants — spec-exact (not DROPDOWN_VARIANTS which uses BASE_DURATION) ──

const PANEL_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: ENTER_DURATION, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: EXIT_DURATION, ease: EASE_IN_EXPO },
  },
} as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotificationPanelProps {
  open:          boolean;
  onClose:       () => void;
  notifications: Notification[];
  unreadCount:   number;
  onMarkRead:    (id: string) => void;
  onMarkAllRead: () => void;
  anchorRef:     React.RefObject<HTMLElement | null>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationPanel({
  open,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  anchorRef,
}: NotificationPanelProps) {
  const panelRef       = useRef<HTMLDivElement>(null);

  // Portal escape: the bell lives inside the sidebar <aside>, which carries a
  // `transform` for the off-canvas drawer below md. A transformed ancestor is a
  // containing block for position:fixed descendants — so the panel MUST portal to
  // document.body to anchor to the viewport (root CLAUDE.md "Framer transform +
  // position: fixed — portal escape"). Mount-gated for SSR safety.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Below md the panel is a docked bottom sheet (geometry from .notification-panel
  // in globals.css); at md+ it is a fixed dropdown anchored under the bell rect.
  const isMobile = useMediaQuery(MQ.mobile);

  // Desktop anchor coords — measured from the bell on open, repositioned on
  // scroll/resize. Only applied inline when NOT mobile (so the sheet CSS wins
  // below md without an inline override fighting it).
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!open || isMobile) { setCoords(null); return; }
    function place() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Right-align the 380px panel under the bell, clamped into an 8px gutter.
      setCoords({
        top:   rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, isMobile, anchorRef]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onClose, anchorRef]);

  useModalFocus(open && mounted, panelRef, onClose);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Mobile backdrop — only visible below md (class-driven). Dismisses
              the bottom sheet on tap. At md+ the class hides it entirely. */}
          <motion.div
            className="notification-mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FAST_DURATION }}
            onClick={onClose}
            style={{
              position:   "fixed",
              inset:      0,
              background: "var(--overlay-bg-light)",
              zIndex:     "var(--z-overlay)",
            }}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label="Notifications"
            className="notification-panel"
            variants={PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              // Base geometry (position/size/z-index) is class-driven
              // (.notification-panel) so it flips to a bottom sheet below md. On
              // md+ the measured anchor coords below override top/right inline.
              display:       "flex",
              flexDirection: "column",
              background:    "var(--neu-surface-high)",
              border:        "1px solid var(--neu-edge)",
              borderRadius:  "var(--neu-radius-panel)",
              boxShadow:     "var(--neu-shadow-raised-lg)",
              overflow:      "hidden",
              // Desktop anchor — applied ONLY at md+ (isMobile false). Below md
              // these stay undefined so the sheet CSS governs.
              ...(!isMobile && coords
                ? { top: coords.top, right: coords.right }
                : null),
            }}
          >
            {/* Header */}
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                padding:        "var(--space-4)",
                borderBottom:   "1px solid var(--theme-paper-border)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle:  "italic",
                  fontSize:   "var(--text-md)",
                  color:      "var(--theme-text-primary)",
                }}
              >
                Notifications
              </span>

              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={onMarkAllRead}
                >
                  Mark all read
                </Button>
              )}
            </div>

            {/* List — flexes to fill the sheet below md; capped at 480px on the
                md+ dropdown via .notification-panel-list. */}
            <div
              className="scrollable notification-panel-list"
              style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
            >
              {notifications.length === 0 ? (
                // An all-clear: the Serene mark rests in the tile. No action (nothing
                // to do when caught up). minHeight is sized for the 380px dropdown /
                // bottom sheet, not a full page.
                <EmptyState
                  variant="hero"
                  title="All caught up."
                  description="New alerts will land here as they arrive."
                  minHeight="240px"
                />
              ) : (
                // Row choreography via the shared MotionRow (polish §02) —
                // migrated off the bespoke ITEM_VARIANTS/isInitialMount stagger
                // so the whole app rides one pattern. initial={false}: the first
                // open never cascades, a Realtime arrival slides in, a marked-
                // read row lifts out and its siblings glide up.
                <div style={{ padding: "var(--space-1) 0" }}>
                  <AnimatePresence initial={false}>
                    {notifications.map((n) => (
                      <MotionRow key={n.id}>
                        <NotificationItem
                          notification={n}
                          onMarkRead={onMarkRead}
                          onClose={onClose}
                        />
                      </MotionRow>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
