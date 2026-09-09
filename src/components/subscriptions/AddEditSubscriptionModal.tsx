"use client";

// Add / Edit a subscription. useState form (conditional fields by type — the
// AddRechargeModal pattern). Departments = multi-select dropdown over app_domains.
// Password has a reveal toggle and round-trips exactly (never sanitized).

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { useToast } from "@/hooks/useToast";
import { FIELD_LABEL_STYLE, INPUT_STYLE, HELP_TEXT_STYLE } from "./form-styles";
import {
  SUBSCRIPTION_TYPE_OPTIONS,
  SUBSCRIPTION_CURRENCY_OPTIONS,
  SUBSCRIPTION_DEPARTMENT_OPTIONS,
  type SubscriptionType,
  type SubscriptionCurrency,
} from "@/lib/constants/subscription-constants";
import type { AppDomain } from "@/lib/types/database";
import type { SubscriptionRow } from "@/lib/types/subscription";
import {
  createSubscriptionAction,
  updateSubscriptionAction,
} from "@/lib/actions/subscriptions";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Present → edit mode; absent → create mode. */
  subscription?: SubscriptionRow & { toolName?: string | null };
  /** Existing tool names for the Tool field's datalist (dedup happens server-side). */
  toolOptions?: string[];
  onSaved?: () => void;
};

