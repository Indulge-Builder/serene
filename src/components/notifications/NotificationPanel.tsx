"use client";

/**
 * NotificationPanel — dropdown panel anchored to the bell button.
 * Desktop: fixed dropdown (380px wide). Max-height 480px.
 * Entrance: opacity 0→1, y 6→0, 400ms --ease-out-expo.
 * Exit:     opacity 0, y -4, 250ms --ease-in-expo.
 * Closes on outside click, Escape, or item click with action_url.
 */

import { useEffect, useRef } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ENTER_DURATION,
  EXIT_DURATION,
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

// ─── Item stagger variants ────────────────────────────────────────────────────

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 4 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay:    Math.min(i * 50, 200) / 1000,
      duration: 0.25,
      ease:     EASE_OUT_EXPO,
    },
  }),
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
  const isInitialMount = useRef(true);

  // After first render, flip the flag so subsequent Realtime items use custom={0}
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => { isInitialMount.current = false; }, 0);
      return () => clearTimeout(id);
    } else {
      isInitialMount.current = true;
    }
  }, [open]);

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

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Mobile backdrop — bottom sheet overlay */}
          <motion.div
            className="notification-mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position:   "fixed",
              inset:      0,
              background: "var(--overlay-bg-light)",
              zIndex:     "var(--z-raised)",
              display:    "none",
            }}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            variants={PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position:     "absolute",
              top:          "calc(100% + var(--space-2))",
              right:        0,
              zIndex:       "var(--z-dropdown)",
              width:        "380px",
              background:   "var(--theme-paper)",
              border:       "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow:    "var(--shadow-4)",
              overflow:     "hidden",
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
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  style={{
                    fontFamily:  "var(--font-sans)",
                    fontSize:    "var(--text-xs)",
                    fontWeight:  "var(--weight-normal)",
                    color:       "var(--theme-text-tertiary)",
                    background:  "none",
                    border:      "none",
                    cursor:      "pointer",
                    padding:     0,
                    transition:  "color var(--transition-hover)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-tertiary)"; }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div
              className="scrollable"
              style={{ maxHeight: "480px" }}
            >
              {notifications.length === 0 ? (
                <EmptyState
                  title="You're all caught up."
                  style={{ padding: "var(--space-8) var(--space-4)" }}
                />
              ) : (
                <motion.div layout style={{ padding: "var(--space-1) 0" }}>
                  <AnimatePresence initial={false}>
                    {notifications.map((n, i) => (
                      <motion.div
                        key={n.id}
                        layout
                        custom={isInitialMount.current ? i : 0}
                        variants={ITEM_VARIANTS}
                        initial="hidden"
                        animate="visible"
                      >
                        <NotificationItem
                          notification={n}
                          onMarkRead={onMarkRead}
                          onClose={onClose}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
