"use client";

// The Activity List: one row per group (one group = one client entry). Opened from a client mark on
// the dashboard (Active, Silent, a day, a queendom …) it shows exactly those clients; opened from the
// tab, every client in the filters. A row opens that client's messages; the arrow opens the group in Sia.

import { useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Table, type TableColumn } from "@/components/ui/Table";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DrillChip } from "@/components/jokers/JokerWidget";
import { siaGroupHref } from "@/lib/constants/sia-roles";
import { istClock, teamSpokeLast, type ActivityView, type GroupStat } from "@/lib/utils/client-activity";
import { formatCount } from "@/lib/utils/numbers";
import type { OpenMessages } from "@/components/jokers/activity/ActivityBoardView";

const lastHeard = (s: GroupStat) =>
  s.silentDays === null ? "No word on record"
    : s.silentDays === 0 ? `Today, ${s.g.lc ? istClock(s.g.lc) : ""}`
    : s.silentDays === 1 ? `Yesterday, ${s.g.lc ? istClock(s.g.lc) : ""}`
    : `${s.silentDays} days ago`;

export function ActivityClientsList({ view, drill, onClear, openMessages }: {
  view: ActivityView;
  drill: { label: string; gids: string[]; order?: "silent" } | null;
  onClear: () => void;
  openMessages: OpenMessages;
}) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const only = drill ? new Set(drill.gids) : null;
    const q = search.trim().toLowerCase();
    const list = view.groups.filter((s) => (!only || only.has(s.g.gid)) && (!q || s.g.name.toLowerCase().includes(q) || (s.g.subject ?? "").toLowerCase().includes(q)));
    const memRank = (s: GroupStat) => (s.mem === "Active" ? 0 : 1);
    return list.sort(drill?.order === "silent"
      ? (a, b) => memRank(a) - memRank(b) || (b.silentDays ?? -1) - (a.silentDays ?? -1)
      : (a, b) => b.msgs - a.msgs || b.reacts - a.reacts || (a.silentDays ?? 1e9) - (b.silentDays ?? 1e9));
  }, [view.groups, drill, search]);

  const columns: TableColumn<GroupStat>[] = [
    { id: "client", header: "Client", width: "28%", cell: (s) => (
      <span style={{ display: "block", minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: "var(--weight-medium)" }}>{s.g.name}</span>
        <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{s.g.subject ? `${s.g.subject} · ` : ""}{s.qd}</span>
      </span>
    ) },
    { id: "membership", header: "Membership", cell: (s) => <Badge tone={s.mem === "Active" ? "neutral" : "warning"} size="xs">{s.mem}</Badge> },
    { id: "status", header: "Status", cell: (s) => s.active
      ? <Badge tone="success" size="xs">Active</Badge>
      : <Badge tone="danger" size="xs">{s.silentDays === null ? "Silent · no word on record" : `Silent · ${s.silentDays} days`}</Badge> },
    { id: "messages", header: "Messages", align: "right", cell: (s) => <span style={MONO}>{formatCount(s.msgs)}</span> },
    { id: "reactions", header: "Reactions", align: "right", cell: (s) => <span style={MONO}>{formatCount(s.reacts)}</span> },
    { id: "heard", header: "Last heard", cell: (s) => <span style={{ whiteSpace: "nowrap" }}>{lastHeard(s)}</span> },
    { id: "word", header: "Last word", cell: (s) => (teamSpokeLast(s.g) ? "Our team" : "") },
    { id: "last14", header: "Last 14 days", cell: (s) => <MiniBars values={s.last14} /> },
    { id: "open", header: "", align: "right", width: 48, cell: (s) => (
      <Link href={siaGroupHref(s.g.gid)} onClick={(e) => e.stopPropagation()} aria-label={`Open ${s.g.name}'s group in Sia`} title="Open in Sia" style={{ color: "var(--theme-text-tertiary)", display: "inline-grid", placeItems: "center", width: 28, height: 28 }}>
        <ExternalLink style={{ width: 16, height: 16, strokeWidth: 1.5 }} aria-hidden="true" />
      </Link>
    ) },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search a client" aria-label="Search a client" style={{ flex: "0 1 20rem" }} />
        {drill && <DrillChip label={drill.label} onClear={onClear} />}
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{formatCount(rows.length)} {rows.length === 1 ? "client" : "clients"}</span>
      </div>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(s) => s.g.gid}
        onRowClick={(s) => openMessages(`${s.g.name}'s messages`, { gids: [s.g.gid] })}
        stickyHeader
        emptyState={<EmptyState variant="inline" title="No client matches" description="Try another name, or clear the filter above." />}
      />
    </div>
  );
}

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

/** Client messages per day over the last 14 days: one tiny bar a day, an empty day a flat stub. */
function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span aria-label={`${values.reduce((a, b) => a + b, 0)} messages in the last 14 days`} role="img" style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 20 }}>
      {values.map((v, i) => (
        <span key={i} style={{ width: 4, height: v ? Math.max(3, Math.round((v / max) * 18)) : 2, borderRadius: 1, background: v ? "var(--theme-accent)" : "var(--theme-paper-subtle)" }} />
      ))}
    </span>
  );
}
