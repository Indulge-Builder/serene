"use client";

// The Recommendations & Engagement dashboard's widgets (the owner's reference layout, 2026-09-28).
// Display only: every number comes from computeBoard (lib/utils/joker-board.ts); every bar, bar
// segment, slice, tile and heatmap square hands the items it counts to the shell, which opens them
// in the List. Layout (owner, 2026-09-28: no wasted space, nothing cut, bars upright): the tiles in
// one strip, then two widgets a row (the two response charts full width: twelve titles need the
// room), each chart filling its card; titles and names sit straight under their bars on two lines.

import type React from "react";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { BarChart } from "@/components/ui/charts/BarChart";
import { Heatmap, HeatmapScale } from "@/components/ui/charts/Heatmap";
import { JokerWidget, READABLE_TOOLTIP, WidgetChart } from "@/components/jokers/JokerWidget";
import { JokerPie } from "@/components/jokers/re/JokerPie";
import { dayLabel, hourLabel, WEEK_ROWS } from "@/lib/utils/client-activity";
import { categoryColor, JOKER_MAUVE, OUTCOME_COLORS, OUTCOME_LABELS, SPLIT_OTHERS, type BoardView, type JokerOutcome, type SplitBy, type StackCol } from "@/lib/utils/joker-board";
import { formatCount, formatPercent } from "@/lib/utils/numbers";

export type OpenItems = (label: string, ids: string[]) => void;

const SPLITS = [{ id: "title", label: "Title" }, { id: "category", label: "Category" }, { id: "joker", label: "Joker" }];

