"use client";

// The Recommendations & Engagement List (owner, 2026-09-28: "List", with a title search). Opened
// from a dashboard mark it shows exactly those items; from the tab, every item in the filters. Each
// answered item carries the Fix: anyone who can open the page can correct how the reply was read,
// and the same words follow the fix from then on (correctJokerReplyAction → correctReplyCore).

import { useMemo, useState, useTransition } from "react";
import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Table, type TableColumn } from "@/components/ui/Table";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { DrillChip } from "@/components/jokers/JokerWidget";
import { correctJokerReplyAction } from "@/lib/actions/jokers";
import { siaGroupHref } from "@/lib/constants/sia-roles";
import { toast } from "@/lib/toast";
import { dayLabel, istClock } from "@/lib/utils/client-activity";
import { answeredAfter, OUTCOME_LABELS, type JokerItem, type JokerOutcome } from "@/lib/utils/joker-board";
import { formatCount } from "@/lib/utils/numbers";

const PAGE = 100;
const TONE: Record<JokerOutcome, "success" | "warning" | "danger" | "info" | "neutral"> = {
  interested: "success", undecided: "warning", not_interested: "danger", replied: "info", not_replied: "neutral",
};
const TIER: Record<string, string> = { quote: "swipe-reply", reaction: "emoji", typed: "typed", thanks: "thanks" };
const FIX_REC = [
  { id: "interested", label: "Interested" }, { id: "undecided", label: "Undecided" }, { id: "not_interested", label: "Not interested" },
  { id: "not_a_reply", label: "Not a reply to this item" },
];
const FIX_ENG = [{ id: "replied", label: "Replied" }, { id: "interested", label: "Interested" }, { id: "not_a_reply", label: "Not a reply to this item" }];

export function REList({ items, drill, onClear, today, noun }: {
  items: JokerItem[];
  /** What the list counts ("Recommendations"), never "items" (owner, 2026-09-28). */
  noun: string;
  drill: { label: string; ids: string[] } | null;
  onClear: () => void;
  today: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [pending, startTransition] = useTransition();
  const rows = useMemo(() => {
    const only = drill ? new Set(drill.ids) : null;
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => (!only || only.has(i.id)) && (!q || i.title.toLowerCase().includes(q) || i.client.toLowerCase().includes(q)))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }, [items, drill, search]);

  const fix = (item: JokerItem, choice: string) => startTransition(async () => {
    if (!item.replyId) return;
    const res = await correctJokerReplyAction({ replyId: item.replyId, choice });
    if (res.error) { toast.danger(res.error); return; }
    toast.success("Fix saved. Serene reads these words this way from now on.");
    router.refresh();
  });

  const columns: TableColumn<JokerItem>[] = [
    { id: "sent", header: "Sent", width: 110, cell: (i) => (
      <span style={{ display: "block", whiteSpace: "nowrap" }}>
        <span style={{ display: "block", fontWeight: "var(--weight-medium)" }}>{i.day === today ? "Today" : dayLabel(i.day)}</span>
        <span style={SUB}>{istClock(i.sentAt)}</span>
      </span>
    ) },
    { id: "client", header: "Client", cell: (i) => (
      <span style={{ display: "block", minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: "var(--weight-medium)" }}>{i.client}</span>
        <span style={SUB}>{i.qd}</span>
      </span>
    ) },
    { id: "joker", header: "Joker", cell: (i) => <span style={{ whiteSpace: "nowrap" }}>{i.jokerName}</span> },
    { id: "title", header: "Title", width: "26%", cell: (i) => (
      <span style={{ display: "grid", gap: "var(--space-1)", justifyItems: "start" }}>
        <span style={{ fontWeight: "var(--weight-medium)" }}>{i.title}</span>
        <Badge tone="neutral" size="xs">{i.cat}</Badge>
      </span>
    ) },
    { id: "outcome", header: "Outcome", cell: (i) => <Badge tone={TONE[i.outcome]} size="xs">{OUTCOME_LABELS[i.outcome]}</Badge> },
    { id: "said", header: "What the client said", width: "24%", cell: (i) => i.outcome === "not_replied" ? <span style={SUB}>—</span> : (
      <span style={{ display: "block", minWidth: 0 }}>
        <span style={{ display: "block", overflowWrap: "anywhere" }}>{i.said ? `“${i.said}”` : "—"}</span>
        <span style={SUB}>{[answeredAfter(i.sentAt, i.replyAt), i.replyTier ? TIER[i.replyTier] : ""].filter(Boolean).join(" · ")}</span>
      </span>
    ) },
    { id: "fix", header: "", width: 120, cell: (i) => i.replyId && i.outcome !== "not_replied" ? (
      <span onClick={(e) => e.stopPropagation()}>
        <FilterDropdown label="Fix" items={i.tag === "engagement" ? FIX_ENG : FIX_REC} selected={[]} onChange={(v) => v[0] && fix(i, v[0])} clearable={false} menuPortal disabled={pending} />
      </span>
    ) : null },
    { id: "open", header: "", align: "right", width: 48, cell: (i) => (
      <Link href={siaGroupHref(i.gid)} aria-label={`Open ${i.client}'s group in Sia`} title="Open in Sia" style={{ color: "var(--theme-text-tertiary)", display: "inline-grid", placeItems: "center", width: 28, height: 28 }}>
        <ExternalLink style={{ width: 16, height: 16, strokeWidth: 1.5 }} aria-hidden="true" />
      </Link>
    ) },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setShown(PAGE); }} placeholder="Search a title or a client" aria-label="Search a title or a client" style={{ flex: "0 1 20rem" }} />
        {drill && <DrillChip label={drill.label} onClear={onClear} />}
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{formatCount(rows.length)} {noun.toLowerCase()}</span>
      </div>
      <Table
        columns={columns}
        rows={rows.slice(0, shown)}
        rowKey={(i) => i.id}
        stickyHeader
        emptyState={<EmptyState variant="inline" title="Nothing matches this search" description="Try another title or client, or clear the filter above." />}
      />
      {rows.length > shown && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show more</Button>
        </div>
      )}
    </div>
  );
}

const SUB: React.CSSProperties = { display: "block", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" };
