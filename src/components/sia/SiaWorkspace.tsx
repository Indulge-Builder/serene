"use client";

// The Sia monitor surface (admin/founder only — the page gates). A READ-ONLY
// viewer: there is no compose box, by design — Serene never sends into these
// groups (the watcher is a silent ear, plan-whatsapp §6.1).
//
// Layout is the WhatsApp-Web anatomy in Serene material: a conversations rail
// (search + kind filters + preview rows) beside the open chat. Everything
// operational — watcher health and group mapping — lives behind the header
// gear (SiaControlModal), so both panes stay clean. Data crosses the server
// boundary via the actions in lib/actions/sia.ts (A-15).

import { SelectionButton } from '@/components/ui/SelectionButton';
import { ConversationRailRow } from '@/components/ui/ConversationRailRow';
import { SplitWorkspace, SplitRail, SplitRailHeader, SplitRailList, SplitPane } from '@/components/ui/SplitWorkspace';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare, Settings2 } from "lucide-react";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDebounce } from "@/hooks/useDebounce";
import { useMediaQuery, MQ } from "@/hooks/useMediaQuery";
import { formatRelativeTime } from "@/lib/utils/dates";
import { getSiaGroupsAction, getSiaHealthAction } from "@/lib/actions/sia";
import { SiaChat } from "./SiaChat";
import { SiaControlModal } from "./SiaControlModal";
import { formatSystemText, groupTitle, KIND_LABEL, TYPE_PREVIEW } from "./sia-shared";
import type { SiaGroupKind, SiaGroupRow, SiaHealth, SiaMessageRow } from "@/lib/services/sia-service";

// "nomember" is not a kind: it is the to-do list of the linking work, a MEMBER group that no
// member is linked to yet (so no queendom sees it, nothing profiles it, no ticket can come from it).
type KindFilter = "all" | SiaGroupKind | "nomember";
const FILTERS: KindFilter[] = ["all", "member", "vendor", "internal", "unmapped", "nomember"];
const needsMember = (g: SiaGroupRow) => g.group_kind === "member" && !g.member_id;

const RAIL_REFRESH_MS = 60_000;
const HEALTH_REFRESH_MS = 60_000;
const HEALTH_REFRESH_OPEN_MS = 20_000;

