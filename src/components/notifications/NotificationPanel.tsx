"use client";

/**
 * NotificationPanel — dropdown panel anchored to the bell button.
 * Desktop: fixed dropdown (380px wide).
 * Mobile (< 768px): bottom sheet via CSS media query + conditional positioning.
 * Entrance: translateY(-4px) → 0, opacity 0 → 1, 150ms --ease-out-expo.
 * Closes on outside click, Escape, or item click with action_url.
 */

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import type { Notification } from "@/lib/types/database";

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
  const panelRef = useRef<HTMLDivElement>(null);

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
              background: "rgba(0,0,0,0.4)",
              zIndex:     "calc(var(--z-dropdown) - 1)",
              display:    "none",   // shown via CSS @media below
            }}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="notification-panel"
            style={{
              position:     "absolute",
              top:          "calc(100% + var(--space-2))",
              right:        0,
              zIndex:       "var(--z-dropdown)",
              width:        "380px",
              background:   "var(--theme-paper)",
              border:       "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-md)",
              boxShadow:    "var(--shadow-3)",
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
                  fontFamily:  "var(--font-sans)",
                  fontSize:    "var(--text-sm)",
                  fontWeight:  "var(--weight-semibold)",
                  color:       "var(--theme-text-primary)",
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
                    fontWeight:  "var(--weight-semibold)",
                    color:       "var(--theme-accent)",
                    background:  "none",
                    border:      "none",
                    cursor:      "pointer",
                    padding:     0,
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div
              className="scrollable"
              style={{
                maxHeight:  "420px",
                overflowY:  "auto",
              }}
            >
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding:   "var(--space-8) var(--space-4)",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontFamily:  "var(--font-serif)",
                      fontStyle:   "italic",
                      fontSize:    "var(--text-sm)",
                      color:       "var(--theme-text-tertiary)",
                      margin:      0,
                    }}
                  >
                    {"You're all caught up."}
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkRead={onMarkRead}
                    onClose={onClose}
                  />
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
