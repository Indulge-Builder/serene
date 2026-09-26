"use client";

// Log a top-up for a top_up-type subscription (prepaid/credit accounts). Amount +
// currency live on the row (each top-up can differ). paid_amount_inr is the manual
// INR that left the account — never auto-converted.

import { useState, useEffect, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Plus, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/Field";
import { DatePicker } from "@/components/ui/DatePicker";
import { parseIsoDate, toIsoDate } from "@/lib/utils/dates";
import { FormSelect } from "@/components/ui/FormSelect";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { FIELD_LABEL_STYLE, HELP_TEXT_STYLE, todayIso } from "./form-styles";
import { InvoiceField } from "./InvoiceControls";
import {
  SUBSCRIPTION_CURRENCY_OPTIONS,
  CURRENCY_SYMBOLS,
  type SubscriptionCurrency,
} from "@/lib/constants/subscription-constants";
import type { SubscriptionRow } from "@/lib/types/subscription";
import { addSubscriptionTopupAction } from "@/lib/actions/subscriptions";

type Props = {
  open: boolean;
  onClose: () => void;
  subscription: SubscriptionRow;
  onSaved?: () => void;
};

export function LogTopupModal({ open, onClose, subscription, onSaved }: Props) {
  const toast = useToast;
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<SubscriptionCurrency>(subscription.currency);
  const [inr, setInr] = useState("");
  const [toppedUpAt, setToppedUpAt] = useState(todayIso());
  const [invoicePath, setInvoicePath] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Seed a new recording session; failed saves keep the current draft.
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setCurrency(subscription.currency);
    setToppedUpAt(todayIso());
    setInr("");
    setInvoicePath(null);
    setNotes("");
    setSaveError(null);
    // A refresh of the same subscription must not overwrite an open draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subscription.id]);

  const canSubmit =
    amount.trim() !== "" &&
    Number.isFinite(Number(amount)) && Number(amount) >= 0 &&
    inr.trim() !== "" &&
    Number.isFinite(Number(inr)) && Number(inr) >= 0 &&
    toppedUpAt !== "" &&
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
        const result = await addSubscriptionTopupAction({
          subscriptionId: subscription.id,
          topped_up_at: toppedUpAt,
          amount: Number(amount),
          currency,
          paid_amount_inr: Number(inr),
          invoice_path: invoicePath,
          notes: notes.trim() || null,
        });
        if (result.error || !result.data) {
          setSaveError(result.error ?? "The top-up could not be saved. Your entries are still here.");
          return;
        }
        toast.success("Top-up logged");
        onSaved?.();
        onClose();
        router.refresh();
      } catch {
        setSaveError("We could not confirm whether the top-up was saved. Check the list before trying again.");
      }
    });
  }

  return (
    <Modal
      error={saveError ? <Alert tone="danger">{saveError}</Alert> : undefined}
      open={open}
      pending={isPending || uploading}
      onClose={handleClose}
      title="Log Top-up"
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
            form="log-topup-form"
            disabled={!canSubmit}
            loading={isPending}
            iconLeft={Plus as LucideIcon}
          >
            {isPending ? "Saving…" : "Log Top-up"}
          </Button>
        </>
      }
    >
      <form id="log-topup-form" onSubmit={event => { event.preventDefault(); handleSubmit(); }} aria-busy={isPending || uploading} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Amount + currency + INR */}
        <div className="serene-form-row" style={{ gap: "var(--space-3)" }}>
          <div style={{ flex: 1.4 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="top-amount">
              Amount
            </label>
            <div style={{ position: "relative" }}>
              <span style={prefixStyle}>{CURRENCY_SYMBOLS[currency]}</span>
              <Input
                id="top-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isPending}
                placeholder="0.00"
                style={{ paddingLeft: "var(--space-7)" }}
              />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="top-currency">
              Currency
            </label>
            <FormSelect
              id="top-currency"
              value={currency}
              onValueChange={(next) => setCurrency(next as SubscriptionCurrency)}
              disabled={isPending}
            >
              {SUBSCRIPTION_CURRENCY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </div>
        </div>

        <div className="serene-form-row" style={{ gap: "var(--space-3)" }}>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="top-inr">
              Paid (INR)
            </label>
            <div style={{ position: "relative" }}>
              <span style={prefixStyle}>₹</span>
              <Input
                id="top-inr"
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
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="top-date">
              Top-up Date
            </label>
            <DatePicker
              id="top-date"
              style={{ width: "100%" }}
              placeholder="Pick a date"
              value={parseIsoDate(toppedUpAt)}
              onChange={(d) => setToppedUpAt(toIsoDate(d))}
              disabled={isPending}
            />
          </div>
        </div>
        <p style={HELP_TEXT_STYLE}>
          Enter the actual INR that left the account — amounts are never auto-converted.
        </p>

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
          <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="top-notes">
            Notes <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
          </label>
          <Textarea
            id="top-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
            rows={2}
            maxLength={2000}
            style={{ resize: "vertical" }}
          />
        </div>
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
