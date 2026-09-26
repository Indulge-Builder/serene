"use client";

// Calendar view — the month at a glance (2026-09-25 layout). Left: the month grid
// with a dot on each due day, and this week's count in the card's footer. Right:
// the month's status breakdown (ui/StatStrip, the Freshdesk and Books anatomy:
// a cell per status with its count and what it adds up to) above ONE card of due
// dates (ui/SectionCard), an agenda: a date tile, the bill, its amount, its real
// per-cycle status; click a row for its history. Anchored to the current IST
// month; top-up subscriptions (no due date) never appear here. Amounts are never
// converted: every total is kept per currency.

import { SelectionButton } from '@/components/ui/SelectionButton';
import { Button } from '@/components/ui/Button';
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Calendar, type TaskDotMeta } from "@/components/ui/Calendar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatStrip } from "@/components/ui/StatStrip";
import { StatTile } from "@/components/ui/StatTile";
import { formatDate } from "@/lib/utils/dates";
import { formatCount, formatCurrency } from "@/lib/utils/numbers";
import {
  istTodayISO,
  occurrenceInMonthISO,
  statusForOccurrenceISO,
} from "@/lib/utils/subscription-status";
import {
  SUBSCRIPTION_CURRENCIES,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_CONFIG,
  SUBSCRIPTION_TYPE_LABELS,
  type SubscriptionStatus,
} from "@/lib/constants/subscription-constants";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
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

/** Per-currency totals, never converted: "₹47,199 · $506". Null when nothing has an amount. */
function moneyText(items: SubOccurrence[]): string | null {
  const totals = new Map<string, number>();
  for (const { sub } of items) {
    if (sub.amount == null) continue;
    totals.set(sub.currency, (totals.get(sub.currency) ?? 0) + sub.amount);
  }
  const parts = SUBSCRIPTION_CURRENCIES.filter((c) => totals.has(c)).map((c) =>
    formatCurrency(totals.get(c), c),
  );
  return parts.length ? parts.join(" · ") : null;
}

