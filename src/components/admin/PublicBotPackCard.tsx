"use client";

// The public bot's knowledge pack on the library page (0252, docs/architecture/indulge-bot-plan.md
// section 7c): what the concierge knows right now, what a publish would contain, what the leak
// check found, Publish, and the version history with Restore. Display + action calls only.

import { useState, useTransition } from "react";
import { BookCheck, RotateCcw, ShieldAlert } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { formatDate } from "@/lib/utils/dates";
import { getPackOverviewAction, publishPackAction, restorePackAction, type PackOverview } from "@/lib/actions/public-bot";

interface PublicBotPackCardProps {
  initial: PackOverview | null;
  canPublish: boolean;
}

const line: React.CSSProperties = { fontSize: "var(--text-sm)", color: "var(--theme-text-primary)", margin: 0 };
const muted: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", margin: 0 };

export function PublicBotPackCard({ initial, canPublish }: PublicBotPackCardProps) {
  const toast = useToast;
  const [overview, setOverview] = useState<PackOverview | null>(initial);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const live = overview?.versions[0] ?? null;
  const draft = overview?.draft ?? null;
  const blocked = (draft?.hits.length ?? 0) > 0;

  function refresh() {
    startTransition(async () => {
      const r = await getPackOverviewAction();
      if (r.data) setOverview(r.data);
    });
  }

  function publish() {
    startTransition(async () => {
      const r = await publishPackAction();
      setConfirmPublish(false);
      if (r.error || !r.data) {
        toast.danger(r.error ?? "The pack was not published.");
        return;
      }
      toast.success(`Published. The concierge now knows version ${r.data.version}.`);
      const o = await getPackOverviewAction();
      if (o.data) setOverview(o.data);
    });
  }

  function restore(version: number) {
    startTransition(async () => {
      const r = await restorePackAction({ version });
      setRestoreTarget(null);
      if (r.error || !r.data) {
        toast.danger(r.error ?? "That version could not be restored.");
        return;
      }
      toast.success(`Version ${version} is live again (as version ${r.data.version}).`);
      const o = await getPackOverviewAction();
      if (o.data) setOverview(o.data);
    });
  }

  return (
    <div className="mb-4">
      <SectionCard
        title="What the Indulge concierge knows"
        description="Only approved items reach her, and only after you publish."
        headerRight={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button variant="ghost" size="sm" type="button" onClick={refresh} disabled={pending}>
              Check again
            </Button>
            {canPublish && (
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => setConfirmPublish(true)}
                disabled={pending || blocked || !draft || draft.itemCount === 0}
              >
                <BookCheck style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
                Publish
              </Button>
            )}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {live ? (
            <p style={line}>
              Live: version {live.version}, {live.itemCount} items, published {formatDate(live.createdAt, "dd MMM yyyy, h:mm a")}
              {live.restoredFrom ? ` (restored from version ${live.restoredFrom})` : ""}.
            </p>
          ) : (
            <p style={line}>Nothing is published yet, so the concierge stays quiet on the Indulge number. Approve the facts, stories and files, then publish.</p>
          )}
          {draft && (
            <p style={muted}>
              A publish now would contain {draft.itemCount} approved items ({Math.round(draft.chars / 1000)}k characters).
            </p>
          )}
          {blocked && draft && (
            <div
              role="alert"
              style={{
                display: "flex", gap: "var(--space-3)", alignItems: "flex-start",
                padding: "var(--space-3)", borderRadius: "var(--radius-md)",
                background: "var(--color-danger-light)", color: "var(--color-danger-text)",
              }}
            >
              <ShieldAlert style={{ width: 16, height: 16, strokeWidth: 1.5, flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: "var(--text-sm)" }}>
                The leak check found something a stranger must never read. Remove it from the approved items, then publish:
                <ul style={{ margin: "var(--space-1) 0 0", paddingLeft: "var(--space-5)" }}>
                  {draft.hits.slice(0, 8).map((h, i) => (
                    <li key={`${h.kind}-${i}`}>{h.kind === "name" ? "A person's name" : h.kind === "contact" ? "A phone or email" : "A card or ID number"}: {h.value}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {overview && overview.versions.length > 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <p className="label-micro" style={{ margin: 0 }}>Earlier versions</p>
              {overview.versions.slice(1, 6).map((v) => (
                <div key={v.version} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <p style={muted}>
                    Version {v.version} · {v.itemCount} items · {formatDate(v.createdAt, "dd MMM yyyy, h:mm a")}
                  </p>
                  {canPublish && (
                    <Button variant="ghost" size="sm" type="button" onClick={() => setRestoreTarget(v.version)} disabled={pending}>
                      <RotateCcw style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmPublish}
        dialogKey="publish-pack"
        title="Publish the pack?"
        body="Every approved fact, story, answer and file becomes what the concierge knows, from her very next reply on the Indulge number."
        confirmLabel="Publish"
        pendingLabel="Publishing…"
        pending={pending}
        onConfirm={publish}
        onCancel={() => setConfirmPublish(false)}
      />
      <ConfirmDialog
        open={restoreTarget !== null}
        dialogKey="restore-pack"
        title="Restore this version?"
        body={restoreTarget ? `Version ${restoreTarget} goes live again as a new version. Nothing is deleted.` : null}
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        pending={pending}
        onConfirm={() => restoreTarget && restore(restoreTarget)}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}
