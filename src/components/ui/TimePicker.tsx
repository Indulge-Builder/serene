"use client";

import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  DROPDOWN_VARIANTS,
  DROPDOWN_VARIANTS_UP,
  FLIP_UP_TRANSFORM_TEMPLATE,
} from "@/lib/constants/motion";
import { normalizeTimeHHMM } from "@/lib/utils/dates";

export interface TimePickerProps {
  /** HH:MM 24-hour string (PostgreSQL `time` format) or null when unset. */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

export type Meridiem = "AM" | "PM";

export interface TimePickerWheelPanelProps {
  hour: number;
  minute: number;
  meridiem: Meridiem;
  onChange: (hour: number, minute: number, meridiem: Meridiem) => void;
  /** `embedded` — side panel inside DatePicker; `standalone` — popover body */
  variant?: "standalone" | "embedded";
  style?: React.CSSProperties;
}

// ─── Internal time representation ────────────────────────────────────────────

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const MINUTES = Array.from({ length: 60 }, (_, i) => i) as readonly number[];

interface TimeState {
  hour: number;
  minute: number;
  meridiem: Meridiem;
}

/** Parse a "HH:MM" (or HH:MM:SS) 24-h string into display state. */
function parse(v: string): TimeState {
  const normalised = normalizeTimeHHMM(v) ?? v;
  const [hStr, mStr] = normalised.split(":");
  const h24 = parseInt(hStr ?? "9", 10);
  const min = Math.min(59, Math.max(0, parseInt(mStr ?? "0", 10)));
  const meridiem: Meridiem = h24 >= 12 ? "PM" : "AM";
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour, minute: min, meridiem };
}

