"use client";

/**
 * ToastProvider — subscribes to the toast store and renders the stack.
 * Section 13.6: max 3 visible, stagger scale/translate, queue the rest.
 * Section 13.8: desktop bottom-right, mobile bottom full-width.
 */

import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, m as motion } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/constants/motion";
import { toast as toastStore } from "@/lib/toast";
import { ToastItem } from "@/components/ui/toast-item";
import type { ToastItem as ToastItemType } from "@/lib/toast";

export function ToastProvider() {
  const [toasts, setToasts]   = useState<ToastItemType[]>(() => toastStore.getToasts());
  const [isMobile, setIsMobile] = useState(false);

  // Detect viewport width for mobile positioning
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Subscribe to toast store changes.
  // toastStore.subscribe() returns the removeEventListener cleanup — return it
  // directly so React calls it on unmount (and on every hot reload in dev).
  // Without this return the listener stacks up on every remount.
  useEffect(() => {
    // Sync state immediately on mount in case toasts were fired before the
    // provider mounted (e.g. a toast fired during SSR hydration).
    setToasts(toastStore.getToasts());

    const unsubscribe = toastStore.subscribe((next) => setToasts(next));
    return unsubscribe;
  }, []);

  const handleDismiss = useCallback((id: string) => {
    toastStore._remove(id);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position:      "fixed",
        zIndex:        "var(--z-toast)",
        ...(isMobile
          ? {
              bottom: "calc(80px + env(safe-area-inset-bottom))",
              left:   "var(--space-4)",
              right:  "var(--space-4)",
              display: "flex",
              flexDirection: "column-reverse",
              gap:     "var(--space-3)",
            }
          : {
              bottom: "var(--space-6)",
              right:  "var(--space-6)",
              display: "flex",
              flexDirection: "column-reverse",
              gap:     "var(--space-3)",
            }),
      }}
    >
      <AnimatePresence mode="sync">
        {toasts.map((t, index) => {
          // Stack behaviour — Section 13.6:
          // index 0 = newest (top, fully visible)
          // index 1 = scale 0.95, translateY(-8px)
          // index 2 = scale 0.90, translateY(-14px)
          const stackScale   = index === 0 ? 1    : index === 1 ? 0.95 : 0.90;
          const stackY       = index === 0 ? 0    : index === 1 ? -8   : -14;

          return (
            <motion.div
              key={t.id}
              layout
              animate={{
                scale:      stackScale,
                translateY: stackY,
              }}
              transition={{
                duration: 0.25,
                ease:     EASE_OUT_EXPO,
              }}
              style={{
                // Pointers should only be active on the front toast
                pointerEvents: index === 0 ? "auto" : "none",
                transformOrigin: "bottom center",
              }}
            >
              <ToastItem
                toast={t}
                onDismiss={handleDismiss}
                isMobile={isMobile}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