/** The least a chart gets; a chart beside a taller card grows to match it. */
const CHART_MIN = 300;
/** Room so the axis numbers never touch the panel's edge. */
const MARGIN = { left: 8, right: 16, bottom: 4 };
const Y = { allowDecimals: false, width: 36 } as const;
const DAYS_X = { interval: "preserveStartEnd", minTickGap: 12 } as const;
/** Charts of titles or names: each name straight under its bar on two lines (the tooltip has it whole). */
const NAMES = { wrapLabels: 11, maxBarSize: 48, margin: MARGIN } as const;
/** The tile strip: the headline tile then one per outcome (Tailwind needs the class written out). */
const TILE_COLS: Record<number, string> = { 3: "lg:grid-cols-3", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" };

/** Stacked columns → BarChart rows + series. Keys are positional (s0 …): a title can hold dots. An
 *  empty segment is left out (null), so the tooltip lists only what is there, in the legend's order. */
function stack(cols: StackCol[], series: { label: string; color: string }[]) {
  return {
    data: cols.map((c) => ({ label: c.label, key: c.key, ...Object.fromEntries(c.segs.map((s, i) => [`s${i}`, s.ids.length || null])) })),
    series: series.map((s, i) => ({ key: `s${i}`, label: s.label })),
    colorMap: Object.fromEntries(series.map((s, i) => [`s${i}`, s.color])),
    pick: (row: Record<string, unknown>, key: string) => cols.find((c) => c.key === row.key)?.segs[Number(key.slice(1))],
  };
}
/** The split's colours, one per named group (SPLIT_MAX): the fixed pastel family, ordered so
 *  neighbours differ, and never the theme colour, since every theme's accent sits next to one of these
 *  pastels (the Lilac theme painted two titles the same). Shades of one yellow read too pale and too
 *  brown (owner, 2026-09-28). */
const SPLIT_COLORS = [
  "var(--neu-powder)", "var(--neu-peach)", "var(--neu-lilac)", "var(--neu-teal)",
  "var(--neu-danger)", "var(--neu-butter)", "var(--neu-sage)",
];
/** Others: the family's mixed eighth colour, never a grey (owner, 2026-09-28). */
const OTHERS_COLOR = JOKER_MAUVE;

export function REBoardView({ view, noun, today, split, setSplit, openItems }: {
  view: BoardView;
  noun: string;
  today: string;
  split: SplitBy;
  setSplit: (s: SplitBy) => void;
  openItems: OpenItems;
}) {
  if (!view.base.length) {
    return <EmptyState framed title="Nothing sent in these filters" description="Clear a filter or pick a longer period." />;
  }
  const outs = view.outs;
  const outSeries = outs.map((o) => ({ label: OUTCOME_LABELS[o], color: OUTCOME_COLORS[o] }));
  const lower = noun.toLowerCase();
  const splitColors = view.splitGroups.map((g, i) => (g === SPLIT_OTHERS ? OTHERS_COLOR : SPLIT_COLORS[i] ?? OTHERS_COLOR));
  const perDay = stack(view.sentPerDay, view.splitGroups.map((_, i) => ({ label: view.splitLabels[i], color: splitColors[i] })));
  const clients = stack(view.clients, outSeries);
  const byTitle = stack(view.byTitle, outSeries);
  const byDate = stack(view.byDate, outSeries);
  // The answers only (owner, 2026-09-28: No reply dwarfed them into slivers; its tile says it): one
  // bar per answer, each in its outcome's colour (a stack of one segment).
  const answers = view.response.filter((r) => r.key !== "not_replied");
  const response = stack(
    answers.map((r, i) => ({ key: r.key, label: r.label, segs: answers.map((a, j) => ({ key: a.key, label: r.label, ids: i === j ? r.ids : [] })) })),
    answers.map((r) => ({ label: r.label, color: OUTCOME_COLORS[r.key as JokerOutcome] })),
  );
  const answered = answers.some((r) => r.ids.length);
  const single = (rows: { key: string; label: string; ids: string[] }[]) => rows.map((r) => ({ label: r.label, key: r.key, items: r.ids.length }));
  const open1 = (rows: { key: string; label: string; ids: string[] }[], prefix: string) => (row: Record<string, unknown>) => {
    const r = rows.find((x) => x.key === row.key);
    if (r) openItems(`${prefix}${r.label}`, r.ids);
  };
  const openSeg = (s: ReturnType<typeof stack>) => (row: Record<string, unknown>, key: string) => {
    const seg = s.pick(row, key);
    if (seg) openItems(seg.label, seg.ids);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Tiles, one strip */}
      <div className={`lg:col-span-12 grid grid-cols-2 ${TILE_COLS[outs.length + 1] ?? "lg:grid-cols-5"} gap-3`}>
        <div className="col-span-2 lg:col-span-1 grid">
          <StatTile emphasis label={`${noun} sent`} value={formatCount(view.total)} sub={{ text: view.total ? `${formatPercent(view.repliedShare)} got a reply` : "Nothing sent in this period", color: "var(--theme-text-tertiary)" }}
            onClick={() => openItems(`Every ${lower.replace(/s$/, "")} in the period`, view.rows.map((i) => i.id))} />
        </div>
        {view.tiles.map((t) => (
          <StatTile key={t.key} label={t.label} value={formatCount(t.n)} sub={{ text: formatPercent(t.share), color: "var(--theme-text-tertiary)" }} onClick={() => openItems(t.label, t.ids)} />
        ))}
      </div>

      <JokerWidget className="lg:col-span-6" title={`${noun} sent`} right={
        <FilterDropdown label={`Split by ${SPLITS.find((s) => s.id === split)?.label.toLowerCase()}`} items={SPLITS} selected={[split]} onChange={(v) => v[0] && setSplit(v[0] as SplitBy)} clearable={false} hideCountBadge menuPortal />
      }>
        <WidgetChart minHeight={CHART_MIN}>
          <BarChart niceAxis data={perDay.data} series={perDay.series} colorMap={perDay.colorMap} xKey="label" stacked height="100%" showValues={view.sentPerDay.length <= 14} margin={MARGIN}
            onBarClick={openSeg(perDay)} xAxisProps={DAYS_X} yAxisProps={Y} tooltipProps={READABLE_TOOLTIP} maxBarSize={56} />
        </WidgetChart>
        <Legend items={view.splitGroups.map((_, i) => ({ label: view.splitLabels[i], color: splitColors[i] }))} />
      </JokerWidget>

      <JokerWidget className="lg:col-span-6" title={outs.includes("interested") ? "Recommendation interest" : "Engagement replies"}>
        {answered ? (
        <WidgetChart minHeight={CHART_MIN}>
          <BarChart niceAxis data={response.data} series={response.series} colorMap={response.colorMap} xKey="label" stacked height="100%" showValues margin={MARGIN}
            onBarClick={openSeg(response)} yAxisProps={Y} tooltipProps={READABLE_TOOLTIP} maxBarSize={72} />
        </WidgetChart>
        ) : <EmptyState variant="inline" title="No client answered in this period" description="Try a longer period or clear a filter." />}
      </JokerWidget>

      <JokerWidget className="lg:col-span-6" title={`${noun} sent today`}>
        {view.sentToday.length ? (
          <WidgetChart minHeight={CHART_MIN}>
            <BarChart niceAxis {...NAMES} data={single(view.sentToday)} series={[{ key: "items", label: "Sent today" }]} xKey="label" height="100%" showValues
              onBarClick={open1(view.sentToday, "Sent today · ")} yAxisProps={Y} tooltipProps={READABLE_TOOLTIP} />
          </WidgetChart>
        ) : <EmptyState variant="inline" title={`No ${lower} sent today yet`} description={`${dayLabel(today)} so far.`} />}
      </JokerWidget>

      <JokerWidget className="lg:col-span-6" title="Most active clients, top 10">
        {view.clients.length ? (
          <>
            <WidgetChart minHeight={CHART_MIN}>
              <BarChart niceAxis {...NAMES} data={clients.data} series={clients.series} colorMap={clients.colorMap} xKey="label" stacked height="100%" showValues
                onBarClick={openSeg(clients)} yAxisProps={Y} tooltipProps={READABLE_TOOLTIP} />
            </WidgetChart>
            <Legend items={outSeries.filter((_, i) => outs[i] !== "not_replied")} />
          </>
        ) : <EmptyState variant="inline" title="No client answered in this period" description="Try a longer period." />}
      </JokerWidget>

      <JokerWidget className="lg:col-span-12" title={`${noun} vs client response, by title`}>
        <WidgetChart minHeight={CHART_MIN}>
          <BarChart niceAxis {...NAMES} data={byTitle.data} series={byTitle.series} colorMap={byTitle.colorMap} xKey="label" stacked height="100%" showValues
            onBarClick={openSeg(byTitle)} yAxisProps={Y} tooltipProps={READABLE_TOOLTIP} />
        </WidgetChart>
        <Legend items={outSeries} />
      </JokerWidget>

      <JokerWidget className="lg:col-span-12" title={`${noun} vs client response, by date`}>
        <WidgetChart minHeight={CHART_MIN}>
          <BarChart niceAxis data={byDate.data} series={byDate.series} colorMap={byDate.colorMap} xKey="label" stacked height="100%" showValues={view.byDate.length <= 14} margin={MARGIN}
            onBarClick={openSeg(byDate)} xAxisProps={DAYS_X} yAxisProps={Y} tooltipProps={READABLE_TOOLTIP} maxBarSize={56} />
        </WidgetChart>
        <Legend items={outSeries} />
      </JokerWidget>

      <JokerWidget className="lg:col-span-6" title={`${noun} sent by category`}>
        <JokerPie slices={view.pieSent} colorOf={categoryColor} ariaLabel={`${noun} sent by category`} onPick={(s) => openItems(`Sent · ${s.label}`, s.ids)} />
      </JokerWidget>
      <JokerWidget className="lg:col-span-6" title="Interested by category">
        <JokerPie slices={view.pieInterested} colorOf={categoryColor} ariaLabel="Interested by category" onPick={(s) => openItems(`Interested · ${s.label}`, s.ids)} />
      </JokerWidget>

      <JokerWidget className="lg:col-span-6" title={`${noun} with the highest interest, top 10`}>
        {view.topInterest.length ? (
          <WidgetChart minHeight={CHART_MIN}>
            <BarChart niceAxis {...NAMES} data={single(view.topInterest)} series={[{ key: "items", label: "Interested" }]} colorMap={{ items: OUTCOME_COLORS.interested }} xKey="label" height="100%" showValues
              onBarClick={open1(view.topInterest, "Interested · ")} yAxisProps={Y} tooltipProps={READABLE_TOOLTIP} />
          </WidgetChart>
        ) : <EmptyState variant="inline" title="Nobody said yes in this period" description="Try a longer period or clear a filter." />}
      </JokerWidget>
      <JokerWidget className="lg:col-span-6" title="Highest interest for the day">
        {view.interestToday.length ? (
          <WidgetChart minHeight={CHART_MIN}>
            <BarChart niceAxis {...NAMES} data={single(view.interestToday)} series={[{ key: "items", label: "Interested today" }]} colorMap={{ items: OUTCOME_COLORS.interested }} xKey="label" height="100%" showValues
              onBarClick={open1(view.interestToday, "Interested today · ")} yAxisProps={Y} tooltipProps={READABLE_TOOLTIP} />
          </WidgetChart>
        ) : <EmptyState variant="inline" title="No yes today yet" description={`${dayLabel(today)} so far.`} />}
      </JokerWidget>

      <JokerWidget className="lg:col-span-4" title="Best day to send">
        <WidgetChart minHeight={240}>
          <BarChart niceAxis data={view.weekday.map((w) => ({ label: w.label, key: w.key, rate: w.rate }))} series={[{ key: "rate", label: "Got a reply (%)" }]} xKey="label" height="100%" showValues valueFormat={(v) => `${v}%`} margin={MARGIN}
            colorMap={{ rate: "var(--theme-accent)" }} maxBarSize={44}
            onBarClick={(row) => { const w = view.weekday.find((x) => x.key === row.key); if (w && w.sent) openItems(`Sent on ${w.full}s`, w.ids); }}
            yAxisProps={{ ...Y, tickFormatter: (v: number) => `${v}%` }} tooltipProps={READABLE_TOOLTIP} />
        </WidgetChart>
      </JokerWidget>
      <JokerWidget className="lg:col-span-8" title="Best time to send" right={<HeatmapScale label="Reply rate" />}>
        <Heatmap
          ariaLabel="Reply rate by the day and hour an item went out"
          rows={WEEK_ROWS.map((w) => w.label)}
          cols={Array.from({ length: 24 }, (_, h) => hourLabel(h))}
          values={view.heat.map((r) => r.map((c) => c.sent))}
          intensity={(_, r, c) => { const x = view.heat[r][c]; return x.sent ? x.replied / x.sent : 0; }}
          colLabelEvery={3}
          cellHeight="2rem"
          cellLabel={(r, c) => { const x = view.heat[r][c]; return `${WEEK_ROWS[r].label}, ${hourLabel(c)}: ${x.sent} sent · ${x.sent ? Math.round((100 * x.replied) / x.sent) : 0}% got a reply`; }}
          onCellClick={(r, c) => openItems(`Sent on ${WEEK_ROWS[r].full}s, ${hourLabel(c)}`, view.heat[r][c].ids)}
        />
      </JokerWidget>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--space-1) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: i.color } as React.CSSProperties} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
export type { JokerOutcome };
