"use client";

// The Activity dashboard's client shell (owner, 2026-09-28): the filter bar (Queendom, Client,
// Membership, Period; no Joker filter), the Dashboard | List switch, and what a click opened. The
// board arrives once from the page (the last 90 days, compact); every filter and every number is
// worked out here, in the browser, by computeActivity. The messages themselves are read on demand.

import { useMemo, useState } from "react";
import { FilterBar } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { TabSelector } from "@/components/ui/TabSelector";
import { resolveDateRangePreset } from "@/lib/constants/date-range-presets";
import { JOKER_DEFAULT_PERIOD, JOKER_PERIOD_PRESETS } from "@/lib/constants/joker-engagement";
import { computeActivity, dayLabel, NO_QUEENDOM, NO_STATUS, type ActivityBoard } from "@/lib/utils/client-activity";
import { formatCount } from "@/lib/utils/numbers";
import { ActivityBoardView, type OpenClients, type OpenMessages } from "@/components/jokers/activity/ActivityBoardView";
import { ActivityClientsList } from "@/components/jokers/activity/ActivityClientsList";
import { ActivityMessagesList } from "@/components/jokers/activity/ActivityMessagesList";

export type ActivityDrill =
  | { kind: "clients"; label: string; gids: string[]; order?: "silent" }
  | { kind: "messages"; label: string; from: string; to: string; gids: string[] | null; weekday: number | null; hour: number | null };

const TABS = [{ id: "dashboard", label: "Dashboard" }, { id: "list", label: "List" }];
const memRank = (v: string) => (v === "Active" ? 0 : v === "Expired" ? 1 : 2);

export function ActivityShell({ board }: { board: ActivityBoard }) {
  const initial = resolveDateRangePreset(JOKER_DEFAULT_PERIOD);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [qds, setQds] = useState<string[]>([]);
  const [mems, setMems] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [tab, setTab] = useState<"dashboard" | "list">("dashboard");
  const [drill, setDrill] = useState<ActivityDrill | null>(null);

  const view = useMemo(() => computeActivity(board, { qds, mems, clients, from, to }), [board, qds, mems, clients, from, to]);
  const options = useMemo(() => {
    const qd = [...new Set(board.groups.map((g) => g.qd ?? NO_QUEENDOM))].sort((a, b) => Number(a === NO_QUEENDOM) - Number(b === NO_QUEENDOM) || a.localeCompare(b));
    const mem = [...new Set(board.groups.map((g) => g.mem ?? NO_STATUS))].sort((a, b) => memRank(a) - memRank(b) || a.localeCompare(b));
    const people = new Map(board.groups.map((g) => [g.mid, g.name]));
    return {
      qd: qd.map((v) => ({ id: v, label: v })),
      mem: mem.map((v) => ({ id: v, label: v === NO_STATUS ? "No status" : `${v} members` })),
      client: [...people].sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => ({ id, label })),
    };
  }, [board]);

  // A filter change redraws everything; a list that was opened from the old numbers closes.
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDrill(null); };
  const setRange = (f: string | null, t: string | null) => {
    const d = resolveDateRangePreset(JOKER_DEFAULT_PERIOD);
    setFrom(f ?? t ?? d.from); setTo(t ?? f ?? d.to); setDrill(null);
  };
  const isDefaultPeriod = from === initial.from && to === initial.to;
  const activeCount = [qds, mems, clients].filter((x) => x.length).length + (isDefaultPeriod ? 0 : 1);

  const openClients: OpenClients = (label, gids, order) => { setDrill({ kind: "clients", label, gids, order }); setTab("list"); };
  const openMessages: OpenMessages = (label, q) => {
    setDrill({ kind: "messages", label, from: q.day ?? from, to: q.day ?? to, gids: q.gids ?? null, weekday: q.weekday ?? null, hour: q.hour ?? null });
    setTab("list");
  };

  const clientLabel = clients.length === 1 ? options.client.find((c) => c.id === clients[0])?.label ?? "Client" : "Client";

  return (
    <>
      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <FilterBar
          hideSearch
          searchValue=""
          onSearchChange={() => {}}
          activeCount={activeCount}
          onClearAll={() => { setQds([]); setMems([]); setClients([]); setRange(null, null); }}
          dateRange={{
            from, to,
            onFromChange: (v) => setRange(v, to),
            onToChange: (v) => setRange(from, v),
            onClear: () => setRange(null, null),
            onPresetSelect: (f, t) => setRange(f, t),
            presets: JOKER_PERIOD_PRESETS,
            panelKey: "jokers-activity-range",
            single: true,
          }}
          tabSlot={
            <TabSelector
              tabs={TABS}
              activeTab={tab}
              onChange={(id) => { if (id === "list") setDrill(null); setTab(id as "dashboard" | "list"); }}
              variant="accent"
              indicatorLayoutId="jokers-activity-tabs"
            />
          }
        >
          <FilterDropdown label="Queendom" items={options.qd} selected={qds} onChange={change(setQds)} multi menuPortal />
          <FilterDropdown label={clientLabel} items={options.client} selected={clients} onChange={change(setClients)} multi menuPortal searchable searchPlaceholder="Type a client's name" />
          <FilterDropdown label="Membership" items={options.mem} selected={mems} onChange={change(setMems)} multi menuPortal />
        </FilterBar>
      </div>

      <p style={{ margin: "0 0 var(--space-4)", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
        {from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`} · {formatCount(view.groups.length)} clients
        {from < board.days[0]?.[1] ? ` · counts start ${dayLabel(board.days[0][1])}` : ""}
      </p>

      {tab === "dashboard" ? (
        <ActivityBoardView view={view} openClients={openClients} openMessages={openMessages} />
      ) : drill?.kind === "messages" ? (
        <ActivityMessagesList key={JSON.stringify(drill)} drill={drill} groups={board.groups} onClear={() => setDrill(null)} />
      ) : (
        <ActivityClientsList
          view={view}
          drill={drill?.kind === "clients" ? drill : null}
          onClear={() => setDrill(null)}
          openMessages={openMessages}
        />
      )}
    </>
  );
}
