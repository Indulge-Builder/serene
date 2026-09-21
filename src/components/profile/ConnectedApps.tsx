"use client";

/**
 * ConnectedApps — THE "Connected AI apps" list on /profile (docs/architecture/mcp-plan.md §7).
 *
 * The AI apps this person has let into Serene through the MCP connector, with Disconnect.
 * Display-only over an RSC seed; the revoke goes through revokeConnectedAppAction (A-15),
 * confirmed with <ConfirmDialog>, optimistic with revert, errors to the toast.
 */

import { useState } from "react";
import { revokeConnectedAppAction } from "@/lib/actions/oauth-grants";
import type { ConnectedApp } from "@/lib/services/oauth-server-service";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils/dates";

export function ConnectedApps({ initialApps }: { initialApps: ConnectedApp[] }) {
  const [apps, setApps] = useState(initialApps);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ConnectedApp | null>(null);

  async function disconnect(app: ConnectedApp) {
    setConfirming(null);
    setPendingId(app.clientId);
    const before = apps;
    setApps((list) => list.filter((a) => a.clientId !== app.clientId));
    const res = await revokeConnectedAppAction({ clientId: app.clientId });
    setPendingId(null);
    if (res.error) {
      setApps(before);
      toast.danger(res.error);
      return;
    }
    toast.success(`${app.name} disconnected.`);
  }

  if (apps.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title="No apps connected yet"
        description="Add Serene as a connector in Claude, ChatGPT or another AI app and it will appear here."
      />
    );
  }

  return (
    <>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {apps.map((app) => (
          <li
            key={app.clientId}
            className="flex items-center justify-between gap-4"
            style={{
              padding: "var(--space-3) var(--space-4)",
              border: "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <div className="min-w-0">
              <p
                className="truncate"
                style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--theme-text-primary)" }}
              >
                {app.name}
              </p>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
                Connected {formatDate(app.grantedAt, "d MMM yyyy")}
                {app.uri ? ` · ${app.uri}` : ""}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={pendingId === app.clientId}
              onClick={() => setConfirming(app)}
            >
              Disconnect
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirming !== null}
        title={`Disconnect ${confirming?.name ?? "this app"}?`}
        body="It will lose access to Serene right away. You can connect it again later."
        confirmLabel="Disconnect"
        danger
        onConfirm={() => confirming && disconnect(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
