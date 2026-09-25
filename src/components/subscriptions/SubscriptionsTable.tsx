"use client";

// The subscriptions list — dense table (md+) + compact cards (mobile). Display-only
// rows; owns the row-action menu (⋯) and the modal orchestration (edit / history /
// archive-confirm). Row click opens history. Recording a payment / top-up lives on
// the top-right Add Subscription → Renewal flow, not the row menu.

import { Button } from '@/components/ui/Button';
import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { m as motion } from "framer-motion";
import { MoreHorizontal, Receipt } from "lucide-react";
import { usePortalAnchor } from "@/hooks/usePortalAnchor";
import { FloatingPanel } from "@/components/ui/FloatingPanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import { EASE_OUT_EXPO } from "@/lib/constants/motion";
import { formatDate } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/numbers";
import { archiveSubscriptionAction } from "@/lib/actions/subscriptions";
import type { SubscriptionListItem } from "@/lib/types/subscription";
import {
  SubscriptionStatusPill,
  DepartmentPills,
  TypePill,
  CurrencyAmount,
} from "./SubscriptionBits";

const AddEditSubscriptionModal = dynamic(
  () => import("./AddEditSubscriptionModal").then((m) => m.AddEditSubscriptionModal),
  { ssr: false },
);
const SubscriptionHistoryModal = dynamic(
  () => import("./SubscriptionHistoryModal").then((m) => m.SubscriptionHistoryModal),
  { ssr: false },
);

type ActionType = "edit" | "history";

const COLUMNS = ["Name", "Departments", "Type", "Amount", "INR Paid", "Due", "Status", ""];

