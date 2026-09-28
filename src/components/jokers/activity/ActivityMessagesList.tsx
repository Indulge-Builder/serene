"use client";

// The client's side's own messages behind a message mark (the Client messages tile, a point on the
// messages line, a Busiest-day bar, a heatmap square, a client's row). Read on demand through
// getActivityMessagesAction, newest first, fifty at a time; a row opens that message in Sia.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Table, type TableColumn } from "@/components/ui/Table";
import { SearchBar } from "@/components/ui/SearchBar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DrillChip } from "@/components/jokers/JokerWidget";
import { useDebounce } from "@/hooks/useDebounce";
import { getActivityMessagesAction } from "@/lib/actions/jokers";
import { siaMessageHref } from "@/lib/constants/sia-roles";
import { dayLabel, istClock, istDay, type ActivityGroup, type ActivityMessage } from "@/lib/utils/client-activity";
import { formatCount } from "@/lib/utils/numbers";
import type { ActivityDrill } from "@/components/jokers/activity/ActivityShell";

const TYPE_LABEL: Record<string, string> = {
  image: "Photo", video: "Video", voice: "Voice note", audio: "Audio", document: "Document", sticker: "Sticker",
  location: "Location", contact: "Contact card", poll: "Poll", undecrypted: "Could not be read", payment: "Payment", product: "Product",
};

export function ActivityMessagesList({ drill, groups, onClear }: {
  drill: Extract<ActivityDrill, { kind: "messages" }>;
  groups: ActivityGroup[];
  onClear: () => void;
}) {
  const byGid = useMemo(() => new Map(groups.map((g) => [g.gid, g])), [groups]);
  const [search, setSearch] = useState("");
  const q = useDebounce(search, 300);
  const [rows, setRows] = useState<ActivityMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(offset: number) {
    setLoading(true);
    const res = await getActivityMessagesAction({
      from: drill.from, to: drill.to, groupJids: drill.gids, weekday: drill.weekday, hour: drill.hour,
      search: q.trim() || null, offset,
    });
    setLoading(false);
    if (res.error || !res.data) { setError(res.error); return; }
    setError(null);
    setTotal(res.data.total);
    setRows((prev) => (offset === 0 ? res.data!.rows : [...prev, ...res.data!.rows]));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(0); }, [q]);

  const today = istDay(new Date());
  const columns: TableColumn<ActivityMessage>[] = [
    { id: "when", header: "When", width: 120, cell: (m) => {
      const d = istDay(m.sentAt);
      return (
        <span style={{ display: "block", whiteSpace: "nowrap" }}>
          <span style={{ display: "block", fontWeight: "var(--weight-medium)" }}>{d === today ? "Today" : dayLabel(d)}</span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{istClock(m.sentAt)}</span>
        </span>
      );
    } },
    { id: "client", header: "Client", cell: (m) => {
      const g = byGid.get(m.groupJid);
      return (
        <span style={{ display: "block", minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: "var(--weight-medium)" }}>{g?.name ?? "Client"}</span>
          <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{g?.subject ?? ""}</span>
        </span>
      );
    } },
    { id: "from", header: "From", cell: (m) => m.senderName ?? byGid.get(m.groupJid)?.name ?? "" },
    { id: "message", header: "Message", cell: (m) => m.body
      ? <span style={{ display: "block", maxWidth: "36rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</span>
      : <span style={{ fontStyle: "italic", color: "var(--theme-text-tertiary)" }}>{TYPE_LABEL[m.type] ?? "Message"}</span> },
    { id: "open", header: "", align: "right", width: 48, cell: (m) => (
      <Link href={siaMessageHref(m.groupJid, m.waMessageId)} aria-label="Open this message in Sia" title="Open in Sia" style={{ color: "var(--theme-text-tertiary)", display: "inline-grid", placeItems: "center", width: 28, height: 28 }}>
        <ExternalLink style={{ width: 16, height: 16, strokeWidth: 1.5 }} aria-hidden="true" />
      </Link>
    ) },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search the messages" aria-label="Search the messages" style={{ flex: "0 1 20rem" }} />
        <DrillChip label={drill.label} onClear={onClear} />
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{formatCount(total)} {total === 1 ? "message" : "messages"}</span>
      </div>
      {error ? (
        <EmptyState framed title="These messages could not be loaded" description={error} action={<Button variant="secondary" size="sm" onClick={() => void load(0)}>Try again</Button>} />
      ) : (
        <Table
          columns={columns}
          rows={rows}
          rowKey={(m) => `${m.groupJid}:${m.waMessageId}:${m.sentAt}`}
          loading={loading && rows.length === 0}
          stickyHeader
          emptyState={<EmptyState variant="inline" title="No client message here" description="Try another word, or clear the filter above." />}
        />
      )}
      {rows.length < total && !error && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="secondary" size="sm" loading={loading} onClick={() => void load(rows.length)}>Show more</Button>
        </div>
      )}
    </div>
  );
}