/** Most urgent first: overdue, due today, upcoming, paid. */
const STATUS_ORDER = [...SUBSCRIPTION_STATUSES].sort(
  (a, b) => SUBSCRIPTION_STATUS_CONFIG[a].order - SUBSCRIPTION_STATUS_CONFIG[b].order,
);

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

  // Weekly summary (Mon–Sun, IST), always anchored to today. Totals per currency
  // (amounts are never auto-converted, so one mixed total would be wrong).
  const week = useMemo(() => {
    const [ty, tm, td] = todayISO.split("-").map(Number);
    const dow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay(); // 0=Sun … 6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const start = addDaysISO(todayISO, mondayOffset);
    const end = addDaysISO(start, 6);
    const inWeek = currentMonthOccurrences.filter((o) => o.occ >= start && o.occ <= end);
    return { count: inWeek.length, money: moneyText(inWeek) };
  }, [currentMonthOccurrences, todayISO]);

  // The viewed month's breakdown: how many bills in each status, and what they add up to.
  const monthStats = useMemo(
    () =>
      STATUS_ORDER.map((status) => {
        const items = viewOccurrences.filter((o) => o.status === status);
        return { status, count: items.length, money: moneyText(items) };
      }),
    [viewOccurrences],
  );
  const monthMoney = useMemo(() => moneyText(viewOccurrences), [viewOccurrences]);

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

  // The agenda: one row per bill, the date tile only on a date's first row.
  const rows = useMemo(
    () => groups.flatMap(([date, items]) => items.map((o, i) => ({ ...o, date, first: i === 0 }))),
    [groups],
  );

  function openHistory(sub: SubscriptionListItem) {
    setHistoryFor(sub);
    setHistoryOpen(true);
  }

  const monthLabel = formatDate(`${viewMonth.year}-${pad2(viewMonth.month + 1)}-01`, "MMMM yyyy");
  const listTitle = selectedDay
    ? formatDate(selectedDay, "EEEE, dd MMMM")
    : isCurrentMonthView
      ? "Due this month"
      : `Due in ${monthLabel}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
      {/* The month: the grid, and this week in the card's footer. */}
      <div className="lg:sticky lg:top-0" style={cardStyle}>
        {/* Centred, so a stacked full-width card (tablets) keeps the grid in the middle. */}
        <div style={{ padding: "var(--space-5)", maxWidth: "340px", margin: "0 auto" }}>
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
        <div
          style={{
            borderTop: "1px solid var(--theme-paper-border)",
            background: "var(--neu-section-bg)",
            padding: "var(--space-4) var(--space-5)",
          }}
        >
          <p className="label-micro" style={{ margin: "0 0 var(--space-1)" }}>
            This week
          </p>
          <p style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--theme-text-primary)" }}>
            {week.count} {week.count === 1 ? "payment" : "payments"} due
            {week.money && (
              <span style={{ color: "var(--theme-text-secondary)" }}> · {week.money}</span>
            )}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: 0 }}>
        {/* The month in four numbers, most urgent first. */}
        <StatStrip
          title={monthLabel}
          aside={`${formatCount(viewOccurrences.length)} ${viewOccurrences.length === 1 ? "bill" : "bills"}${monthMoney ? ` · ${monthMoney}` : ""}`}
          divided
        >
          {monthStats.map(({ status, count, money }) => (
            <StatTile
              key={status}
              variant="cell"
              size="sm"
              dot={SUBSCRIPTION_STATUS_CONFIG[status].dot}
              label={SUBSCRIPTION_STATUS_CONFIG[status].label}
              value={formatCount(count)}
              sub={
                money
                  ? {
                      text: money,
                      color: status === "overdue" ? "var(--color-danger-text)" : "var(--theme-text-tertiary)",
                    }
                  : undefined
              }
            />
          ))}
        </StatStrip>

        <SectionCard
          title={listTitle}
          bodyPadding={false}
          headerRight={
            selectedDay ? (
              <Button variant="control" size="sm" type="button" onClick={() => setSelectedDay(null)}>
                Show whole month
              </Button>
            ) : undefined
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              variant="inline"
              title={selectedDay ? "Nothing due on this day." : `Nothing due in ${monthLabel}.`}
              description="Monthly and yearly bills land here on their due dates; top-ups never do."
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: "var(--space-2)" }}>
              {rows.map(({ sub: s, status, daysOverdue, date, first }, i) => {
                const isToday = date === todayISO;
                const detail = [
                  SUBSCRIPTION_TYPE_LABELS[s.type],
                  s.departments.map((d) => DOMAIN_LABELS[d] ?? d).join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={`${s.id}-${date}`}
                    // A hairline between dates; bills on the same date sit together.
                    style={{ borderTop: first && i > 0 ? "1px solid var(--theme-paper-border)" : undefined }}
                  >
                    <SelectionButton
                      appearance="option"
                      type="button"
                      onClick={() => openHistory(s)}
                      // From sm the amount and status columns have fixed widths, so every amount
                      // lines up down the list whatever the pill beside it says.
                      className="grid grid-cols-[3rem_minmax(0,1fr)_auto] sm:grid-cols-[3rem_minmax(0,1fr)_7rem_8.5rem] items-center gap-x-4"
                      style={{ width: "100%", padding: "var(--space-3)", textAlign: "left" }}
                    >
                      {/* The date tile: the day, and the weekday (or Today) beneath it. */}
                      {first ? (
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontVariantNumeric: "tabular-nums",
                              fontSize: "var(--text-lg)",
                              color: isToday ? "var(--neu-accent-deep)" : "var(--theme-text-primary)",
                            }}
                          >
                            {formatDate(date, "dd")}
                          </span>
                          <span
                            className="label-micro"
                            style={{ marginTop: "var(--space-1)", color: isToday ? "var(--neu-accent-deep)" : undefined }}
                          >
                            {isToday ? "Today" : formatDate(date, "EEE")}
                          </span>
                        </span>
                      ) : (
                        // Keeps the tile column (an sr-only child alone is absolutely
                        // positioned and would let the name fall into it); the date is
                        // still read out for this row.
                        <span>
                          <span className="sr-only">{formatDate(date, "EEE, dd MMM")}</span>
                        </span>
                      )}

                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        {/* Two lines on a phone (a cut-off name is unreadable), one line wider. */}
                        <span
                          className="line-clamp-2 sm:line-clamp-1"
                          style={{ fontWeight: "var(--weight-medium)", color: "var(--theme-text-primary)", overflowWrap: "anywhere" }}
                        >
                          {s.name}
                        </span>
                        <span
                          style={{
                            fontSize: "var(--text-xs)",
                            color: "var(--theme-text-tertiary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {/* On a phone this line is the amount; wider, the amount has its own
                              column and this line says how the bill recurs and whose it is. */}
                          <span className="sm:hidden" style={{ color: "var(--theme-text-secondary)" }}>
                            <CurrencyAmount amount={s.amount} currency={s.currency} />
                          </span>
                          <span className="hidden sm:inline">{detail}</span>
                        </span>
                      </span>

                      <span
                        className="hidden sm:block"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontVariantNumeric: "tabular-nums",
                          fontSize: "var(--text-sm)",
                          color: "var(--theme-text-primary)",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <CurrencyAmount amount={s.amount} currency={s.currency} />
                      </span>

                      {/* Real per-cycle status: settled → Paid, past-unpaid → Overdue,
                          today → Due today, future → Upcoming. */}
                      {/* Start-aligned in its column, so the pills line up like a table's. */}
                      <span style={{ justifySelf: "start" }}>
                        <SubscriptionStatusPill status={status} daysOverdue={daysOverdue} />
                      </span>
                    </SelectionButton>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
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
  borderRadius: "var(--neu-radius-card)",
  boxShadow: "var(--shadow-1)",
  overflow: "hidden",
} as const;
