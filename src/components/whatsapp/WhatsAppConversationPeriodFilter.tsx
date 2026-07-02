"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { m as motion, AnimatePresence } from "framer-motion";
import { Check, SlidersHorizontal } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { EASE_OUT_EXPO, FAST_DURATION } from "@/lib/constants/motion";
import {
  WHATSAPP_PERIOD_LABELS,
  WHATSAPP_PERIODS,
  type WhatsAppPeriod,
} from "@/lib/constants/whatsapp-period";
import { parseWhatsAppPeriodFromSearchParams } from "@/lib/utils/whatsapp-period";

function periodOptionRow(
  id: WhatsAppPeriod | null,
  label: string,
  selected: WhatsAppPeriod | null,
  onSelect: (p: WhatsAppPeriod | null) => void,
  onClose: () => void,
) {
  const isActive = selected === id;
  return (
    <button
      key={id ?? "all"}
      type="button"
      onClick={() => {
        onSelect(id);
        if (id !== "custom") onClose();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        width: "100%",
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius-sm)",
        background: isActive ? "var(--theme-accent-surface)" : "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        transition: "background var(--duration-fast) var(--ease-in-out)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "var(--theme-paper-subtle)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          flex: 1,
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          color: isActive ? "var(--theme-accent)" : "var(--theme-text-primary)",
          fontWeight: isActive ? "var(--weight-semibold)" : "var(--weight-normal)",
        }}
      >
        {label}
      </span>
      {isActive && (
        <Check
          style={{ width: 13, height: 13, color: "var(--theme-accent)", flexShrink: 0 }}
          strokeWidth={2}
        />
      )}
    </button>
  );
}

export function WhatsAppConversationPeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { period, customFrom, customTo } = parseWhatsAppPeriodFromSearchParams(params);

  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState<Date | null>(
    customFrom ? new Date(customFrom) : null,
  );
  const [toDate, setToDate] = useState<Date | null>(
    customTo ? new Date(customTo) : null,
  );

  const popoverRef = useRef<HTMLDivElement>(null);
  const isFiltered = period !== null;

  useEffect(() => {
    setFromDate(customFrom ? new Date(customFrom) : null);
    setToDate(customTo ? new Date(customTo) : null);
  }, [customFrom, customTo]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function push(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSelect(next: WhatsAppPeriod | null) {
    if (next === null) {
      push({ period: null, from: null, to: null });
      return;
    }
    if (next === "custom") {
      push({ period: "custom" });
      return;
    }
    push({ period: next, from: null, to: null });
  }

  function applyCustomRange() {
    if (!fromDate && !toDate) return;
    push({
      period: "custom",
      from: fromDate ? fromDate.toISOString() : null,
      to:   toDate   ? toDate.toISOString()   : null,
    });
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }} ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Filter by last message"
        aria-label="Filter conversations by period"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "26px",
          height: "26px",
          borderRadius: "var(--radius-sm)",
          border: isFiltered
            ? "1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent)"
            : "1px solid transparent",
          background: isFiltered ? "var(--theme-accent-surface)" : "transparent",
          cursor: "pointer",
          transition:
            "background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)",
        }}
        onMouseEnter={(e) => {
          if (!isFiltered) e.currentTarget.style.background = "var(--theme-paper-subtle)";
        }}
        onMouseLeave={(e) => {
          if (!isFiltered) e.currentTarget.style.background = "transparent";
        }}
      >
        <SlidersHorizontal
          style={{
            width: 14,
            height: 14,
            color: isFiltered ? "var(--theme-accent)" : "var(--theme-text-tertiary)",
            transition: "color var(--duration-fast) var(--ease-in-out)",
          }}
          strokeWidth={1.5}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: "var(--z-dropdown)" as React.CSSProperties["zIndex"],
              background: "var(--theme-paper)",
              border: "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-3)",
              minWidth: "200px",
              padding: "var(--space-1)",
              overflow: "hidden",
            }}
          >
            {periodOptionRow(null, "All conversations", period, handleSelect, () =>
              setOpen(false),
            )}
            <div
              style={{
                height: "1px",
                background: "var(--theme-paper-border)",
                margin: "var(--space-1) 0",
              }}
            />
            {WHATSAPP_PERIODS.map((p) =>
              periodOptionRow(p, WHATSAPP_PERIOD_LABELS[p], period, handleSelect, () =>
                setOpen(false),
              ),
            )}

            {period === "custom" && (
              <div
                style={{
                  padding: "var(--space-2) var(--space-3) var(--space-3)",
                  borderTop: "1px solid var(--theme-paper-border)",
                  marginTop: "var(--space-1)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                <DatePicker
                  value={fromDate}
                  onChange={setFromDate}
                  placeholder="From"
                />
                <DatePicker
                  value={toDate}
                  onChange={setToDate}
                  placeholder="To"
                />
                <button
                  type="button"
                  onClick={applyCustomRange}
                  disabled={!fromDate && !toDate}
                  style={{
                    width: "100%",
                    padding: "var(--space-2)",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: "var(--theme-accent)",
                    color: "var(--theme-accent-fg)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-xs)",
                    fontWeight: "var(--weight-semibold)",
                    cursor: fromDate || toDate ? "pointer" : "not-allowed",
                    opacity: fromDate || toDate ? 1 : 0.5,
                  }}
                >
                  Apply range
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

WhatsAppConversationPeriodFilter.displayName = "WhatsAppConversationPeriodFilter";