export function AddEditSubscriptionModal({ open, onClose, subscription, toolOptions, onSaved }: Props) {
  const toast = useToast;
  const router = useRouter();
  const isEdit = !!subscription;

  const [name, setName] = useState(subscription?.name ?? "");
  const [toolName, setToolName] = useState(subscription?.toolName ?? "");
  const [departments, setDepartments] = useState<AppDomain[]>(subscription?.departments ?? []);
  const [type, setType] = useState<SubscriptionType>(subscription?.type ?? "monthly");
  const [currency, setCurrency] = useState<SubscriptionCurrency>(subscription?.currency ?? "INR");
  const [amount, setAmount] = useState(subscription?.amount != null ? String(subscription.amount) : "");
  const [dueDay, setDueDay] = useState(subscription?.due_day != null ? String(subscription.due_day) : "");
  const [dueDate, setDueDate] = useState(subscription?.due_date ?? "");
  const [login, setLogin] = useState(subscription?.login ?? "");
  // Password is encrypted at rest (0166) and never sent to the client in a row —
  // so the edit field starts BLANK. Blank on save = keep the stored password.
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notes, setNotes] = useState(subscription?.notes ?? "");
  const [isPending, startTransition] = useTransition();

  // Re-seed every field each time the modal OPENS.
  //
  // A `useState(initial)` initialiser runs once, on first mount — and the
  // button keeps this component mounted after that (useMountOnFirstOpen, so the
  // exit animation can play). The result was that adding a second subscription
  // showed the first one's values still sitting in the fields: type "Claude",
  // save, reopen, and Claude was still there. The same effect re-seeds from
  // `subscription` when the modal is opened to EDIT a different row.
  //
  // The AddLeadModal precedent (R-01), which does the same on `open`.
  useEffect(() => {
    if (!open) return;
    setName(subscription?.name ?? "");
    setToolName(subscription?.toolName ?? "");
    setDepartments(subscription?.departments ?? []);
    setType(subscription?.type ?? "monthly");
    setCurrency(subscription?.currency ?? "INR");
    setAmount(subscription?.amount != null ? String(subscription.amount) : "");
    setDueDay(subscription?.due_day != null ? String(subscription.due_day) : "");
    setDueDate(subscription?.due_date ?? "");
    setLogin(subscription?.login ?? "");
    // Never pre-filled: the stored password is encrypted (0166) and blank on
    // save means "keep the existing one".
    setPassword("");
    setShowPassword(false);
    setNotes(subscription?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subscription?.id]);

  const isTopUp = type === "top_up";
  const needsDay = type === "monthly" || type === "other";
  const needsDate = type === "yearly";

  const amountValid = isTopUp || (amount.trim() !== "" && Number(amount) >= 0);
  const dayValid = !needsDay || (dueDay.trim() !== "" && Number(dueDay) >= 1 && Number(dueDay) <= 31);
  const dateValid = !needsDate || dueDate.trim() !== "";
  const canSubmit =
    name.trim() !== "" && departments.length > 0 && amountValid && dayValid && dateValid && !isPending;

  function handleClose() {
    if (isPending) return;
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const payload = {
      name: name.trim(),
      departments,
      type,
      currency,
      amount: isTopUp ? null : amount.trim() === "" ? null : Number(amount),
      due_day: needsDay ? (dueDay.trim() === "" ? null : Number(dueDay)) : null,
      due_date: needsDate ? dueDate || null : null,
      login: login.trim() || null,
      // Tri-state: blank on edit → undefined (keep stored); blank on create → null;
      // a value → set/replace (the DB trigger encrypts on write).
      password: password === "" ? (isEdit ? undefined : null) : password,
      notes: notes.trim() || null,
      tool_name: toolName.trim() || null,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateSubscriptionAction({ ...payload, id: subscription!.id })
        : await createSubscriptionAction(payload);
      if (result.error || !result.data) {
        toast.danger(isEdit ? "Couldn't update subscription" : "Couldn't add subscription", {
          message: result.error ?? undefined,
        });
        return;
      }
      toast.success(isEdit ? "Subscription updated" : "Subscription added");
      onSaved?.();
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? "Edit Subscription" : "Add Subscription"}
      description={
        isEdit
          ? "Update the subscription's details."
          : "Track a recurring bill, membership, or prepaid account."
      }
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={isPending}
            iconLeft={Save as LucideIcon}
          >
            {isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Subscription"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Name */}
        <div>
          <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-name">
            Name
          </label>
          <input
            id="sub-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            placeholder="e.g. Figma, AWS, Adobe Creative Cloud"
            maxLength={200}
            style={INPUT_STYLE}
            autoFocus
          />
        </div>

        {/* Tool */}
        <div>
          <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-tool">
            Tool (optional)
          </label>
          <input
            id="sub-tool"
            type="text"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            disabled={isPending}
            placeholder="Groups accounts of one tool — e.g. Claude"
            maxLength={120}
            list={toolOptions && toolOptions.length > 0 ? "sub-tool-options" : undefined}
            style={INPUT_STYLE}
          />
          {toolOptions && toolOptions.length > 0 && (
            <datalist id="sub-tool-options">
              {toolOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          )}
        </div>

        {/* Departments */}
        <div>
          <label className="label-micro" style={FIELD_LABEL_STYLE}>
            Departments
          </label>
          <FilterDropdown
            label="Select departments"
            items={SUBSCRIPTION_DEPARTMENT_OPTIONS}
            selected={departments}
            onChange={(sel) => setDepartments(sel as AppDomain[])}
            multi
            fullWidth
            menuPortal
          />
        </div>

        {/* Type + Currency */}
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <div style={{ flex: 1 }}>
            <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-type">
              Billing Type
            </label>
            <select
              id="sub-type"
              value={type}
              onChange={(e) => setType(e.target.value as SubscriptionType)}
              disabled={isPending}
              style={INPUT_STYLE}
            >
              {SUBSCRIPTION_TYPE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-currency">
              Currency
            </label>
            <select
              id="sub-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as SubscriptionCurrency)}
              disabled={isPending}
              style={INPUT_STYLE}
            >
              {SUBSCRIPTION_CURRENCY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Amount + due (conditional by type) */}
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          {!isTopUp && (
            <div style={{ flex: 1 }}>
              <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-amount">
                Amount
              </label>
              <input
                id="sub-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isPending}
                placeholder="0.00"
                style={INPUT_STYLE}
              />
            </div>
          )}
          {needsDay && (
            <div style={{ flex: 1 }}>
              <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-due-day">
                Due Day (of month)
              </label>
              <input
                id="sub-due-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                disabled={isPending}
                placeholder="1–31"
                style={INPUT_STYLE}
              />
            </div>
          )}
          {needsDate && (
            <div style={{ flex: 1 }}>
              <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-due-date">
                Due Date
              </label>
              <input
                id="sub-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isPending}
                style={INPUT_STYLE}
              />
            </div>
          )}
        </div>
        {isTopUp && (
          <p style={HELP_TEXT_STYLE}>
            Top-up subscriptions have no fixed amount or due date — log each top-up as it happens.
          </p>
        )}

        {/* Login + Password */}
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <div style={{ flex: 1 }}>
            <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-login">
              Login <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
            </label>
            <input
              id="sub-login"
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              maxLength={300}
              placeholder="username or email"
              style={INPUT_STYLE}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-password">
              Password <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="sub-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
                autoComplete="new-password"
                maxLength={300}
                style={{ ...INPUT_STYLE, paddingRight: "var(--space-8)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "var(--space-2)",
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "inline-flex",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--theme-text-tertiary)",
                  padding: 0,
                }}
              >
                {showPassword ? (
                  <EyeOff style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
                ) : (
                  <Eye style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
                )}
              </button>
            </div>
            {isEdit && (
              <p style={HELP_TEXT_STYLE}>Leave blank to keep the current password.</p>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="label-micro" style={FIELD_LABEL_STYLE} htmlFor="sub-notes">
            Notes <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
          </label>
          <textarea
            id="sub-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
            rows={2}
            maxLength={2000}
            style={{ ...INPUT_STYLE, resize: "vertical" }}
          />
        </div>
      </div>
    </Modal>
  );
}
