"use client";

// The Activity dashboard's widgets (owner-approved layout, 2026-09-28). Display only: every number
// comes from computeActivity (lib/utils/client-activity.ts); every click hands the rows it counts to
// the shell (clients → the List; a message mark → the client messages themselves). Layout (owner,
// 2026-09-28: no wasted space, nothing cut): the tiles in one strip, then two widgets a row, each
// chart filling its card; the two client lists share a row, as do the silent chart and the table.

import type React from "react";
import { StatTile } from "@/components/ui/StatTile";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart } from "@/components/ui/charts/BarChart";
import { Heatmap, HeatmapScale } from "@/components/ui/charts/Heatmap";
import { JokerWidget, READABLE_TOOLTIP, WidgetChart, WidgetLink } from "@/components/jokers/JokerWidget";
import { MessagesLine } from "@/components/jokers/activity/MessagesLine";
import { CLIENT_ACTIVITY_SILENT_DAYS } from "@/lib/constants/joker-engagement";
import { dayLabel, hourLabel, teamSpokeLast, WEEK_ROWS, type ActivityView, type GroupStat } from "@/lib/utils/client-activity";
import { formatCount } from "@/lib/utils/numbers";

export type OpenClients = (label: string, gids: string[], order?: "silent") => void;
export type OpenMessages = (label: string, q: { gids?: string[]; weekday?: number; hour?: number; day?: string }) => void;

const SILENT_COLOR = "var(--neu-danger)";
/** The least a chart gets; a chart beside a taller card grows to match it. */
const CHART_MIN = 280;
/** Room so the axis numbers never touch the panel's edge. */
const MARGIN = { left: 8, right: 16, bottom: 4 };
const Y = { allowDecimals: false, width: 36 } as const;
const lastHeard = (s: GroupStat) => (s.silentDays === null ? "No word on record" : s.silentDays === 0 ? "Today" : s.silentDays === 1 ? "Yesterday" : `${s.silentDays} days ago`);

