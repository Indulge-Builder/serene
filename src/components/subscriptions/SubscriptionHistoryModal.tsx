"use client";

// Detail + history for one subscription: summary (with credential reveal) plus the
// full payment history (monthly/yearly/other) or top-up history (top_up). Fetches
// on open via getSubscriptionDetailAction (A-15 — client can't call the service).

import { Button } from '@/components/ui/Button';
import { useEffect, useState, type CSSProperties } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InvoiceLink } from "./InvoiceControls";
import { DepartmentPills, TypePill, CurrencyAmount } from "./SubscriptionBits";
import { formatDate } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/numbers";
import { paymentLateness } from "@/lib/utils/subscription-status";
import {
  getSubscriptionDetailAction,
  revealSubscriptionPasswordAction,
} from "@/lib/actions/subscriptions";
import type {
  SubscriptionRow,
  SubscriptionPaymentRow,
  SubscriptionTopupRow,
} from "@/lib/types/subscription";
import { EmptyState } from '@/components/ui/EmptyState';

type Props = {
  open: boolean;
  onClose: () => void;
  subscriptionId: string;
  subscriptionName?: string;
};

type PasswordReveal = { revealed_at: string; revealed_by_name: string | null };

type Detail = {
  subscription: SubscriptionRow;
  hasPassword: boolean;
  /** Who has revealed this password (0167). Empty for anyone but admin/founder. */
  reveals?: PasswordReveal[];
  payments: SubscriptionPaymentRow[];
  topups: SubscriptionTopupRow[];
};

export function SubscriptionHistoryModal({
  open,
  onClose,
  subscriptionId,
  subscriptionName,
}: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setDetail(null);
    setShowPassword(false);
    setRevealedPassword(null);
    setRevealing(false);
    getSubscriptionDetailAction(subscriptionId).then((res) => {
      if (!active) return;
      setDetail(res.data ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, subscriptionId]);

  async function toggleReveal() {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    if (revealedPassword !== null) {
      setShowPassword(true);
      return;
    }
    setRevealing(true);
    const res = await revealSubscriptionPasswordAction(subscriptionId);
    setRevealing(false);
    if (res.data) {
      setRevealedPassword(res.data.password ?? "");
      setShowPassword(true);
    }
  }

  const sub = detail?.subscription;
  const isTopUp = sub?.type === "top_up";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={sub?.name ?? subscriptionName ?? "Subscription"}
      description={isTopUp ? "Top-up history" : "Payment history"}
      maxWidth="max-w-2xl"
    >
      {loading || !sub ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-8)" }}>
          <Loader2
            style={{ width: 22, height: 22, strokeWidth: 1.5, color: "var(--theme-text-tertiary)" }}
            className="animate-spin"
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {/* Summary */}
          <div style={summaryGrid}>
            <Field label="Departments">
              <DepartmentPills departments={sub.departments} max={4} />
            </Field>
            <Field label="Type">
              <TypePill type={sub.type} />
            </Field>
            {!isTopUp && (
              <Field label="Amount">
                <CurrencyAmount amount={sub.amount} currency={sub.currency} />
              </Field>
            )}
            <Field label="Currency">{sub.currency}</Field>
            {sub.login && <Field label="Login">{sub.login}</Field>}
            {detail?.hasPassword && (
              <Field label="Password">
                <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {showPassword ? revealedPassword ?? "" : "••••••••"}
                  </span>
                  <Button
                    variant="ghost"
                    iconOnly size="sm"
                    type="button"
                    onClick={toggleReveal}
                    disabled={revealing}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Reveal password"}
                  >
                    {revealing ? (
                      <Loader2 style={{ width: 14, height: 14, strokeWidth: 1.5 }} className="animate-spin" />
                    ) : showPassword ? (
                      <EyeOff style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
                    ) : (
                      <Eye style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
                    )}
                  </Button>
                </span>
              </Field>
            )}
            {/* The reveal ledger (0167) has been written since the feature
                shipped but had nowhere to be seen — an audit nobody can read is
                only half an audit. RLS returns [] to anyone but admin/founder,
                so this simply does not render for them. */}
            {detail?.hasPassword && (detail.reveals?.length ?? 0) > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Password viewed by">
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                    {detail!.reveals!.slice(0, 5).map((r, i) => (
                      <span
                        key={`${r.revealed_at}-${i}`}
                        style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)" }}
                      >
                        {r.revealed_by_name ?? "Unknown user"}
                        <span style={{ color: "var(--theme-text-tertiary)" }}>
                          {" · "}
                          {formatDate(r.revealed_at, "d MMM yyyy, h:mm a")}
                        </span>
                      </span>
                    ))}
                    {(detail!.reveals!.length ?? 0) > 5 && (
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
                        + {detail!.reveals!.length - 5} earlier
                      </span>
                    )}
                  </div>
                </Field>
              </div>
            )}
            {sub.notes && (
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Notes">{sub.notes}</Field>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--theme-paper-border)" }} />

          {/* History */}
          {isTopUp ? (
            <TopupHistory topups={detail!.topups} />
          ) : (
            <PaymentHistory payments={detail!.payments} currency={sub.currency} />
          )}
        </div>
      )}
    </Modal>
  );
}

