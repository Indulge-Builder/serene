"use client";

// The watcher-number half of the Sia console's Session panel (migration 0249,
// docs/architecture/sia-resilience-plan.md): which number is the ear, the standby
// number and whether it really sits in every member group, "Change watcher number"
// (the live session goes to the shelf, a QR appears above), and the shelved sessions
// with Restore. Display + two confirms; every write is a server action.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input } from "@/components/ui/Field";
import { MetaLine } from "@/components/ui/MetaLine";
import { formatDate } from "@/lib/utils/dates";
import { useToast } from "@/hooks/useToast";
import { siaGroupHref } from "@/lib/constants/sia-roles";
import { SIA_SHELF_REASON_LABELS } from "@/lib/constants/sia-watcher";
import {
  changeSiaWatcherNumberAction,
  getSiaWatcherNumberPanelAction,
  restoreSiaSessionAction,
  setSiaStandbyNumberAction,
  type SiaWatcherNumberPanel,
} from "@/lib/actions/sia";

const NAMED_GROUPS = 6;

export function SiaWatcherNumberCard({ open, locked }: { open: boolean; locked: boolean }) {
  const toast = useToast;
  const [panel, setPanel] = useState<SiaWatcherNumberPanel | null>(null);
  const [standby, setStandby] = useState("");
  const [standbyError, setStandbyError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"standby" | "change" | "restore" | null>(null);
  const [confirmChange, setConfirmChange] = useState(false);
  const [restoreAt, setRestoreAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getSiaWatcherNumberPanelAction();
    if (res.data) {
      setPanel(res.data);
      setStandby(res.data.standbyPhone ?? "");
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const saveStandby = async () => {
    setBusy("standby");
    setStandbyError(null);
    const res = await setSiaStandbyNumberAction(standby);
    setBusy(null);
    // The typed number stays in the field on an error.
    if (res.error) return setStandbyError(res.error);
    toast.success(res.data?.standbyPhone ? "Standby number saved" : "Standby number cleared");
    void load();
  };

  const doChange = async () => {
    setBusy("change");
    const res = await changeSiaWatcherNumberAction();
    setBusy(null);
    setConfirmChange(false);
    if (res.data) {
      toast.success("Session put aside. The QR appears above within a minute");
      void load();
    } else toast.danger(res.error ?? "Couldn't change the number");
  };

  const doRestore = async () => {
    if (!restoreAt) return;
    setBusy("restore");
    const res = await restoreSiaSessionAction(restoreAt);
    setBusy(null);
    setRestoreAt(null);
    if (res.data) {
      toast.success("Session restored. The watcher reconnects within a minute");
      void load();
    } else toast.danger(res.error ?? "Couldn't restore that session");
  };

  const cov = panel?.coverage ?? null;
  const covered = cov ? cov.memberGroups - cov.missingStandby.length : 0;
  const restoring = panel?.shelf.find((s) => s.shelvedAt === restoreAt) ?? null;

  return (
    <>
      <div className="label-micro mb-2" style={{ color: "var(--theme-text-tertiary)" }}>
        Watcher number
      </div>
      <div
        className="rounded-(--radius-md) border border-(--theme-paper-border) px-4 py-3 mb-5 flex flex-col gap-4"
        style={{ background: "var(--theme-paper-subtle)" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="type-body-sm" style={{ color: "var(--theme-text-primary)", fontWeight: "var(--weight-medium)" }}>
              {panel?.watcherPhone ?? "No number paired yet"}
            </div>
            <div className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>
              Changing the number keeps this session aside. Nothing captured is touched.
            </div>
          </div>
          <Button
            variant="secondary"
            size="xs"
            iconLeft={ArrowLeftRight}
            disabled={busy !== null || locked}
            onClick={() => setConfirmChange(true)}
          >
            Change watcher number
          </Button>
        </div>

        <div className="serene-form-row" style={{ alignItems: "end" }}>
          <Field
            label="Standby number"
            htmlFor="sia-standby"
            hint="A plain WhatsApp phone in every member group, linked to nothing."
            error={standbyError ?? undefined}
          >
            <Input
              id="sia-standby"
              inputMode="tel"
              value={standby}
              onChange={(e) => setStandby(e.target.value)}
              placeholder="+91 98XXX XXXXX"
            />
          </Field>
          <div>
            <Button
              variant="secondary"
              size="sm"
              loading={busy === "standby"}
              loadingLabel="Saving…"
              disabled={busy !== null || standby.trim() === (panel?.standbyPhone ?? "")}
              onClick={saveStandby}
            >
              Save
            </Button>
          </div>
        </div>

        {cov && (
          <div className="flex flex-col gap-1">
            <MetaLine
              tone={cov.missingStandby.length === 0 ? "live" : "warning"}
              items={[
                `Standby is in ${covered} of ${cov.memberGroups} member groups`,
                cov.missingWatcher.length > 0 && `watcher missing from ${cov.missingWatcher.length}`,
              ]}
            />
            {cov.missingStandby.length > 0 && (
              <div className="type-caption" style={{ color: "var(--theme-text-secondary)" }}>
                Not in:{" "}
                {cov.missingStandby.slice(0, NAMED_GROUPS).map((g, i) => (
                  <span key={g.groupJid}>
                    {i > 0 && ", "}
                    <Link href={siaGroupHref(g.groupJid)} style={{ color: "var(--theme-text-primary)" }}>
                      {g.subject?.trim() || "an unnamed group"}
                    </Link>
                  </span>
                ))}
                {cov.missingStandby.length > NAMED_GROUPS && ` and ${cov.missingStandby.length - NAMED_GROUPS} more`}
              </div>
            )}
          </div>
        )}

        {panel && panel.shelf.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>
              Sessions kept aside
            </div>
            {panel.shelf.map((s) => (
              <div key={s.shelvedAt} className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="type-body-sm" style={{ color: "var(--theme-text-primary)" }}>
                    {s.phone ?? "Unknown number"}
                  </div>
                  <div className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>
                    {SIA_SHELF_REASON_LABELS[s.reason] ?? s.reason} · {formatDate(s.shelvedAt, "d MMM yyyy, h:mm a")}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  iconLeft={RotateCcw}
                  disabled={busy !== null || locked}
                  onClick={() => setRestoreAt(s.shelvedAt)}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmChange}
        title="Change the watcher number?"
        body={
          <span>
            The current session{panel?.watcherPhone ? ` (${panel.watcherPhone})` : ""} is kept aside, not deleted, and
            a pairing QR appears here within a minute. Scan it with the new number&apos;s phone. Capture pauses until
            then. Every message already captured stays.
          </span>
        }
        confirmLabel="Keep aside & show QR"
        pendingLabel="Working…"
        danger
        pending={busy === "change"}
        onConfirm={doChange}
        onCancel={() => setConfirmChange(false)}
      />

      <ConfirmDialog
        open={restoreAt !== null}
        title="Restore this session?"
        body={
          <span>
            The watcher goes back to {restoring?.phone ?? "the earlier number"}. The session in use now is kept aside
            first. If WhatsApp no longer accepts the restored session, the watcher will say so and you can switch back.
          </span>
        }
        confirmLabel="Restore session"
        pendingLabel="Restoring…"
        pending={busy === "restore"}
        onConfirm={doRestore}
        onCancel={() => setRestoreAt(null)}
      />
    </>
  );
}