export function SiaWorkspace({ groups: initialGroups, initialGroupJid = null, canManage = true }: {
  groups: SiaGroupRow[];
  initialGroupJid?: string | null;
  /** False for a queendom viewer: no console gear, no health poll, no mapping controls. The server refuses those actions anyway. */
  canManage?: boolean;
}) {
  const [groups, setGroups] = useState<SiaGroupRow[]>(initialGroups);
  const [filter, setFilter] = useState<KindFilter>("all");
  const [railSearch, setRailSearch] = useState("");
  const [selectedJid, setSelectedJid] = useState<string | null>(initialGroupJid);
  const [health, setHealth] = useState<SiaHealth | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const isMobile = useMediaQuery(MQ.mobile);
  const debouncedRailSearch = useDebounce(railSearch, 200);

  const selected = groups.find((g) => g.group_jid === selectedJid) ?? null;

  // Arrived by deep link (/sia?group=…): the chat is already open; bring its rail row into view
  // too (the rail holds hundreds of groups). Once, on mount.
  useEffect(() => {
    if (!initialGroupJid) return;
    document.querySelector(`[data-sia-jid="${CSS.escape(initialGroupJid)}"]`)?.scrollIntoView({ block: "center" });
  }, [initialGroupJid]);

  // ── Patch one group locally (mapping saves, live previews) ──
  const patchGroup = useCallback((jid: string, patch: Partial<SiaGroupRow>) => {
    setGroups((prev) => prev.map((g) => (g.group_jid === jid ? { ...g, ...patch } : g)));
  }, []);

  // ── The open chat feeds the rail: preview + count + resort ──
  const handleLiveMessages = useCallback((jid: string, fresh: SiaMessageRow[], added: number) => {
    const last = fresh.at(-1);
    if (!last) return;
    setGroups((prev) => {
      const next = prev.map((g) =>
        g.group_jid === jid
          ? {
              ...g,
              message_count: g.message_count + added,
              last_message_at: last.wa_timestamp,
              last_text: last.text,
              last_type: last.type,
              last_sender_name: last.sender_name,
              last_from_me: last.from_me,
              last_is_revoked: last.is_revoked,
            }
          : g,
      );
      next.sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
      return next;
    });
  }, []);

  // ── Rail refresh (other groups keep moving too) ──
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const res = await getSiaGroupsAction();
      if (res.data) setGroups(res.data);
    }, RAIL_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // ── Health poll — feeds the gear's status dot; faster while the console is open ──
  const consoleOpenRef = useRef(consoleOpen);
  consoleOpenRef.current = consoleOpen;
  useEffect(() => {
    if (!canManage) return; // the console's pulse; a queendom viewer has no console
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        const res = await getSiaHealthAction();
        if (!cancelled && res.data) setHealth(res.data);
      }
      if (!cancelled) {
        timer = setTimeout(tick, consoleOpenRef.current ? HEALTH_REFRESH_OPEN_MS : HEALTH_REFRESH_MS);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canManage]);

  const visible = useMemo(() => {
    const q = debouncedRailSearch.trim().toLowerCase();
    return groups.filter((g) => {
      if (!g.is_active) return false; // hidden groups live in the console only
      const matchesFilter = filter === "all" || (filter === "nomember" ? needsMember(g) : g.group_kind === filter);
      const matchesSearch = !q || groupTitle(g).toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [groups, filter, debouncedRailSearch]);

  const counts = useMemo(() => {
    const c: Record<KindFilter, number> = { all: 0, member: 0, vendor: 0, internal: 0, unmapped: 0, nomember: 0 };
    for (const g of groups) {
      if (!g.is_active) continue;
      c.all++;
      c[g.group_kind]++;
      if (needsMember(g)) c.nomember++;
    }
    return c;
  }, [groups]);

  const showRail = !isMobile || !selected;
  const showChat = !isMobile || !!selected;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* ── Page header: title left, the console gear right ── */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Sia<span className="page-title-dot">.</span>
        </h1>
        {canManage && (
        <button
          type="button"
          onClick={() => setConsoleOpen(true)}
          aria-label="Open the Sia console"
          title={
            health === null
              ? "Sia console"
              : health.live
                ? "Sia console — watcher live"
                : health.watcherState === "pairing"
                  ? "Sia console — waiting to be paired"
                  : health.watcherState === "connecting"
                    ? "Sia console — connecting"
                    : "Sia console — watcher offline"
          }
          className="serene-pressable serene-icon-rotate-hover relative shrink-0 w-9 h-9 rounded-full border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1) flex items-center justify-center text-(--theme-text-secondary)"
          style={{ cursor: "pointer" }}
        >
          <Settings2 className="w-4 h-4" strokeWidth={1.5} />
          {health !== null && (
            <span
              aria-hidden
              className="absolute rounded-full"
              style={{
                top: "1px",
                right: "1px",
                width: "9px",
                height: "9px",
                background: health.live
                  ? "var(--color-success)"
                  : health.watcherState === "pairing" || health.watcherState === "connecting"
                    ? "var(--color-warning)"
                    : "var(--color-danger)",
                boxShadow: "0 0 0 2px var(--theme-paper)",
              }}
            />
          )}
        </button>
        )}
      </div>

      {groups.length === 0 ? (
        <SplitWorkspace>
          <SplitPane className="flex items-center justify-center">
            <EmptyState
              icon={MessagesSquare}
              title="No groups yet"
              description="Once the Sia watcher is linked and added to member groups, they'll appear here with their live message streams."
            />
          </SplitPane>
        </SplitWorkspace>
      ) : (
        <SplitWorkspace>
          {/* ── Conversations rail ── */}
          {showRail && (
            <SplitRail>
              <SplitRailHeader>
                <SearchBar
                  value={railSearch}
                  onChange={setRailSearch}
                  placeholder="Search groups"
                  size="sm"
                  aria-label="Search groups"
                />
                <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {FILTERS.filter((f) => canManage || f !== "nomember").map((f) => {
                    const active = filter === f;
                    const label = f === "all" ? "All" : f === "nomember" ? "No member" : KIND_LABEL[f];
                    return (
                      <SelectionButton
                        appearance="choice" selected={active} aria-pressed={active}
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className="serene-pressable type-caption rounded-full border-0 shrink-0"
                        style={{
                          padding: "3px 11px",
                        }}
                      >
                        {label}
                        {counts[f] > 0 && (
                          <span className="tabular-nums" style={{ opacity: 0.72, marginLeft: "4px", fontFamily: "var(--font-mono)" }}>
                            {counts[f]}
                          </span>
                        )}
                      </SelectionButton>
                    );
                  })}
                </div>
              </SplitRailHeader>

              <SplitRailList>
                {visible.length === 0 ? (
                  <div className="py-10 px-4">
                    <EmptyState variant="inline" title="No groups match" />
                  </div>
                ) : (
                  visible.map((g, i) => (
                    <RailRow
                      key={g.group_jid}
                      group={g}
                      index={i}
                      selected={selectedJid === g.group_jid}
                      onSelect={() => setSelectedJid(g.group_jid)}
                    />
                  ))
                )}
              </SplitRailList>
            </SplitRail>
          )}

          {/* ── Chat pane ── */}
          {showChat &&
            (selected ? (
              <SplitPane>
                <SiaChat
                  key={selected.group_jid}
                  group={selected}
                  isMobile={isMobile}
                  onBack={() => setSelectedJid(null)}
                  onLiveMessages={handleLiveMessages}
                  onPatchGroup={patchGroup}
                  canManage={canManage}
                />
              </SplitPane>
            ) : (
              <SplitPane className="hidden md:flex items-center justify-center">
                <EmptyState
                  icon={MessagesSquare}
                  title="Pick a conversation"
                  description="Every watched group lives on the left — member rooms, vendors, and the ones still waiting to be classified."
                />
              </SplitPane>
            ))}
        </SplitWorkspace>
      )}

      {canManage && <SiaControlModal
        open={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        health={health}
        groups={groups}
        onPatchGroup={patchGroup}
      />}
    </div>
  );
}

// ─────────────────────────────────────────────
// One rail row: the shared ConversationRailRow (avatar · subject + time · preview)
// ─────────────────────────────────────────────

function RailRow({
  group,
  index,
  selected,
  onSelect,
}: {
  group: SiaGroupRow;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ConversationRailRow
      data-sia-jid={group.group_jid}
      title={groupTitle(group)}
      meta={group.last_message_at ? formatRelativeTime(group.last_message_at) : null}
      metaMarker={
        group.group_kind === "unmapped" ? (
          <span
            aria-hidden
            title="Unmapped"
            style={{ width: "6px", height: "6px", borderRadius: "var(--radius-full)", background: "var(--color-warning)", display: "inline-block" }}
          />
        ) : undefined
      }
      preview={<RailPreview group={group} />}
      selected={selected}
      index={index}
      onSelect={onSelect}
    />
  );
}

// Inline content only: the row's preview line owns the truncation.
function RailPreview({ group }: { group: SiaGroupRow }) {
  const quiet = { fontStyle: "italic" } as const;
  if (!group.last_type) return <span style={quiet}>No messages captured yet</span>;

  const who = group.last_from_me ? "Watcher" : (group.last_sender_name?.split(" ")[0] ?? null);

  if (group.last_is_revoked) {
    return <span style={quiet}>{who ? `${who}: ` : ""}Message deleted</span>;
  }

  // System/undecrypted rows carry protocol stubs — always show the human copy.
  if (group.last_type === "system" || group.last_type === "undecrypted") {
    return (
      <span style={quiet}>
        {group.last_type === "undecrypted" ? "Waiting for a message" : formatSystemText(group.last_text)}
      </span>
    );
  }

  const media = TYPE_PREVIEW[group.last_type];
  const text = group.last_text?.trim();

  return (
    <>
      {who && <span style={{ color: "var(--theme-text-secondary)" }}>{who}: </span>}
      {media && (
        <media.icon
          aria-hidden
          className="w-3 h-3"
          strokeWidth={1.5}
          style={{ display: "inline", verticalAlign: "-2px", marginRight: "3px" }}
        />
      )}
      {text || media?.label || group.last_type}
    </>
  );
}