export function ActivityBoardView({ view, openClients, openMessages }: { view: ActivityView; openClients: OpenClients; openMessages: OpenMessages }) {
  if (!view.groups.length) {
    return <EmptyState framed title="No clients in these filters" description="Clear a filter to see the clients again." />;
  }
  const span = view.oneDay ? `on ${dayLabel(view.from)}, by hour` : view.from === view.to ? "" : `${dayLabel(view.from)} – ${dayLabel(view.to)}`;
  const all = view.groups.map((s) => s.g.gid);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Tiles, one strip */}
      <div className="lg:col-span-12 grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="col-span-2 lg:col-span-1 grid">
          <StatTile
            emphasis
            label="Active clients"
            value={formatCount(view.active.length)}
            sub={{ text: `of ${formatCount(view.groups.length)} clients wrote or reacted in the last ${CLIENT_ACTIVITY_SILENT_DAYS} days`, color: "var(--theme-text-tertiary)" }}
            onClick={() => openClients("Active clients", view.active.map((s) => s.g.gid))}
          />
        </div>
        <StatTile
          label="Client messages"
          value={formatCount(view.msgs)}
          sub={{ text: `+ ${formatCount(view.reacts)} reactions`, color: "var(--theme-text-tertiary)" }}
          onClick={() => openMessages("Client messages", { gids: all })}
        />
        <StatTile
          label={`Silent ${CLIENT_ACTIVITY_SILENT_DAYS}+ days`}
          value={formatCount(view.silent.length)}
          sub={{ text: `${formatCount(view.silentActiveMembers)} of them Active members`, color: "var(--theme-text-tertiary)" }}
          onClick={() => openClients(`Silent ${CLIENT_ACTIVITY_SILENT_DAYS}+ days`, view.silent.map((s) => s.g.gid), "silent")}
        />
      </div>

      <JokerWidget className="lg:col-span-6" title={`Client messages ${span}`}>
        <WidgetChart minHeight={CHART_MIN}>
        <MessagesLine
          height="100%"
          slots={view.slots}
          onPick={(slot) => openMessages(
            view.oneDay ? `Messages on ${dayLabel(view.from)}, ${slot.label}` : `Messages on ${slot.label}`,
            view.oneDay ? { gids: all, day: view.from, hour: Number(slot.key) } : { gids: all, day: slot.key },
          )}
        />
        </WidgetChart>
      </JokerWidget>

      <JokerWidget
        className="lg:col-span-6"
        title={`Active clients per ${view.oneDay ? "hour" : "day"}`}
        right={<WidgetLink onClick={() => openClients("Active clients", view.active.map((s) => s.g.gid))}>See the list</WidgetLink>}
      >
        <WidgetChart minHeight={CHART_MIN}>
        <BarChart
          niceAxis
          data={view.slots.map((s) => ({ label: s.label, key: s.key, clients: s.gids.length }))}
          series={[{ key: "clients", label: "Active clients" }]}
          xKey="label"
          height="100%"
          margin={MARGIN}
          maxBarSize={56}
          showValues={view.slots.length <= 14}
          onBarClick={(row) => {
            const slot = view.slots.find((s) => s.key === row.key);
            if (slot) openClients(view.oneDay ? `Active on ${dayLabel(view.from)}, ${slot.label}` : `Active on ${slot.label}`, slot.gids);
          }}
          xAxisProps={{ interval: "preserveStartEnd", minTickGap: 12 }}
          yAxisProps={Y}
          tooltipProps={READABLE_TOOLTIP}
        />
        </WidgetChart>
      </JokerWidget>

      <JokerWidget
        className="lg:col-span-6"
        title="Most active clients"
        right={<WidgetLink onClick={() => openClients("Clients who wrote, most messages first", view.groups.filter((s) => s.msgs + s.reacts > 0).map((s) => s.g.gid))}>See all</WidgetLink>}
      >
        {view.mostActive.length ? (
          <ClientRows>
            {view.mostActive.map((s) => {
              const max = Math.max(1, view.mostActive[0].msgs);
              return (
                <ClientRow
                  key={s.g.gid}
                  stat={s}
                  sub={`${s.qd} · ${s.mem}`}
                  onClick={() => openMessages(`${s.g.name}'s messages`, { gids: [s.g.gid] })}
                  middle={<Meter value={s.msgs} max={max} text={`${formatCount(s.msgs)} msg${s.msgs === 1 ? "" : "s"}${s.reacts ? ` · ${s.reacts} ♥` : ""}`} />}
                  end={lastHeard(s)}
                />
              );
            })}
          </ClientRows>
        ) : <EmptyState variant="inline" title="No client wrote in this period" description="Try a longer period or clear a filter." />}
      </JokerWidget>

      <JokerWidget
        className="lg:col-span-6"
        title="Silent clients"
        right={view.silentOrdered.length ? <WidgetLink onClick={() => openClients(`Silent ${CLIENT_ACTIVITY_SILENT_DAYS}+ days`, view.silent.map((s) => s.g.gid), "silent")}>See all {view.silentOrdered.length}</WidgetLink> : null}
      >
        {view.silentOrdered.length ? (
          <ClientRows>
            {view.silentOrdered.slice(0, 8).map((s) => (
              <ClientRow
                key={s.g.gid}
                stat={s}
                sub={s.qd}
                onClick={() => openClients(s.g.name, [s.g.gid])}
                middle={
                  <span style={{ display: "grid", justifyItems: "start", gap: "var(--space-1)" }}>
                    <Badge tone={s.mem === "Active" ? "neutral" : "warning"} size="xs">{s.mem}</Badge>
                    {teamSpokeLast(s.g) && <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)" }}>Last word: Our team</span>}
                  </span>
                }
                end={<span style={{ color: "var(--neu-danger-deep)", fontWeight: "var(--weight-medium)" }}>{s.silentDays === null ? "No word on record" : `${s.silentDays} days`}</span>}
              />
            ))}
          </ClientRows>
        ) : <EmptyState variant="inline" title="Nobody is silent" description={`Every client has written in the last ${CLIENT_ACTIVITY_SILENT_DAYS} days.`} />}
      </JokerWidget>

      <JokerWidget className="lg:col-span-6" title="How long they've been silent">
        <WidgetChart minHeight={CHART_MIN}>
        <BarChart
          niceAxis
          data={view.buckets.map((b) => ({ label: b.label, clients: b.gids.length }))}
          series={[{ key: "clients", label: "Silent clients" }]}
          colorMap={{ clients: SILENT_COLOR }}
          xKey="label"
          height="100%"
          margin={MARGIN}
          maxBarSize={64}
          showValues
          onBarClick={(row) => {
            const b = view.buckets.find((x) => x.label === row.label);
            if (b) openClients(`Silent · ${b.label === "No word" ? "no word on record" : b.label.replace(" d", " days")}`, b.gids, "silent");
          }}
          yAxisProps={Y}
          tooltipProps={READABLE_TOOLTIP}
        />
        </WidgetChart>
      </JokerWidget>

      <JokerWidget className="lg:col-span-6" title="By queendom">
        <div role="table" aria-label="Clients by queendom" style={{ display: "grid", gap: 0 }}>
          <div role="row" className="label-micro" style={{ ...QD_ROW, paddingTop: 0, borderTop: 0, fontSize: undefined }}>
            <span role="columnheader">Queendom</span><span role="columnheader">Clients</span>
            <span role="columnheader" style={NUM}>Active</span><span role="columnheader" style={NUM}>Silent</span><span role="columnheader" style={NUM}>Messages</span>
          </div>
          {view.byQueendom.map((q) => (
            <div role="row" key={q.qd} style={QD_ROW}>
              <button type="button" role="cell" onClick={() => openClients(`${q.qd} · every client`, [...q.active, ...q.silent])} style={{ ...PLAIN, textAlign: "left" }}>
                <span style={{ display: "block", fontWeight: "var(--weight-medium)" }}>{q.qd}</span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{formatCount(q.total)} clients</span>
              </button>
              <span role="cell" style={{ display: "flex", height: 10, maxWidth: "28rem", borderRadius: "var(--radius-full)", overflow: "hidden", background: "var(--theme-paper-subtle)" }}>
                {q.active.length > 0 && <button type="button" aria-label={`${q.qd}: ${q.active.length} active`} onClick={() => openClients(`${q.qd} · active`, q.active)} style={{ ...PLAIN, width: `${(100 * q.active.length) / q.total}%`, background: "var(--theme-accent)" }} />}
                {q.silent.length > 0 && <button type="button" aria-label={`${q.qd}: ${q.silent.length} silent`} onClick={() => openClients(`${q.qd} · silent`, q.silent, "silent")} style={{ ...PLAIN, width: `${(100 * q.silent.length) / q.total}%`, background: SILENT_COLOR }} />}
              </span>
              <button type="button" role="cell" onClick={() => openClients(`${q.qd} · active`, q.active)} style={{ ...PLAIN, ...NUM, color: "var(--neu-accent-deep)", fontWeight: "var(--weight-medium)" }}>{formatCount(q.active.length)}</button>
              <span role="cell" style={NUM}><button type="button" onClick={() => openClients(`${q.qd} · silent`, q.silent, "silent")} style={PLAIN}><Badge tone="danger" size="xs">{formatCount(q.silent.length)}</Badge></button></span>
              <span role="cell" style={NUM}>{formatCount(q.msgs)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
          <Legend color="var(--theme-accent)">Active: wrote in the last {CLIENT_ACTIVITY_SILENT_DAYS} days</Legend>
          <Legend color={SILENT_COLOR}>Silent: no word for {CLIENT_ACTIVITY_SILENT_DAYS}+ days</Legend>
        </div>
      </JokerWidget>

      <JokerWidget className="lg:col-span-4" title="Busiest day of the week">
        <WidgetChart minHeight={240}>
        <BarChart
          niceAxis
          data={view.weekdays.map((w) => ({ label: w.label, wd: w.wd, messages: w.avg }))}
          series={[{ key: "messages", label: "Client messages a day" }]}
          xKey="label"
          height="100%"
          margin={MARGIN}
          maxBarSize={44}
          showValues
          onBarClick={(row) => {
            const w = view.weekdays.find((x) => x.label === row.label);
            if (w && w.total) openMessages(`Messages on ${WEEK_ROWS.find((x) => x.wd === w.wd)?.full}s`, { gids: all, weekday: w.wd });
          }}
          yAxisProps={Y}
          tooltipProps={READABLE_TOOLTIP}
        />
        </WidgetChart>
      </JokerWidget>

      <JokerWidget className="lg:col-span-8" title="When clients are talking" right={<HeatmapScale label="Messages" />}>
        <Heatmap
          ariaLabel="Client messages by day of the week and hour"
          rows={WEEK_ROWS.map((w) => w.label)}
          cols={Array.from({ length: 24 }, (_, h) => hourLabel(h))}
          values={view.heat}
          colLabelEvery={3}
          cellHeight="2rem"
          cellLabel={(r, c, v) => `${WEEK_ROWS[r].label}, ${hourLabel(c)}: ${v} client message${v === 1 ? "" : "s"}`}
          onCellClick={(r, c) => openMessages(`Messages on ${WEEK_ROWS[r].full}s, ${hourLabel(c)}`, { gids: all, weekday: WEEK_ROWS[r].wd, hour: c })}
        />
      </JokerWidget>
    </div>
  );
}

const PLAIN: React.CSSProperties = { background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer" };
const NUM: React.CSSProperties = { textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
const QD_ROW: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "minmax(6.5rem, 1fr) minmax(4rem, 1.6fr) repeat(3, minmax(3.5rem, auto))", alignItems: "center",
  gap: "var(--space-3)", padding: "var(--space-3) 0", borderTop: "1px solid var(--theme-paper-border)", fontSize: "var(--text-sm)",
};

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: color }} />
      {children}
    </span>
  );
}

function Meter({ value, max, text }: { value: number; max: number; text: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
      <span aria-hidden="true" style={{ flex: 1, height: 6, borderRadius: "var(--radius-full)", background: "var(--theme-paper-subtle)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.round((100 * value) / max)}%`, borderRadius: "var(--radius-full)", background: "var(--theme-accent)" }} />
      </span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{text}</span>
    </span>
  );
}

function ClientRows({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gap: 2, margin: "0 calc(-1 * var(--space-2))" }}>{children}</div>;
}

function ClientRow({ stat, sub, middle, end, onClick }: { stat: GroupStat; sub: string; middle: React.ReactNode; end: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="serene-row-hover" style={{
      ...PLAIN, display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1.2fr) auto", alignItems: "center", gap: "var(--space-3)",
      padding: "var(--space-2)", borderRadius: "var(--radius-md)", textAlign: "left", width: "100%",
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: "var(--weight-medium)", fontSize: "var(--text-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stat.g.name}</span>
        <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      {middle}
      <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", textAlign: "right", whiteSpace: "nowrap" }}>{end}</span>
    </button>
  );
}
