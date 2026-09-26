"use client";

// The Sia console — everything operational, tucked behind the header gear so the
// two chat panes stay pure: watcher health (is the ear alive) + the group
// mapping manager (classify member/vendor/internal, hide noise). Composes the
// core Modal + StatTile + SearchBar + Avatar + Toggle primitives (R-01 — the
// earlier bespoke HealthStat/TabButton/avatar-tint expressions are deleted).

import { useEffect, useMemo, useState } from "react";
import { Circle, QrCode, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { StatTile } from "@/components/ui/StatTile";
import { SearchBar } from "@/components/ui/SearchBar";
import { Avatar } from "@/components/ui/Avatar";
import { Toggle } from "@/components/ui/Toggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { SeedMandala } from "@/components/ui/SeedMandala";
import { formatRelativeTime } from "@/lib/utils/dates";
import { useToast } from "@/hooks/useToast";
import {
  getSiaPairingStatusAction,
  requestSiaRepairAction,
  requestSiaRestartAction,
  updateSiaGroupMappingAction,
  type SiaPairingStatus,
} from "@/lib/actions/sia";
import { groupTitle, KindPillRow } from "./sia-shared";
import type { SiaGroupKind, SiaGroupRow, SiaHealth } from "@/lib/services/sia-service";

const PAIRING_POLL_MS = 5000;

export function SiaControlModal({
  open,
  onClose,
  health,
  groups,
  onPatchGroup,
}: {
  open: boolean;
  onClose: () => void;
  health: SiaHealth | null;
  groups: SiaGroupRow[];
  onPatchGroup: (jid: string, patch: Partial<SiaGroupRow>) => void;
}) {
  const toast = useToast;
  const [search, setSearch] = useState("");
  const [savingJid, setSavingJid] = useState<string | null>(null);

  // ── Session panel (migration 0177): 5s poll while the console is open, so a
  //    lost session shows its pairing QR right here — re-pair from the browser,
  //    no codebase or AWS access needed. ──
  const [pairing, setPairing] = useState<SiaPairingStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"restart" | "repair" | null>(null);
  const [confirmRepair, setConfirmRepair] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const tick = async () => {
      const res = await getSiaPairingStatusAction();
      if (alive && res.data) setPairing(res.data);
    };
    void tick();
    const t = setInterval(tick, PAIRING_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open]);

  // QR payload → image (qrcode loaded on demand — never in the route chunk).
  useEffect(() => {
    const qr = pairing?.qr;
    if (!qr) {
      setQrDataUrl(null);
      return;
    }
    let alive = true;
    import("qrcode")
      .then((QR) => QR.toDataURL(qr, { margin: 1, width: 232 }))
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pairing?.qr]);

  const doRestart = async () => {
    setBusy("restart");
    const res = await requestSiaRestartAction();
    setBusy(null);
    if (res.data) toast.success("Restart requested — the watcher reboots within a minute");
    else toast.danger(res.error ?? "Couldn't request the restart");
  };

  const doRepair = async () => {
    setBusy("repair");
    const res = await requestSiaRepairAction();
    setBusy(null);
    setConfirmRepair(false);
    if (res.data) toast.success("Session reset — the QR appears below within a minute");
    else toast.danger(res.error ?? "Couldn't reset the session");
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? groups.filter((g) => groupTitle(g).toLowerCase().includes(q)) : groups;
    // Unmapped first (they need attention), then by activity — the working order.
    return [...list].sort((a, b) => {
      const aU = a.group_kind === "unmapped" ? 0 : 1;
      const bU = b.group_kind === "unmapped" ? 0 : 1;
      if (aU !== bU) return aU - bU;
      return (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "");
    });
  }, [groups, search]);

  const setKind = async (jid: string, kind: SiaGroupKind) => {
    setSavingJid(jid);
    const res = await updateSiaGroupMappingAction(jid, { group_kind: kind });
    if (res.data) onPatchGroup(jid, { group_kind: kind });
    setSavingJid(null);
  };

  const setVisible = async (jid: string, isActive: boolean) => {
    setSavingJid(jid);
    const res = await updateSiaGroupMappingAction(jid, { is_active: isActive });
    if (res.data) onPatchGroup(jid, { is_active: isActive });
    setSavingJid(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Sia console" size="lg" bodyPadding={false}>
      <div className="flex flex-col min-h-0" style={{ maxHeight: "min(72dvh, 720px)" }}>
        <div className="overflow-y-auto min-h-0 px-5 py-4 sm:px-6">
          {/* ── Watcher health ── */}
          {!health ? (
            <div className="flex items-center justify-center py-10">
              <LogoSpinner size="md" />
            </div>
          ) : (
            <>
              {(() => {
                // Banner tone + copy from the watcher's self-reported state
                // (heartbeat, migration 0175) — never from group traffic.
                const tone =
                  health.live ? "success" : health.watcherState === "pairing" || health.watcherState === "connecting" ? "warning" : "danger";
                const title =
                  health.watcherState === "connected"
                    ? "Watcher is live"
                    : health.watcherState === "pairing"
                      ? "Waiting to be paired"
                      : health.watcherState === "connecting"
                        ? "Connecting to WhatsApp…"
                        : health.watcherState === "logged_out"
                          ? "Session lost — re-pairing needed"
                          : "Watcher is offline";
                const caption = [
                  health.beatAt ? `heartbeat ${formatRelativeTime(health.beatAt)}` : "no heartbeat yet",
                  health.lastEventAt ? `last event ${formatRelativeTime(health.lastEventAt)}` : "no events recorded yet",
                ].join(" · ");
                return (
                  <div
                    className="rounded-(--radius-md) border px-4 py-3 mb-4 flex items-center gap-3"
                    style={{
                      background: `var(--color-${tone}-light)`,
                      borderColor: `var(--color-${tone})`,
                    }}
                  >
                    <Circle
                      className="w-2.5 h-2.5 shrink-0"
                      fill="currentColor"
                      style={{ color: `var(--color-${tone})` }}
                    />
                    <div className="min-w-0">
                      <div className="type-body-sm font-(--weight-medium)" style={{ color: `var(--color-${tone}-text)` }}>
                        {title}
                      </div>
                      <div className="type-caption" style={{ color: `var(--color-${tone}-text)`, opacity: 0.85 }}>
                        {caption}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                <StatTile label="Events / hour" value={health.eventsLastHour.toLocaleString("en-IN")} />
                <StatTile label="Messages / hour" value={health.messagesLastHour.toLocaleString("en-IN")} />
                <StatTile label="Total messages" value={health.totalMessages.toLocaleString("en-IN")} />
                <StatTile label="Groups watched" value={health.totalGroups.toLocaleString("en-IN")} />
                <StatTile
                  label="Unmapped"
                  value={health.unmappedGroups.toLocaleString("en-IN")}
                  sub={
                    health.unmappedGroups > 0
                      ? { text: "need classifying", color: "var(--color-warning-text)" }
                      : undefined
                  }
                />
                <StatTile label="Hidden" value={health.hiddenGroups.toLocaleString("en-IN")} />
              </div>

              <div className="label-micro mb-2" style={{ color: "var(--theme-text-tertiary)" }}>
                Media pipeline
              </div>
              <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                <StatTile label="Downloaded" value={health.media.done.toLocaleString("en-IN")} />
                <StatTile
                  label="Pending"
                  value={health.media.pending.toLocaleString("en-IN")}
                  sub={
                    health.media.pending > 0
                      ? { text: "backfill draining", color: "var(--theme-text-tertiary)" }
                      : undefined
                  }
                />
                <StatTile label="Retrying" value={health.media.retrying.toLocaleString("en-IN")} />
                <StatTile label="Expired" value={health.media.expired.toLocaleString("en-IN")} />
                <StatTile
                  label="Lost"
                  value={health.media.dead_letter.toLocaleString("en-IN")}
                  sub={
                    health.media.dead_letter > 0
                      ? { text: "dead-letter", color: "var(--color-danger-text)" }
                      : undefined
                  }
                />
              </div>
            </>
          )}

          {/* ── Session (migration 0177) — pairing QR + recovery controls ── */}
          <div className="label-micro mb-2" style={{ color: "var(--theme-text-tertiary)" }}>
            Session
          </div>
          <div
            className="rounded-(--radius-md) border border-(--theme-paper-border) px-4 py-3 mb-5"
            style={{ background: "var(--theme-paper-subtle)" }}
          >
            {pairing?.state === "pairing" ? (
              <div className="flex flex-col items-center gap-3 py-2">
                {qrDataUrl ? (
                  <>
                    {/* The pairing QR — white tile so any phone camera reads it in dark mode too */}
                    <div className="rounded-(--radius-md) p-3" style={{ background: "#ffffff", boxShadow: "var(--shadow-2)" }}>
                      {/* data: URL image — next/image has no place here */}
                      <img src={qrDataUrl} alt="WhatsApp pairing QR" width={232} height={232} style={{ display: "block" }} />
                    </div>
                    <div className="type-body-sm text-center" style={{ color: "var(--theme-text-primary)", maxWidth: "34ch" }}>
                      On the watcher phone: <b>WhatsApp → Linked Devices → Link a device</b>, then scan this code.
                    </div>
                    <div className="type-caption text-center" style={{ color: "var(--theme-text-tertiary)" }}>
                      The code refreshes automatically. After scanning, history re-syncs on its own.
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 py-4" style={{ color: "var(--theme-text-secondary)" }}>
                    <SeedMandala size={16} variant="currentColor" spin={3.5} />
                    <span className="type-body-sm">Waiting for the watcher to prepare a pairing code…</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="type-body-sm" style={{ color: "var(--theme-text-primary)", fontWeight: "var(--weight-medium)" }}>
                    {pairing?.restartPending
                      ? "Restarting — back within a minute…"
                      : pairing?.state === "connected"
                        ? "Session healthy"
                        : pairing?.state === "connecting"
                          ? "Connecting to WhatsApp…"
                          : pairing?.state === "logged_out"
                            ? "Session lost — reset it to show a pairing code"
                            : "Watcher offline — controls apply when it returns"}
                  </div>
                  <div className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>
                    Restart keeps the session. Re-pair signs WhatsApp out and shows a QR here to scan.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="xs"
                    iconLeft={RefreshCw}
                    loading={busy === "restart"}
                    loadingLabel="Requesting…"
                    disabled={busy !== null || pairing?.restartPending}
                    onClick={doRestart}
                  >
                    Restart watcher
                  </Button>
                  <Button
                    variant="danger"
                    size="xs"
                    iconLeft={QrCode}
                    disabled={busy !== null || pairing?.restartPending}
                    onClick={() => setConfirmRepair(true)}
                  >
                    Re-pair session
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Group mapping ── */}
          <div className="label-micro mb-2" style={{ color: "var(--theme-text-tertiary)" }}>
            Group mapping
          </div>
          <div
            className="sticky top-0 pb-2"
            style={{ background: "var(--theme-paper)", zIndex: 1 }}
          >
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Find a group"
              size="sm"
              aria-label="Find a group to map"
            />
          </div>

          {visible.length === 0 ? (
            <div className="py-8">
              <EmptyState variant="inline" title={`Nothing matches "${search.trim()}"`} />
            </div>
          ) : (
            <div className="flex flex-col">
              {visible.map((g) => {
                const saving = savingJid === g.group_jid;
                return (
                  <div
                    key={g.group_jid}
                    // flex-wrap + the cluster's basis-full: below md the four
                    // pills, avatar and toggle exceeded the sheet and the title
                    // collapsed (mobile audit 2026-09-26); md+ is one row.
                    className="flex flex-wrap items-center gap-3 py-2.5 border-b border-(--theme-paper-border)"
                    style={{ opacity: g.is_active ? 1 : 0.55 }}
                  >
                    <Avatar name={groupTitle(g)} size="sm" />
                    <div className="min-w-0 flex-1 basis-40">
                      <div className="type-body-sm font-(--weight-medium) text-(--theme-text-primary) truncate">
                        {groupTitle(g)}
                      </div>
                      <div className="type-caption text-(--theme-text-tertiary)">
                        {g.member_count ?? "—"} members · {g.message_count.toLocaleString("en-IN")} messages
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 max-md:basis-full max-md:pl-11">
                      <div className="shrink-0">
                        <KindPillRow value={g.group_kind} disabled={saving} onPick={(k) => setKind(g.group_jid, k)} />
                      </div>

                      <div className="shrink-0 pl-1 max-md:ml-auto">
                        <Tooltip label={g.is_active ? "Visible in the rail" : "Hidden from the rail"} side="top" wrap="block">
                          <Toggle
                            checked={g.is_active}
                            onChange={(next) => setVisible(g.group_jid, next)}
                            size="sm"
                            disabled={saving}
                          />
                        </Tooltip>
                        <span className="sr-only">{g.is_active ? "Visible in the rail" : "Hidden from the rail"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmRepair}
        title="Re-pair the WhatsApp session?"
        body={
          <span>
            This signs the watcher out of WhatsApp and shows a fresh pairing QR here within a
            minute. Capture pauses until someone scans it with the watcher phone. All captured
            data stays — history re-syncs after pairing.
          </span>
        }
        confirmLabel="Sign out & show QR"
        pendingLabel="Resetting…"
        danger
        pending={busy === "repair"}
        onConfirm={doRepair}
        onCancel={() => setConfirmRepair(false)}
      />
    </Modal>
  );
}
