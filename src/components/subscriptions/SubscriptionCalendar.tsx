"use client";

// Calendar view — a month grid with a dot on each day that has a subscription due,
// a weekly summary, and a grouped list of what's due (click → history). Anchored to
// the current IST month; top-up subscriptions (no due date) never appear here.

import { SelectionButton } from '@/components/ui/SelectionButton';
import { Button } from '@/components/ui/Button';
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Calendar, type TaskDotMeta } from "@/components/ui/Calendar";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/numbers";
import {
  istTodayISO,
  occurrenceInMonthISO,
  statusForOccurrenceISO,
} from "@/lib/utils/subscription-status";
import type { SubscriptionStatus } from "@/lib/constants/subscription-constants";
import type { SubscriptionListItem } from "@/lib/types/subscription";
import { SubscriptionStatusPill, CurrencyAmount } from "./SubscriptionBits";

const SubscriptionHistoryModal = dynamic(
  () => import("./SubscriptionHistoryModal").then((m) => m.SubscriptionHistoryModal),
  { ssr: false },
);

/** A subscription projected onto one due date, with that occurrence's real status. */
type SubOccurrence = {
  sub: SubscriptionListItem;
  occ: string; // 'YYYY-MM-DD'
  status: SubscriptionStatus;
  daysOverdue: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

export function SubscriptionCalendar({
  subscriptions,
}: {
  subscriptions: SubscriptionListItem[];
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<SubscriptionListItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const now = new Date();
  const todayISO = istTodayISO(now);
  const curYear = Number(todayISO.slice(0, 4));
  const curMonth0 = Number(todayISO.slice(5, 7)) - 1;

  // Which month the calendar is showing (0-indexed). Starts on the current IST
  // month; <Calendar onMonthChange> updates it as the user navigates. This is what
  // makes recurrence visible — the grid + due list follow whatever month is open.
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>({
    year: curYear,
    month: curMonth0,
  });
  const isCurrentMonthView = viewMonth.year === curYear && viewMonth.month === curMonth0;

  // Recurrence projection: each subscription's occurrence within a month.
  // monthly/other recur every month on due_day; yearly once a year on due_date's
  // month/day; top_up never. At most one occurrence per sub per month.
  const occurrencesFor = useCallback(
    (year: number, month0: number): SubOccurrence[] =>
      subscriptions
        .map((sub): SubOccurrence | null => {
          const occ = occurrenceInMonthISO(sub, year, month0);
          if (!occ) return null;
          // Don't project onto months before the subscription existed — no phantom
          // "overdue" history for a sub created last week.
          if (sub.created_at && occ < sub.created_at.slice(0, 10)) return null;
          const { status, daysOverdue } = statusForOccurrenceISO(
            sub.type,
            sub.paidCycleKeys,
            occ,
            todayISO,
          );
          return { sub, occ, status, daysOverdue };
        })
        .filter((o): o is SubOccurrence => o !== null)
        .sort((a, b) => (a.occ < b.occ ? -1 : 1)),
    [subscriptions, todayISO],
  );

  // Occurrences in the VIEWED month → the calendar dots + the due list.
  const viewOccurrences = useMemo(
    () => occurrencesFor(viewMonth.year, viewMonth.month),
    [occurrencesFor, viewMonth.year, viewMonth.month],
  );

  // Occurrences in the CURRENT IST month → the "This Week" card, always anchored
  // to today regardless of which month is being browsed.
  const currentMonthOccurrences = useMemo(
    () => occurrencesFor(curYear, curMonth0),
    [occurrencesFor, curYear, curMonth0],
  );

  const taskDots = useMemo(() => {
    const dots: Record<string, TaskDotMeta> = {};
    for (const { occ, status } of viewOccurrences) {
      const existing = dots[occ];
      const urgent = status === "overdue" || status === "due_today";
      dots[occ] = {
        count: (existing?.count ?? 0) + 1,
        hasUrgent: existing?.hasUrgent || urgent,
      };
    }
    return dots;
  }, [viewOccurrences]);

  // Weekly summary (Mon–Sun, IST). INR total sums only INR-denominated subs
  // (amounts are never auto-converted, so a mixed-currency ₹ total would be wrong).
  const week = useMemo(() => {
    const [ty, tm, td] = todayISO.split("-").map(Number);
    const dow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay(); // 0=Sun … 6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const start = addDaysISO(todayISO, mondayOffset);
    const end = addDaysISO(start, 6);
    const inWeek = currentMonthOccurrences.filter((o) => o.occ >= start && o.occ <= end);
    const inrTotal = inWeek
      .filter((o) => o.sub.currency === "INR" && o.sub.amount != null)
      .reduce((sum, o) => sum + (o.sub.amount ?? 0), 0);
    return { count: inWeek.length, inrTotal };
  }, [currentMonthOccurrences, todayISO]);

  // Local Date for the selected day so the Calendar can highlight the cell.
  // Must be a LOCAL date (not Date.UTC) — Calendar's isSameDay compares local
  // getFullYear/getMonth/getDate against its local-date cells.
  const selectedDate = useMemo(() => {
    if (!selectedDay) return null;
    const [y, m, d] = selectedDay.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDay]);

  // Grouped by occurrence date — the selected day, else the whole viewed month.
  const groups = useMemo(() => {
    const listed = selectedDay
      ? viewOccurrences.filter((o) => o.occ === selectedDay)
      : viewOccurrences;
    const map = new Map<string, SubOccurrence[]>();
    for (const o of listed) {
      const arr = map.get(o.occ) ?? [];
      arr.push(o);
      map.set(o.occ, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [viewOccurrences, selectedDay]);

  function openHistory(sub: SubscriptionListItem) {
    setHistoryFor(sub);
    setHistoryOpen(true);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      {/* Calendar */}
      <div className="lg:sticky lg:top-0 self-start">
        <div style={cardStyle}>
          <Calendar
            value={selectedDate}
            taskDots={taskDots}
            onMonthChange={(y, m) => {
              setViewMonth({ year: y, month: m });
              setSelectedDay(null); // a stale day from the old month shouldn't linger
            }}
            onSelect={(d) => {
              const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
              setSelectedDay((prev) => (prev === key ? null : key));
            }}
          />
        </div>
        <div style={{ ...cardStyle, marginTop: "var(--space-4)" }}>
          <p className="label-micro" style={{ margin: "0 0 var(--space-1)" }}>
            This Week
          </p>
          <p style={{ margin: 0, fontSize: "var(--text-lg)", color: "var(--theme-text-primary)" }}>
            {week.count} {week.count === 1 ? "payment" : "payments"} due
          </p>
          {week.inrTotal > 0 && (
            <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)" }}>
              {formatCurrency(week.inrTotal, "INR")} total{" "}
              <span style={{ color: "var(--theme-text-tertiary)" }}>(INR subscriptions)</span>
            </p>
          )}
        </div>
      </div>

      {/* Due list */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "var(--text-lg)", fontWeight: "var(--weight-normal)", color: "var(--theme-text-primary)" }}>
            {selectedDay
              ? formatDate(selectedDay, "dd MMMM yyyy")
              : isCurrentMonthView
                ? "Due this month"
                : `Due in ${formatDate(
                    `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}-01`,
                    "MMMM yyyy",
                  )}`}
          </h2>
          {selectedDay && (
            <Button
              variant="control"
              size="sm"
              type="button"
              onClick={() => setSelectedDay(null)}
            >
              Show whole month
            </Button>
          )}
        </div>

        {groups.length === 0 ? (
          <EmptyState
            variant="inline"
            title={selectedDay ? "Nothing due on this day." : "Nothing due this month."}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {groups.map(([date, items]) => (
              <div key={date}>
                <p className="label-micro" style={{ margin: "0 0 var(--space-2)" }}>
                  {formatDate(date, "EEE, dd MMM")}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {items.map(({ sub: s, status, daysOverdue }) => (
                    <SelectionButton appearance="option"
      key={s.id}
      type="button"
      onClick={() => openHistory(s)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        width: "100%",
        padding: "var(--space-3) var(--space-4)",
      }}
    >
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                        <span style={{ fontWeight: "var(--weight-medium)", color: "var(--theme-text-primary)" }}>
                          {s.name}
                        </span>
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)" }}>
                          <CurrencyAmount amount={s.amount} currency={s.currency} />
                        </span>
                      </span>
                      {/* Real per-cycle status: settled → Paid, past-unpaid → Overdue,
                          today → Due today, future → Upcoming. */}
                      <SubscriptionStatusPill status={status} daysOverdue={daysOverdue} />
                    </SelectionButton>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {historyFor && (
        <SubscriptionHistoryModal
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          subscriptionId={historyFor.id}
          subscriptionName={historyFor.name}
        />
      )}
    </div>
  );
}

const cardStyle = {
  background: "var(--theme-paper)",
  border: "1px solid var(--theme-paper-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-1)",
  padding: "var(--space-5)",
} as const;
