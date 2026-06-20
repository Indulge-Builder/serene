"use client";

// Add Recharge — record money sent to one Meta ad account. Admin/founder only.
// Composes the shared Modal; mirrors the AdSpendUploadModal flow (useTransition
// → action → toast → router.refresh()). `method` is a payment-method LABEL only
// (NEFT / Razorpay / Card) — never card data; the action + DB CHECK reject PANs.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wallet, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { AD_ACCOUNTS, type AdAccountKey } from "@/lib/constants/ad-accounts";
import { createRechargeAction } from "@/lib/actions/recharge";

type Props = {
  open:    boolean;
  onClose: () => void;
};

const fieldLabelStyle: React.CSSProperties = {
  display:      "block",
  marginBottom: "var(--space-2)",
};

const inputStyle: React.CSSProperties = {
  width:        "100%",
  padding:      "var(--space-2) var(--space-3)",
  background:   "var(--theme-paper)",
  border:       "1px solid var(--theme-paper-border)",
  borderRadius: "var(--radius-sm)",
  color:        "var(--theme-text-primary)",
  fontFamily:   "var(--font-sans)",
  fontSize:     "var(--text-sm)",
};

/** Today as YYYY-MM-DD in local time (the date input's native shape). */
function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function AddRechargeModal({ open, onClose }: Props) {
  const toast  = useToast;
  const router = useRouter();

  const [adAccount, setAdAccount]   = useState<AdAccountKey>(AD_ACCOUNTS[0].key);
  const [amount, setAmount]         = useState("");
  const [currency, setCurrency]     = useState<"INR" | "USD">("INR");
  const [rechargedAt, setRechargedAt] = useState(todayIso());
  const [method, setMethod]         = useState("");
  const [note, setNote]             = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setAdAccount(AD_ACCOUNTS[0].key);
    setAmount("");
    setCurrency("INR");
    setRechargedAt(todayIso());
    setMethod("");
    setNote("");
  }

  function handleClose() {
    if (isPending) return;
    reset();
    onClose();
  }

  function handleSubmit() {
    if (isPending) return;
    const amountNum = Number(amount);
    startTransition(async () => {
      const result = await createRechargeAction({
        adAccount,
        amount:      amountNum,
        currency,
        rechargedAt,
        method:      method.trim() || null,
        note:        note.trim() || null,
      });
      if (result.error || !result.data) {
        toast.danger("Recharge not saved", { message: result.error ?? undefined });
        return;
      }
      toast.success("Recharge recorded");
      reset();
      onClose();
      router.refresh();
    });
  }

  const amountValid = Number(amount) > 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Recharge"
      description="Record money sent to a Meta ad account. Kept separate from campaign spend."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!amountValid || isPending}
            loading={isPending}
            iconLeft={Wallet as LucideIcon}
          >
            {isPending ? "Saving…" : "Save Recharge"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Ad account */}
        <div>
          <label className="label-micro" style={fieldLabelStyle} htmlFor="recharge-account">
            Ad Account
          </label>
          <select
            id="recharge-account"
            value={adAccount}
            onChange={(e) => setAdAccount(e.target.value as AdAccountKey)}
            disabled={isPending}
            style={inputStyle}
          >
            {AD_ACCOUNTS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.displayName}
              </option>
            ))}
          </select>
        </div>

        {/* Amount + currency */}
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <div style={{ flex: 2 }}>
            <label className="label-micro" style={fieldLabelStyle} htmlFor="recharge-amount">
              Amount
            </label>
            <input
              id="recharge-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isPending}
              placeholder="0.00"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label-micro" style={fieldLabelStyle} htmlFor="recharge-currency">
              Currency
            </label>
            <select
              id="recharge-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "INR" | "USD")}
              disabled={isPending}
              style={inputStyle}
            >
              <option value="INR">INR ₹</option>
              <option value="USD">USD $</option>
            </select>
          </div>
        </div>

        {/* Non-INR note — only INR counts toward the burn/balance. */}
        {currency !== "INR" && (
          <p
            style={{
              margin:     0,
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-xs)",
              color:      "var(--theme-text-tertiary)",
              lineHeight: "var(--leading-snug)",
            }}
          >
            Non-INR recharges are recorded but excluded from the INR balance — they
            show as a separate line on the account.
          </p>
        )}

        {/* Recharged date */}
        <div>
          <label className="label-micro" style={fieldLabelStyle} htmlFor="recharge-date">
            Recharge Date
          </label>
          <input
            id="recharge-date"
            type="date"
            value={rechargedAt}
            onChange={(e) => setRechargedAt(e.target.value)}
            disabled={isPending}
            style={inputStyle}
          />
        </div>

        {/* Method label */}
        <div>
          <label className="label-micro" style={fieldLabelStyle} htmlFor="recharge-method">
            Method <span style={{ color: "var(--theme-text-tertiary)" }}>(optional label)</span>
          </label>
          <input
            id="recharge-method"
            type="text"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            disabled={isPending}
            placeholder="e.g. NEFT, Razorpay, Card"
            maxLength={80}
            style={inputStyle}
          />
          <p
            style={{
              margin:     "var(--space-1) 0 0",
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-2xs)",
              color:      "var(--theme-text-tertiary)",
            }}
          >
            Label only — never enter a card number.
          </p>
        </div>

        {/* Note */}
        <div>
          <label className="label-micro" style={fieldLabelStyle} htmlFor="recharge-note">
            Note <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
          </label>
          <textarea
            id="recharge-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending}
            rows={2}
            maxLength={500}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
      </div>
    </Modal>
  );
}