function PaymentHistory({
  payments,
  currency,
}: {
  payments: SubscriptionPaymentRow[];
  currency: SubscriptionRow["currency"];
}) {
  if (payments.length === 0) {
    return <EmptyState title="No payments recorded yet." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {payments.map((p) => {
        const late = paymentLateness(p);
        return (
          <div key={p.id} style={rowStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={rowMain}>
                {formatCurrency(Number(p.rate), currency)} ·{" "}
                {formatCurrency(Number(p.paid_amount_inr), "INR")}
              </span>
              <span style={rowSub}>
                Due {formatDate(p.due_date, "dd MMM yyyy")} · Paid{" "}
                {formatDate(p.paid_at, "dd MMM yyyy")}
              </span>
              {p.notes && <span style={rowNote}>{p.notes}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <LatenessChip days={late} />
              {p.invoice_path && <InvoiceLink path={p.invoice_path} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopupHistory({ topups }: { topups: SubscriptionTopupRow[] }) {
  if (topups.length === 0) {
    return <EmptyState title="No top-ups logged yet." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {topups.map((t) => (
        <div key={t.id} style={rowStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={rowMain}>
              {formatCurrency(Number(t.amount), t.currency)} ·{" "}
              {formatCurrency(Number(t.paid_amount_inr), "INR")}
            </span>
            <span style={rowSub}>{formatDate(t.topped_up_at, "dd MMM yyyy")}</span>
            {t.notes && <span style={rowNote}>{t.notes}</span>}
          </div>
          {t.invoice_path && (
            <div style={{ alignSelf: "center" }}>
              <InvoiceLink path={t.invoice_path} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LatenessChip({ days }: { days: number }) {
  if (days > 0) {
    return (
      <span style={{ ...chip, background: "var(--color-danger-light)", color: "var(--color-danger-text)" }}>
        Paid {days}d late
      </span>
    );
  }
  return (
    <span style={{ ...chip, background: "var(--color-success-light)", color: "var(--color-success-text)" }}>
      On time
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="label-micro">{label}</span>
      <span style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-primary)" }}>{children}</span>
    </div>
  );
}

const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: "var(--space-6)",
  rowGap: "var(--space-4)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "var(--space-3)",
  padding: "var(--space-3)",
  background: "var(--theme-paper-subtle)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--theme-paper-border)",
};

const rowMain: CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: "var(--weight-medium)",
  color: "var(--theme-text-primary)",
};

const rowSub: CSSProperties = {
  fontSize: "var(--text-xs)",
  color: "var(--theme-text-tertiary)",
};

const rowNote: CSSProperties = {
  fontSize: "var(--text-xs)",
  color: "var(--theme-text-secondary)",
  marginTop: 2,
};

const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px var(--space-2)",
  borderRadius: "var(--radius-full)",
  fontSize: "var(--text-2xs)",
  fontWeight: "var(--weight-medium)",
  whiteSpace: "nowrap",
};
