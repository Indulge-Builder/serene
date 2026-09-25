"use client";

// Record a payment for a monthly/yearly/other subscription. Currency is never
// auto-converted: `rate` is the original-currency amount, `paid_amount_inr` the
// manually-entered INR. Due date defaults to the current cycle; paid date to today.

import { useState, useEffect, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { FIELD_LABEL_STYLE, HELP_TEXT_STYLE, todayIso } from "./form-styles";
import { InvoiceField } from "./InvoiceControls";
import { CURRENCY_SYMBOLS } from "@/lib/constants/subscription-constants";
import type { SubscriptionRow } from "@/lib/types/subscription";
import { currentDueDateISO } from "@/lib/utils/subscription-status";
import { addSubscriptionPaymentAction } from "@/lib/actions/subscriptions";

type Props = {
  open: boolean;
  onClose: () => void;
  subscription: SubscriptionRow;
  onSaved?: () => void;
};

export function RecordPaymentModal({ open, onClose, subscription, onSaved }: Props) {
  const toast = useToast;
  const router = useRouter();

  const [rate, setRate] = useState(subscription.amount != null ? String(subscription.amount) : "");
  const [inr, setInr] = useState("");
  const [dueDate, setDueDate] = useState(currentDueDateISO(subscription, new Date()) ?? todayIso());
  const [paidAt, setPaidAt] = useState(todayIso());
  const [invoicePath, setInvoicePath] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Seed a new recording session; failed saves keep the current draft.
  useEffect(() => {
    if (!open) return;
    setRate(subscription.amount != null ? String(subscription.amount) : "");
    setDueDate(currentDueDateISO(subscription, new Date()) ?? todayIso());
    setPaidAt(todayIso());
    setInr("");
    setInvoicePath(null);
    setNotes("");
    setSaveError(null);
    // A refresh of the same subscription must not overwrite an open draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subscription.id]);

  const symbol = CURRENCY_SYMBOLS[subscription.currency];
  const canSubmit =
    rate.trim() !== "" &&
    Number.isFinite(Number(rate)) && Number(rate) >= 0 &&
    inr.trim() !== "" &&
    Number.isFinite(Number(inr)) && Number(inr) >= 0 &&
    dueDate !== "" &&
    paidAt !== "" &&
    !uploading &&
    !isPending;

  function handleClose() {
    if (isPending || uploading) return;
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setSaveError(null);
    startTransition(async () => {
      try {
        const result = await addSubscriptionPaymentAction({
          subscriptionId: subscription.id,
          due_date: dueDate,
          paid_at: paidAt,
          rate: Number(rate),
          paid_amount_inr: Number(inr),
          invoice_path: invoicePath,
          notes: notes.trim() || null,
        });
        if (result.error || !result.data) {
          setSaveError(result.error ?? "The payment could not be saved. Your entries are still here.");
          return;
        }
        toast.success("Payment recorded");
        onSaved?.();
        onClose();
        router.refresh();
      } catch {
        setSaveError("We could not confirm whether the payment was saved. Check the list before trying again.");
      }
    });
  }

  return (
    <Modal
      open={open}
      pending={isPending || uploading}
      onClose={handleClose}
      title="Record Payment"
      description={subscription.name}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isPending || uploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="record-payment-form"
            disabled={!canSubmit}
            loading={isPending}
            iconLeft={CheckCircle2 as LucideIcon}
          >
            {isPending ? "Saving…" : "Record Payment"}
          </Button>
        </>
      }
    >
      <form id="record-payment-form" onSubmit={event => { event.preventDefault(); handleSubmit(); }} aria-busy={isPending || uploading} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Rate (original currency) + INR */}
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="pay-rate">
              Rate ({subscription.currency})
            </label>
            <div style={{ position: "relative" }}>
              <span style={prefixStyle}>{symbol}</span>
              <Input
                id="pay-rate"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                disabled={isPending}
                placeholder="0.00"
                style={{ paddingLeft: "var(--space-7)" }}
              />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="pay-inr">
              Paid (INR)
            </label>
            <div style={{ position: "relative" }}>
              <span style={prefixStyle}>₹</span>
              <Input
                id="pay-inr"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={inr}
                onChange={(e) => setInr(e.target.value)}
                disabled={isPending}
                placeholder="0.00"
                style={{ paddingLeft: "var(--space-7)" }}
              />
            </div>
          </div>
        </div>
        <p style={HELP_TEXT_STYLE}>
          Enter the actual INR that left the account — amounts are never auto-converted.
        </p>

        {/* Due date + Paid date */}
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="pay-due">
              Due Date
            </label>
            <Input
              id="pay-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="pay-paid">
              Paid Date
            </label>
            <Input
              id="pay-paid"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        {/* Invoice + Notes */}
        <div>
          <label className="serene-field-label" style={FIELD_LABEL_STYLE}>
            Invoice <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
          </label>
          <InvoiceField
            value={invoicePath}
            onChange={setInvoicePath}
            onError={setSaveError}
            onUploadingChange={setUploading}
            disabled={isPending}
          />
        </div>

        <div>
          <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="pay-notes">
            Notes <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
          </label>
          <Textarea
            id="pay-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
            rows={2}
            maxLength={2000}
            style={{ resize: "vertical" }}
          />
        </div>
        {saveError && <Alert tone="danger">{saveError}</Alert>}
      </form>
    </Modal>
  );
}

const prefixStyle: CSSProperties = {
  position: "absolute",
  left: "var(--space-3)",
  top: "50%",
  transform: "translateY(-50%)",
  color: "var(--theme-text-tertiary)",
  fontSize: "var(--text-sm)",
  pointerEvents: "none",
};