/** Serialise display state back to "HH:MM" 24-hour format. */
function serialise(hour: number, minute: number, meridiem: Meridiem): string {
  const h24 =
    meridiem === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Format a "HH:MM" 24-h string for display: "9:00 AM". */
function displayLabel(v: string): string {
  const { hour, minute, meridiem } = parse(v);
  return `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

const DEFAULT_STATE: TimeState = { hour: 9, minute: 0, meridiem: "AM" };

const PANEL_WIDTH = 220;
const PANEL_EST_HEIGHT = 248;

// ─── Scroll wheel ─────────────────────────────────────────────────────────────

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
/** Padding so row 0 centres when scrollTop = 0 */
const WHEEL_PADDING = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;
const SNAP_DEBOUNCE_MS = 80;

interface WheelColumnProps {
  values: readonly number[];
  selected: number;
  onSelect: (v: number) => void;
  format: (v: number) => string;
  ariaLabel: string;
}

function WheelColumn({
  values,
  selected,
  onSelect,
  format,
  ariaLabel,
}: WheelColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const syncingRef = useRef(false);
  // Measured item height — initialised to the static constant so math is never NaN
  // before the ResizeObserver fires. Stored as state so padding/center calculations
  // in the render loop reflect the actual rendered size.
  const itemHeightRef = useRef(ITEM_HEIGHT);
  const [measuredItemHeight, setMeasuredItemHeight] = useState(ITEM_HEIGHT);
  const [scrollTop, setScrollTop] = useState(0);

  // Derive ITEM_HEIGHT from the actual rendered first button so zoom / OS text size changes
  // are reflected in scroll math without hardcoded pixel assumptions.
  useEffect(() => {
    const btn = firstButtonRef.current;
    if (!btn || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) {
        itemHeightRef.current = h;
        setMeasuredItemHeight(h);
      }
    });
    ro.observe(btn);
    return () => ro.disconnect();
  }, []);

  const scrollToIndex = useCallback(
    (index: number, smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      const ih = itemHeightRef.current;
      const clamped = Math.max(0, Math.min(values.length - 1, index));
      syncingRef.current = true;
      el.scrollTo({
        top: clamped * ih,
        behavior: smooth ? "smooth" : "auto",
      });
      setScrollTop(clamped * ih);
      window.setTimeout(
        () => {
          syncingRef.current = false;
        },
        smooth ? 280 : 0,
      );
    },
    [values.length],
  );

  useEffect(() => {
    const idx = values.indexOf(selected);
    if (idx >= 0) scrollToIndex(idx, false);
  }, [selected, values, scrollToIndex]);

  const commitSnap = useCallback(() => {
    const el = scrollRef.current;
    if (!el || syncingRef.current) return;
    const ih = itemHeightRef.current;
    const index = Math.round(el.scrollTop / ih);
    const clamped = Math.max(0, Math.min(values.length - 1, index));
    const snappedTop = clamped * ih;
    if (Math.abs(el.scrollTop - snappedTop) > 0.5) {
      scrollToIndex(clamped, true);
    }
    const next = values[clamped];
    if (next !== undefined && next !== selected) onSelect(next);
  }, [onSelect, scrollToIndex, selected, values]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setScrollTop(el.scrollTop);
      rafRef.current = null;
    });
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(commitSnap, SNAP_DEBOUNCE_MS);
  }, [commitSnap]);

  useEffect(
    () => () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const centerY = scrollTop + WHEEL_HEIGHT / 2;

  return (
    <div
      style={{
        position: "relative",
        width: 52,
        height: WHEEL_HEIGHT,
        flexShrink: 0,
      }}
    >
      {/* Selection band */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: measuredItemHeight,
          transform: "translateY(-50%)",
          borderRadius: "var(--radius-sm)",
          border:
            "1px solid color-mix(in srgb, var(--theme-accent) 28%, transparent)",
          background: "color-mix(in srgb, var(--theme-accent) 7%, transparent)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Top fade */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: WHEEL_PADDING + measuredItemHeight * 0.5,
          background:
            "linear-gradient(to bottom, var(--theme-paper) 15%, transparent)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
      {/* Bottom fade */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: WHEEL_PADDING + measuredItemHeight * 0.5,
          background:
            "linear-gradient(to top, var(--theme-paper) 15%, transparent)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      <div
        ref={scrollRef}
        role="listbox"
        aria-label={ariaLabel}
        onScroll={handleScroll}
        style={{
          height: WHEEL_HEIGHT,
          overflowY: "auto",
          overflowX: "hidden",
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          position: "relative",
          zIndex: 0,
        }}
      >
        <div
          style={{ paddingTop: WHEEL_PADDING, paddingBottom: WHEEL_PADDING }}
        >
          {values.map((v, i) => {
            const ih = measuredItemHeight;
            const itemCenter = WHEEL_PADDING + i * ih + ih / 2;
            const dist = Math.abs(centerY - itemCenter) / ih;
            const opacity = Math.max(0.18, 1 - dist * 0.42);
            const scale = Math.max(0.78, 1 - dist * 0.11);
            const isCentered = dist < 0.38;

            return (
              <button
                key={v}
                ref={i === 0 ? firstButtonRef : undefined}
                type="button"
                role="option"
                aria-selected={isCentered}
                onClick={() => {
                  onSelect(v);
                  scrollToIndex(i, true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: measuredItemHeight,
                  scrollSnapAlign: "center",
                  border: "none",
                  background: "transparent",
                  fontFamily: "var(--font-sans)",
                  fontSize: isCentered ? "var(--text-base)" : "var(--text-sm)",
                  fontWeight: isCentered
                    ? "var(--weight-semibold)"
                    : "var(--weight-medium)",
                  fontVariantNumeric: "tabular-nums",
                  color: isCentered
                    ? "var(--theme-accent)"
                    : "var(--theme-text-secondary)",
                  cursor: "pointer",
                  opacity,
                  transform: `scale(${scale})`,
                  transition: syncingRef.current
                    ? "none"
                    : "opacity 120ms var(--ease-out-expo), transform 120ms var(--ease-out-expo), color 120ms var(--ease-out-expo), font-size 120ms var(--ease-out-expo)",
                  willChange: "transform, opacity",
                  outline: "none",
                  padding: 0,
                }}
              >
                {format(v)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── AM/PM toggle ─────────────────────────────────────────────────────────────

function AmpmToggle({
  value,
  onChange,
}: {
  value: Meridiem;
  onChange: (m: Meridiem) => void;
}) {
  return (
    <div
      role="group"
      aria-label="AM or PM"
      style={{
        display: "flex",
        alignItems: "center",
        background: "var(--theme-paper-subtle)",
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-1)",
        gap: 0,
      }}
    >
      {(["AM", "PM"] as const).map((m) => {
        const isActive = value === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(m)}
            style={{
              flex: 1,
              position: "relative",
              padding: "var(--space-2) var(--space-3)",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-sans)",
              fontWeight: isActive
                ? "var(--weight-semibold)"
                : "var(--weight-medium)",
              color: isActive
                ? "var(--theme-text-primary)"
                : "var(--theme-text-secondary)",
              background: isActive ? "var(--theme-paper)" : "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              boxShadow: isActive ? "var(--shadow-1)" : "none",
              cursor: "pointer",
              transition: "var(--transition-hover)",
              outline: "none",
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared wheel panel (standalone popover + DatePicker embed) ─────────────────

export function TimePickerWheelPanel({
  hour,
  minute,
  meridiem,
  onChange,
  variant = "standalone",
  style,
}: TimePickerWheelPanelProps) {
  const wheels = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-1)",
      }}
    >
      <WheelColumn
        values={HOURS}
        selected={hour}
        format={(h) => String(h).padStart(2, "0")}
        onSelect={(h) => onChange(h, minute, meridiem)}
        ariaLabel="Hours"
      />
      <span
        aria-hidden="true"
        style={{
          color: "var(--theme-text-tertiary)",
          fontSize: "var(--text-lg)",
          fontWeight: "var(--weight-semibold)",
          lineHeight: 1,
          paddingTop: 2,
          userSelect: "none",
        }}
      >
        :
      </span>
      <WheelColumn
        values={MINUTES}
        selected={minute}
        format={(m) => String(m).padStart(2, "0")}
        onSelect={(m) => onChange(hour, m, meridiem)}
        ariaLabel="Minutes"
      />
    </div>
  );

  const ampm = (
    <AmpmToggle value={meridiem} onChange={(m) => onChange(hour, minute, m)} />
  );

  if (variant === "embedded") {
    return (
      <div
        style={{
          borderLeft: "1px solid var(--theme-paper-border)",
          borderRadius: "0 var(--radius-md) var(--radius-md) 0",
          padding: "var(--space-3)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "var(--space-3)",
          background: "var(--theme-paper)",
          flexShrink: 0,
          minWidth: 148,
          ...style,
        }}
      >
        {wheels}
        {ampm}
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: "var(--space-3) var(--space-3) var(--space-2)" }}>
        {wheels}
      </div>
      <div style={{ padding: "0 var(--space-3) var(--space-3)" }}>{ampm}</div>
    </>
  );
}

// ─── Standalone trigger + popover ─────────────────────────────────────────────

export function TimePicker({
  value,
  onChange,
  placeholder = "Set time…",
  disabled = false,
  style,
  "aria-label": ariaLabel,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<TimeState | null>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, flipUp: false });
  const [mounted, setMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const normalisedValue = useMemo(
    () => (value ? normalizeTimeHHMM(value) : null),
    [value],
  );

  const updatePanelPosition = useCallback((panelW?: number, panelH?: number) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const w = panelW ?? PANEL_WIDTH;
    const h = panelH ?? PANEL_EST_HEIGHT;
    const vvLeft = window.visualViewport?.offsetLeft ?? 0;
    const vvTop  = window.visualViewport?.offsetTop  ?? 0;
    const flipLeft = rect.left + w > window.innerWidth - 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < h && rect.top > spaceBelow;
    const left = (flipLeft ? rect.right - w : rect.left) - vvLeft;
    const top  = (flipUp ? rect.top - 4 : rect.bottom + 4) - vvTop;
    setPanelPos({ top, left, flipUp });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      setDraft(normalisedValue ? parse(normalisedValue) : { ...DEFAULT_STATE });
      updatePanelPosition();
      wasOpenRef.current = true;
    }
  }, [open, normalisedValue, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function reposition() { updatePanelPosition(); }
    window.addEventListener("mousedown", onOutside);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    window.visualViewport?.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("mousedown", onOutside);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
    };
  }, [open, updatePanelPosition]);

  // Re-measure panel after AnimatePresence commits the node to correct any flip error.
  useLayoutEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (!panelRef.current) return;
      const { width, height } = panelRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) updatePanelPosition(width, height);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, updatePanelPosition]);

  const panelState =
    draft ?? (normalisedValue ? parse(normalisedValue) : DEFAULT_STATE);

  function handleChange(h: number, m: number, mer: Meridiem) {
    const next = { hour: h, minute: m, meridiem: mer };
    setDraft(next);
    onChange(serialise(h, m, mer));
  }

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          key="timepicker-panel"
          role="dialog"
          aria-label="Time picker"
          variants={panelPos.flipUp ? DROPDOWN_VARIANTS_UP : DROPDOWN_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          // flip-up shift via transformTemplate — a style.transform string
          // would be clobbered by the animated y (see motion.ts)
          transformTemplate={panelPos.flipUp ? FLIP_UP_TRANSFORM_TEMPLATE : undefined}
          style={{
            position: "fixed",
            top: panelPos.top,
            left: panelPos.left,
            zIndex: "var(--z-modal-nested)" as React.CSSProperties["zIndex"],
            background: "var(--theme-paper)",
            border: "1px solid var(--theme-paper-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-3)",
            minWidth: PANEL_WIDTH,
            overflow: "hidden",
          }}
        >
          <TimePickerWheelPanel
            variant="standalone"
            hour={panelState.hour}
            minute={panelState.minute}
            meridiem={panelState.meridiem}
            onChange={handleChange}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "inline-flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel ?? "Time picker"}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          height: 32,
          padding: "0 var(--space-2)",
          width: "100%",
          minWidth: 88,
          background: "var(--theme-paper-subtle)",
          border: `1px solid ${focused || open ? "var(--theme-accent)" : "var(--theme-paper-border)"}`,
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-sans)",
          fontWeight: "var(--weight-normal)",
          color: normalisedValue
            ? "var(--theme-text-primary)"
            : "var(--theme-text-tertiary)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          boxShadow: focused || open ? "var(--shadow-focus)" : "none",
          transition: "var(--transition-hover)",
          outline: "none",
          whiteSpace: "nowrap",
          caretColor: "var(--theme-accent)",
        }}
      >
        <Clock
          aria-hidden="true"
          style={{
            width: 13,
            height: 13,
            strokeWidth: 1.5,
            color: "var(--theme-text-tertiary)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {normalisedValue ? displayLabel(normalisedValue) : placeholder}
        </span>
      </button>

      {mounted && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}
