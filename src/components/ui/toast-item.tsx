"use client";

/**
 * ToastItem — single toast card.
 * Implements Section 13.2–13.5 anatomy and animation spec exactly.
 * Zero hardcoded colour values — all tokens.
 */

import { useEffect, useRef, useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/constants/motion";
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2, X } from "lucide-react";
import { ElayaGlyph } from "@/components/ui/elaya-glyph";
import type { ToastItem as ToastItemType, ToastType } from "@/lib/toast";

// ─── Type config ─────────────────────────────────────────────────────────────

interface TypeConfig {
  barColor:    string;
  iconBg:      string;
  iconColor:   string;
  Icon:        React.ComponentType<{ style?: React.CSSProperties; className?: string }> | null;
  isElaya:       boolean;
  isLoading:   boolean;
}

function getTypeConfig(type: ToastType): TypeConfig {
  switch (type) {
    case "success":
      return {
        barColor:  "var(--color-success)",
        iconBg:    "var(--color-success-light)",
        iconColor: "var(--color-success-text)",
        Icon:      CheckCircle2,
        isElaya:     false,
        isLoading: false,
      };
    case "warning":
      return {
        barColor:  "var(--color-warning)",
        iconBg:    "var(--color-warning-light)",
        iconColor: "var(--color-warning-text)",
        Icon:      AlertTriangle,
        isElaya:     false,
        isLoading: false,
      };
    case "danger":
      return {
        barColor:  "var(--color-danger)",
        iconBg:    "var(--color-danger-light)",
        iconColor: "var(--color-danger-text)",
        Icon:      XCircle,
        isElaya:     false,
        isLoading: false,
      };
    case "info":
      return {
        barColor:  "var(--color-info)",
        iconBg:    "var(--color-info-light)",
        iconColor: "var(--color-info-text)",
        Icon:      Info,
        isElaya:     false,
        isLoading: false,
      };
    case "loading":
      return {
        barColor:  "var(--theme-accent)",
        iconBg:    "var(--theme-accent-surface)",
        iconColor: "var(--theme-accent)",
        Icon:      Loader2,
        isElaya:     false,
        isLoading: true,
      };
    case "elaya":
      return {
        barColor:  "var(--theme-accent)",
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

// ─── Component ────────────────────────────────────────────────────────────────

export function ToastItem({ toast, onDismiss, isMobile }: ToastItemProps) {
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
        duration: 0.35,
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
        background:    "var(--theme-paper)",
        border:        "1px solid var(--theme-paper-border)",
        borderRadius:  "var(--radius-md)",
        boxShadow:     "var(--shadow-3)",
        overflow:      "hidden",
        padding:       "var(--space-3) var(--space-3) var(--space-3) var(--space-4)",
      }}
    >
      {/* Living bar — 3px left edge, animates once on entrance via CSS */}
      <div
        className="toast-bar"
        style={{
          position:     "absolute",
          left:         0,
          top:          0,
          bottom:       0,
          width:        "3px",
          background:   config.barColor,
          borderRadius: "var(--radius-xs) 0 0 var(--radius-xs)",
          // elaya bar breathes continuously; others fire once via CSS animation
          animation:    toast.type === "elaya"
            ? "serene-elaya-breathe 3s ease-in-out infinite"
            : "serene-toast-bar-breathe 600ms var(--ease-out-expo) forwards",
        }}
      />

      {/* Icon zone — crossfades on loading → resolved */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`icon-${iconKey}-${toast.type}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, delay: iconKey === 0 ? 0.08 : 0 }}
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
          transition={{ duration: 0.2, delay: contentKey === 0 ? 0.12 : 0 }}
          style={{
            flex:           1,
            display:        "flex",
            flexDirection:  "column",
            gap:            "2px",
            minWidth:       0,
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
            <button
              type="button"
              onClick={toast.action.onClick}
              style={{
                marginTop:          "var(--space-1)",
                fontFamily:         "var(--font-sans)",
                fontSize:           "var(--text-xs)",
                fontWeight:         "var(--weight-semibold)",
                color:              "var(--theme-accent)",
                background:         "none",
                border:             "none",
                padding:            0,
                cursor:             "pointer",
                textAlign:          "left",
                textUnderlineOffset: "2px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
            >
              {toast.action.label}
            </button>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Dismiss button */}
      <button
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
          borderRadius:    "var(--radius-sm)",
          border:          "none",
          background:      "transparent",
          color:           "var(--theme-text-tertiary)",
          cursor:          "pointer",
          flexShrink:      0,
          transition:      "background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--theme-paper-subtle)";
          e.currentTarget.style.color      = "var(--theme-text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color      = "var(--theme-text-tertiary)";
        }}
      >
        <X style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
      </button>

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