export function SubscriptionsTable({
  subscriptions,
  archived,
}: {
  subscriptions: SubscriptionListItem[];
  archived: boolean;
}) {
  const toast = useToast;
  const router = useRouter();

  const toolOptions = Array.from(
    new Set(subscriptions.map((s) => s.toolName).filter((t): t is string => t != null)),
  ).sort();

  const [modal, setModal] = useState<{ type: ActionType; sub: SubscriptionListItem } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmSub, setConfirmSub] = useState<SubscriptionListItem | null>(null);
  const [isPending, startTransition] = useTransition();

  function openModal(type: ActionType, sub: SubscriptionListItem) {
    setModal({ type, sub });
    setModalOpen(true);
  }

  function onAction(type: ActionType | "archive", sub: SubscriptionListItem) {
    if (type === "archive") {
      if (sub.is_archived) runArchive(sub, false);
      else setConfirmSub(sub);
      return;
    }
    openModal(type, sub);
  }

  function runArchive(sub: SubscriptionListItem, nextArchived: boolean) {
    startTransition(async () => {
      const res = await archiveSubscriptionAction({ id: sub.id, isArchived: nextArchived });
      setConfirmSub(null);
      if (res.error) {
        toast.danger("Action failed", { message: res.error });
        return;
      }
      toast.success(nextArchived ? "Subscription archived" : "Subscription restored");
      router.refresh();
    });
  }

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        framed
        title={archived ? "Nothing archived" : "No subscriptions yet"}
        description={
          archived
            ? "Archived subscriptions will appear here."
            : "Add your first subscription to start tracking bills and renewals."
        }
      />
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1, ease: EASE_OUT_EXPO }}
        style={{
          border: "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-1)",
          background: "var(--theme-paper)",
          overflow: "hidden",
        }}
      >
        {/* Desktop table */}
        <div className="hidden md:block" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {COLUMNS.map((c, i) => (
                  <th key={i} style={thStyle}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr
                  key={sub.id}
                  onClick={() => openModal("history", sub)}
                  style={rowStyle}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--theme-paper-subtle)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: "var(--weight-medium)" }}>
                    {sub.name}
                    {sub.toolName && sub.toolName !== sub.name && (
                      <span
                        style={{
                          display: "block",
                          fontSize: "var(--text-xs)",
                          fontWeight: "var(--weight-normal)",
                          color: "var(--theme-text-tertiary)",
                        }}
                      >
                        {sub.toolName}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <DepartmentPills departments={sub.departments} />
                  </td>
                  <td style={tdStyle}>
                    <TypePill type={sub.type} />
                  </td>
                  <td style={tdStyle}>
                    <CurrencyAmount amount={sub.amount} currency={sub.currency} />
                  </td>
                  <td style={tdStyle}>
                    {sub.latestPaidInr != null ? (
                      formatCurrency(sub.latestPaidInr, "INR")
                    ) : (
                      <span style={{ color: "var(--theme-text-tertiary)" }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {sub.currentDueDate ? (
                      formatDate(sub.currentDueDate, "dd MMM yyyy")
                    ) : (
                      <span style={{ color: "var(--theme-text-tertiary)" }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <SubscriptionStatusPill status={sub.status} daysOverdue={sub.daysOverdue} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", width: 48 }}>
                    <RowMenu sub={sub} onAction={onAction} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden">
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              onClick={() => openModal("history", sub)}
              style={cardStyle}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
                <span style={{ fontWeight: "var(--weight-medium)", color: "var(--theme-text-primary)" }}>
                  {sub.name}
                </span>
                <RowMenu sub={sub} onAction={onAction} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <SubscriptionStatusPill status={sub.status} daysOverdue={sub.daysOverdue} />
                <TypePill type={sub.type} />
                <span style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)" }}>
                  <CurrencyAmount amount={sub.amount} currency={sub.currency} />
                </span>
              </div>
              <DepartmentPills departments={sub.departments} />
            </div>
          ))}
        </div>
      </motion.div>

      {modal && (
        <>
          {modal.type === "edit" && (
            <AddEditSubscriptionModal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              subscription={modal.sub}
              toolOptions={toolOptions}
            />
          )}
          {modal.type === "history" && (
            <SubscriptionHistoryModal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              subscriptionId={modal.sub.id}
              subscriptionName={modal.sub.name}
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmSub !== null}
        title="Archive subscription?"
        body={
          <>
            <strong>{confirmSub?.name}</strong> will move to the Archived tab. You can restore it
            anytime — its payment history is kept.
          </>
        }
        confirmLabel="Archive"
        pendingLabel="Archiving…"
        pending={isPending}
        onConfirm={() => confirmSub && runArchive(confirmSub, true)}
        onCancel={() => setConfirmSub(null)}
      />
    </>
  );
}

function RowMenu({
  sub,
  onAction,
}: {
  sub: SubscriptionListItem;
  onAction: (type: ActionType | "archive", sub: SubscriptionListItem) => void;
}) {
  const anchor = usePortalAnchor();

  function item(label: string, action: ActionType | "archive", danger = false) {
    return (
      <Button variant={danger ? "ghost-danger" : "ghost"}
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation();
          anchor.close();
          onAction(action, sub);
        }}
        style={menuItemStyle()}

      >
        {label}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        ref={anchor.triggerRef}
        type="button"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={anchor.open}
        onClick={(e) => {
          e.stopPropagation();
          anchor.toggle();
        }}
      >
        <MoreHorizontal style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
      </Button>
      <FloatingPanel
        {...anchor.panelProps}
        panelKey={`sub-menu-${sub.id}`}
        style={{ padding: "var(--space-1)", minWidth: 180 }}
      >
        <div role="menu" style={{ display: "flex", flexDirection: "column" }}>
          {item("View history", "history")}
          {item("Edit", "edit")}
          {item(sub.is_archived ? "Unarchive" : "Archive", "archive", !sub.is_archived)}
        </div>
      </FloatingPanel>
    </>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "var(--space-3) var(--space-4)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-2xs)",
  fontWeight: "var(--weight-semibold)",
  letterSpacing: "var(--tracking-wide)",
  textTransform: "uppercase",
  color: "var(--theme-text-tertiary)",
  borderBottom: "1px solid var(--theme-paper-border)",
  whiteSpace: "nowrap",
};

const rowStyle: CSSProperties = {
  cursor: "pointer",
  transition: "background var(--duration-fast) var(--ease-in-out)",
};

const tdStyle: CSSProperties = {
  padding: "var(--space-3) var(--space-4)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
  color: "var(--theme-text-secondary)",
  borderBottom: "1px solid var(--theme-paper-border)",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: "var(--space-4)",
  borderBottom: "1px solid var(--theme-paper-border)",
  cursor: "pointer",
};

function menuItemStyle(): CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "var(--space-2) var(--space-3)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
    cursor: "pointer",
  };
}
