"use client";

/**
 * ToastItem — single toast card.
 * Implements Section 13.2–13.5 anatomy and animation spec exactly.
 * Zero hardcoded colour values — all tokens.
 */

import { Button } from '@/components/ui/Button';
import { useEffect, useRef, useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { BASE_DURATION, EASE_OUT_EXPO, EASE_SPRING, FAST_DURATION, PALETTE_DURATION, SLOW_DURATION } from "@/lib/constants/motion";
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2, X } from "lucide-react";
import { ElayaGlyph } from "@/components/ui/elaya-glyph";
import type { ToastItem as ToastItemType, ToastType } from "@/lib/toast";

// ─── Type config ─────────────────────────────────────────────────────────────

interface TypeConfig {
  iconBg:      string;
  iconColor:   string;
  Icon:        React.ComponentType<{ style?: React.CSSProperties; className?: string }> | null;
  isElaya:       boolean;
  isLoading:   boolean;
}

function getTypeConfig(type: ToastType): TypeConfig {
  switch (type) {
    case "undo":
      // never reached — undo renders through UndoToastItem below
      return { iconBg: "transparent", iconColor: "transparent", Icon: null, isElaya: false, isLoading: false };
    case "success":
      return {
        iconBg:    "var(--color-success-light)",
        iconColor: "var(--color-success-text)",
        Icon:      CheckCircle2,
        isElaya:     false,
        isLoading: false,
      };
    case "warning":
      return {
        iconBg:    "var(--color-warning-light)",
        iconColor: "var(--color-warning-text)",
        Icon:      AlertTriangle,
        isElaya:     false,
        isLoading: false,
      };
    case "danger":
      return {
        iconBg:    "var(--color-danger-light)",
        iconColor: "var(--color-danger-text)",
        Icon:      XCircle,
        isElaya:     false,
        isLoading: false,
      };
    case "info":
      return {
        iconBg:    "var(--color-info-light)",
        iconColor: "var(--color-info-text)",
        Icon:      Info,
        isElaya:     false,
        isLoading: false,
      };
    case "loading":
      return {
        iconBg:    "var(--theme-accent-surface)",
        iconColor: "var(--theme-accent)",
        Icon:      Loader2,
        isElaya:     false,
        isLoading: true,
      };
    case "elaya":
      return {
        iconBg:    "var(--theme-accent-surface)",
        iconColor: "var(--theme-accent)",
        Icon:      null,
        isElaya:     true,
        isLoading: false,
      };
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ToastItemProps {
  toast:     ToastItemType;
  onDismiss: (id: string) => void;
  isMobile:  boolean;
}

// ─── Undo variant (polish handoff §06) ───────────────────────────────────────
//
// Charcoal action toast: message · Undo pill (accent text) · a 2.5px accent
// depletion bar along the bottom — the bar IS the countdown, so there is NO
// hover-pause (the deferred server commit runs on a real clock) and no X
// (dismissal = commit; Undo = restore). Enter: 320ms spring rise.

function UndoToastItem({
  toast,
  onDismiss,
  isMobile,
}: ToastItemProps) {
  // Timeout = the deferred commit, then dismiss. Undo dismisses first, so
  // unmount cleanup clears this timer and the commit never runs.
  useEffect(() => {
    if (toast.duration <= 0) return;
    const t = setTimeout(() => {
      toast.onTimeout?.();
      onDismiss(toast.id);
    }, toast.duration);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  function handleUndo() {
    toast.action?.onClick();
    onDismiss(toast.id);
  }

  return (
    <motion.div
      layout
      initial={isMobile ? { y: 24, opacity: 0 } : { y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: PALETTE_DURATION, ease: EASE_SPRING }}
      role="status"
      aria-live="polite"
      style={{
        position:     "relative",
        display:      "flex",
        alignItems:   "center",
        gap:          "var(--space-3)",
        minWidth:     isMobile ? "unset" : "320px",
        maxWidth:     isMobile ? "unset" : "400px",
        width:        isMobile ? "100%" : "auto",
        background:   "var(--neu-toast-action-bg)",
        color:        "var(--neu-toast-action-text)",
        border:       "1px solid var(--neu-toast-action-border)",
        borderRadius: "var(--neu-radius-tile)",
        boxShadow:    "var(--neu-toast-action-shadow)",
        overflow:     "hidden",
        padding:      "var(--space-3) var(--space-4)",
      }}
    >
      <span
        style={{
          flex:       1,
          fontFamily: "var(--font-sans)",
          fontSize:   "13px",
          lineHeight: "var(--leading-snug)",
        }}
      >
        {toast.title}
      </span>

      <button
        type="button"
        onClick={handleUndo}
        className="serene-pressable"
        style={{
          height:       "32px",
          padding:      "0 var(--space-4)",
          borderRadius: "var(--radius-full)",
          background:   "var(--neu-toast-undo-bg)",
          border:       "1px solid var(--neu-toast-undo-border)",
          fontFamily:   "var(--font-sans)",
          fontSize:     "var(--text-xs)",
          fontWeight:   "var(--weight-semibold)",
          color:        "var(--neu-accent)",
          cursor:       "pointer",
          flexShrink:   0,
        }}
      >
        {toast.action?.label ?? "Undo"}
      </button>

      {/* Accent depletion bar — scaleX (compositor), linear: time maps to time */}
      {toast.duration > 0 && (
        <span
          aria-hidden="true"
          style={{
            position:        "absolute",
            left:            0,
            bottom:          0,
            width:           "100%",
            height:          "2.5px",
            background:      "var(--neu-accent)",
            transformOrigin: "left",
            animation:       `toast-deplete ${toast.duration}ms linear forwards`,
          }}
        />
      )}
    </motion.div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ToastItem(props: ToastItemProps) {
  if (props.toast.type === "undo") return <UndoToastItem {...props} />;
  return <StandardToastItem {...props} />;
}

function StandardToastItem({ toast, onDismiss, isMobile }: ToastItemProps) {
  const config     = getTypeConfig(toast.type);
  const prevTypeRef = useRef(toast.type);
  const [iconKey, setIconKey] = useState(0);    // forces icon crossfade on resolve
  const [contentKey, setContentKey] = useState(0);

  // Detect loading → resolved transition for crossfade
  useEffect(() => {
    if (prevTypeRef.current === "loading" && toast.type !== "loading") {
      setIconKey((k) => k + 1);
      setContentKey((k) => k + 1);
    }
    prevTypeRef.current = toast.type;
  }, [toast.type]);

  // ── Auto-dismiss timer ──────────────────────────────────────────────────────

  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef    = useRef(toast.duration);
  const startedAtRef    = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Reset remaining time when toast resolves (type or createdAt changes)
    remainingRef.current = toast.duration;
    startedAtRef.current = null;
  }, [toast.type, toast.createdAt, toast.duration]);

  useEffect(() => {
    if (toast.duration === 0) return;    // danger / loading — never auto-dismiss
    if (paused) return;

    const remaining = remainingRef.current;
    if (remaining <= 0) {
      onDismiss(toast.id);
      return;
    }

    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => onDismiss(toast.id), remaining);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, toast.type, toast.createdAt, paused, onDismiss]);

  function handleMouseEnter() {
    if (toast.duration === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (startedAtRef.current !== null) {
      remainingRef.current -= Date.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    setPaused(true);
  }

  function handleMouseLeave() {
    if (toast.duration === 0) return;
    setPaused(false);
  }

  // ── Animation variants ─────────────────────────────────────────────────────

  const containerVariants = {
    initial: isMobile
      ? { y: 24, opacity: 0 }
      : { x: 24, opacity: 0, scale: 0.96 },
    animate: isMobile
      ? { y: 0, opacity: 1 }
      : { x: 0, opacity: 1, scale: 1 },
    exit: { opacity: 0, y: 8 },
  };

  return (
    <motion.div
      layout
      variants={containerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{
        duration: SLOW_DURATION,
        ease:     EASE_OUT_EXPO,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      role="status"
      aria-live="polite"
      style={{
        position:      "relative",
        display:       "flex",
        alignItems:    "flex-start",
        gap:           "var(--space-3)",
        minWidth:      isMobile ? "unset" : "320px",
        maxWidth:      isMobile ? "unset" : "400px",
        width:         isMobile ? "100%" : "auto",
        background:    "var(--neu-surface-high)",
        border:        "1px solid var(--neu-edge)",
        borderRadius:  "var(--neu-radius-panel)",
        boxShadow:     "var(--neu-shadow-raised-lg)",
        overflow:      "hidden",
        padding:       "var(--space-3)",
      }}
    >
      {/* Icon zone — crossfades on loading → resolved */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`icon-${iconKey}-${toast.type}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FAST_DURATION, delay: iconKey === 0 ? 0.08 : 0 }}
          style={{
            width:          "36px",
            height:         "36px",
            flexShrink:     0,
            borderRadius:   "var(--radius-full)",
            background:     config.iconBg,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            color:          config.iconColor,
          }}
        >
          {config.isElaya ? (
            <ElayaGlyph size={18} />
          ) : config.Icon ? (
            <config.Icon
              style={{ width: "16px", height: "16px", strokeWidth: 1.5 }}
              className={config.isLoading ? "animate-spin" : undefined}
            />
          ) : null}
        </motion.div>
      </AnimatePresence>

      {/* Content — crossfades on loading → resolved */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`content-${contentKey}-${toast.title}`}
          initial={{ opacity: 0, x: 4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: BASE_DURATION, delay: contentKey === 0 ? 0.12 : 0 }}
          style={{
            flex:           1,
            display:        "flex",
            flexDirection:  "column",
            gap:            "2px",
            minWidth:       0,
            // Clear the absolutely-positioned dismiss X (28px @ right --space-3)
            paddingRight:   "var(--space-6)",
          }}
        >
          <p
            style={{
              margin:      0,
              fontFamily:  "var(--font-sans)",
              fontSize:    "var(--text-sm)",
              fontWeight:  "var(--weight-semibold)",
              color:       "var(--theme-text-primary)",
              lineHeight:  "var(--leading-snug)",
            }}
          >
            {toast.title}
          </p>

          {toast.message && (
            <p
              style={{
                margin:      0,
                fontFamily:  "var(--font-sans)",
                fontSize:    "var(--text-xs)",
                fontWeight:  "var(--weight-normal)",
                color:       "var(--theme-text-secondary)",
                lineHeight:  "var(--leading-normal)",
              }}
            >
              {toast.message}
            </p>
          )}

          {toast.action && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={toast.action.onClick}
              style={{ marginTop:          "var(--space-1)", textAlign:          "left", textUnderlineOffset: "2px" }}
            >
              {toast.action.label}
            </Button>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Dismiss button */}
      <Button
        variant="ghost"
        iconOnly size="sm"
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        style={{
          position:        "absolute",
          top:             "var(--space-3)",
          right:           "var(--space-3)",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          width:           "28px",
          height:          "28px",
          flexShrink:      0,
        }}
      >
        <X style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
      </Button>

      {/* Warning depletion bar — linear timing, bottom edge, warning type only */}
      {toast.type === "warning" && toast.duration > 0 && (
        <div
          style={{
            position:   "absolute",
            bottom:     0,
            left:       0,
            width:      "100%",
            height:     "2px",
            background: "var(--color-warning)",
            // depletion is scaleX (keyframe in design-tokens.css) — width 100%
            // + origin left here; never animate width (layout every frame)
            transformOrigin: "left",
            animation:  `toast-deplete ${toast.duration}ms linear forwards`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      )}
    </motion.div>
  );
}
