"use client";

// The Recommendations & Engagement dashboard's client shell (owner, 2026-09-28): the filter bar (Type
// as a dropdown with both allowed, Category, Joker, Queendom, a searchable Client, Outcome, Period), the
// Dashboard | List switch, the "split by" of the per-day chart, and what a click opened. The board
// arrives once from the page (the last 90 days); every number is worked out here by computeBoard.

import { useMemo, useState } from "react";
import { FilterBar } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { TabSelector } from "@/components/ui/TabSelector";
import { resolveDateRangePreset } from "@/lib/constants/date-range-presets";
import { JOKER_CATEGORY_LABELS, JOKER_DEFAULT_PERIOD, JOKER_PERIOD_PRESETS, type JokerTag } from "@/lib/constants/joker-engagement";
import { dayLabel } from "@/lib/utils/client-activity";
import { computeBoard, OUTCOME_LABELS, outcomesFor, parseJokerBoard, type JokerBoardRaw, type JokerOutcome, type SplitBy } from "@/lib/utils/joker-board";
import { REBoardView, type OpenItems } from "@/components/jokers/re/REBoardView";
import { REList } from "@/components/jokers/re/REList";

const TABS = [{ id: "dashboard", label: "Dashboard" }, { id: "list", label: "List" }];
const TYPES = [{ id: "recommendation", label: "Recommendations" }, { id: "engagement", label: "Engagements" }];
const nounFor = (tags: JokerTag[]) => (tags.length === 2 ? "Recommendations & engagements" : tags[0] === "engagement" ? "Engagements" : "Recommendations");

export function REShell({ board }: { board: JokerBoardRaw }) {
  const { today, items, jokers: jokerList } = useMemo(() => parseJokerBoard(board), [board]);
  const initial = resolveDateRangePreset(JOKER_DEFAULT_PERIOD);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [tags, setTags] = useState<JokerTag[]>(["recommendation"]);
  const [cats, setCats] = useState<string[]>([]);
  const [jokers, setJokers] = useState<string[]>([]);
  const [qds, setQds] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [picked, setPicked] = useState<JokerOutcome[]>([]);
  // The outcomes the chosen type can have; a pick the type cannot have is dropped, not kept hidden.
  const outcomeItems = useMemo(() => outcomesFor(tags).map((o) => ({ id: o, label: OUTCOME_LABELS[o] })), [tags]);
  const outcomes = useMemo(() => picked.filter((o) => outcomeItems.some((x) => x.id === o)), [picked, outcomeItems]);
  const [split, setSplit] = useState<SplitBy>("title");
  const [tab, setTab] = useState<"dashboard" | "list">("dashboard");
  const [drill, setDrill] = useState<{ label: string; ids: string[] } | null>(null);

  const view = useMemo(() => computeBoard(items, today, { tags, cats, jokers, qds, clients, outcomes, from, to }, split), [items, today, tags, cats, jokers, qds, clients, outcomes, from, to, split]);
  const noun = nounFor(tags);
  const options = useMemo(() => {
    const known = Object.values(JOKER_CATEGORY_LABELS) as string[];
    const seen = [...new Set(items.filter((i) => i.tag === "recommendation").map((i) => i.cat))];
    const cat = [...known, ...seen.filter((c) => !known.includes(c)).sort()];
    const people = new Map(items.map((i) => [i.mid, i.client]));
    return {
      cat: cat.map((c) => ({ id: c, label: c })),
      joker: jokerList.map((j) => ({ id: j.id, label: j.name })),
      qd: [...new Set(items.map((i) => i.qd))].sort().map((q) => ({ id: q, label: q })),
      client: [...people].sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => ({ id, label })),
    };
  }, [items, jokerList]);

  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDrill(null); };
  const setRange = (f: string | null, t: string | null) => { setFrom(f ?? t ?? initial.from); setTo(t ?? f ?? initial.to); setDrill(null); };
  const isDefaultPeriod = from === initial.from && to === initial.to;
  const activeCount = [cats, jokers, qds, clients, outcomes].filter((x) => x.length).length + (isDefaultPeriod ? 0 : 1) + (tags.length === 1 && tags[0] === "recommendation" ? 0 : 1);
  const openItems: OpenItems = (label, ids) => { setDrill({ label, ids }); setTab("list"); };
  const clientLabel = clients.length === 1 ? options.client.find((c) => c.id === clients[0])?.label ?? "Client" : "Client";

  return (
    <>
      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <FilterBar
          hideSearch
          searchValue=""
          onSearchChange={() => {}}
          activeCount={activeCount}
          onClearAll={() => { setTags(["recommendation"]); setCats([]); setJokers([]); setQds([]); setClients([]); setPicked([]); setRange(null, null); }}
          dateRange={{
            from, to,
            onFromChange: (v) => setRange(v, to),
            onToChange: (v) => setRange(from, v),
            onClear: () => setRange(null, null),
            onPresetSelect: (f, t) => setRange(f, t),
            presets: JOKER_PERIOD_PRESETS,
            panelKey: "jokers-re-range",
            single: true,
          }}
          tabSlot={
            <TabSelector
              tabs={TABS}
              activeTab={tab}
              onChange={(id) => { if (id === "list") setDrill(null); setTab(id as "dashboard" | "list"); }}
              variant="accent"
              indicatorLayoutId="jokers-re-tabs"
            />
          }
        >
          <FilterDropdown label={noun} items={TYPES} selected={tags} multi clearable={false} hideCountBadge menuPortal
            onChange={(v) => { if (v.length) change(setTags)(v as JokerTag[]); }} />
          <FilterDropdown label="Category" items={options.cat} selected={cats} onChange={change(setCats)} multi menuPortal disabled={!tags.includes("recommendation")} />
          <FilterDropdown label="Joker" items={options.joker} selected={jokers} onChange={change(setJokers)} multi menuPortal />
          <FilterDropdown label="Queendom" items={options.qd} selected={qds} onChange={change(setQds)} multi menuPortal />
          <FilterDropdown label={clientLabel} items={options.client} selected={clients} onChange={change(setClients)} multi menuPortal searchable searchPlaceholder="Type a client's name" />
          <FilterDropdown label="Outcome" items={outcomeItems} selected={outcomes} onChange={(v) => change(setPicked)(v as JokerOutcome[])} multi menuPortal />
        </FilterBar>
      </div>

      <p style={{ margin: "0 0 var(--space-4)", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
        {from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`} · {jokers.length ? `${jokers.length} of ${options.joker.length} jokers` : "every joker"} · {qds.length ? qds.join(", ") : "every queendom"}
      </p>

      {tab === "dashboard"
        ? <REBoardView view={view} noun={noun} today={today} split={split} setSplit={setSplit} openItems={openItems} />
        : <REList items={drill ? items : view.rows} drill={drill} onClear={() => setDrill(null)} today={today} noun={noun} />}
    </>
  );
}
