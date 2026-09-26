"use client";

// Add / Edit a subscription. useState form (conditional fields by type — the
// AddRechargeModal pattern). Departments = multi-select dropdown over app_domains.
// Password has a reveal toggle and round-trips exactly (never sanitized).

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MQ, useMediaQuery } from "@/hooks/useMediaQuery";
import { Save, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/Field";
import { DatePicker } from "@/components/ui/DatePicker";
import { parseIsoDate, toIsoDate } from "@/lib/utils/dates";
import { FormSelect } from "@/components/ui/FormSelect";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { useToast } from "@/hooks/useToast";
import { FIELD_LABEL_STYLE, HELP_TEXT_STYLE } from "./form-styles";
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // No autofocus on a phone: the keyboard would cover the opening sheet.
  const touch = useMediaQuery(MQ.touch);

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
    setSaveError(null);
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
    setSaveError(null);
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
      try {
        const result = isEdit
          ? await updateSubscriptionAction({ ...payload, id: subscription!.id })
          : await createSubscriptionAction(payload);
        if (result.error || !result.data) {
          setSaveError(result.error ?? "The subscription could not be saved. Your entries are still here.");
          return;
        }
        toast.success(isEdit ? "Subscription updated" : "Subscription added");
        onSaved?.();
        onClose();
        router.refresh();
      } catch {
        setSaveError("We could not confirm whether the subscription was saved. Check the list before trying again.");
      }
    });
  }

  return (
    <Modal
      error={saveError ? <Alert tone="danger">{saveError}</Alert> : undefined}
      open={open}
      pending={isPending}
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
            type="submit"
            form="subscription-form"
            disabled={!canSubmit}
            loading={isPending}
            iconLeft={Save as LucideIcon}
          >
            {isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Subscription"}
          </Button>
        </>
      }
    >
      <form id="subscription-form" onSubmit={event => { event.preventDefault(); handleSubmit(); }} aria-busy={isPending} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Name */}
        <div>
          <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-name">
            Name
          </label>
          <Input
            id="sub-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            placeholder="e.g. Figma, AWS, Adobe Creative Cloud"
            maxLength={200}
            autoFocus={!touch}
          />
        </div>

        {/* Tool */}
        <div>
          <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-tool">
            Tool (optional)
          </label>
          <Input
            id="sub-tool"
            type="text"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            disabled={isPending}
            placeholder="Groups accounts of one tool — e.g. Claude"
            maxLength={120}
            list={toolOptions && toolOptions.length > 0 ? "sub-tool-options" : undefined}
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
          <label className="serene-field-label" style={FIELD_LABEL_STYLE}>
            Departments
          </label>
          <FilterDropdown
              disabled={isPending}
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
        <div className="serene-form-row" style={{ gap: "var(--space-3)" }}>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-type">
              Billing Type
            </label>
            <FormSelect
              id="sub-type"
              value={type}
              onValueChange={(next) => setType(next as SubscriptionType)}
              disabled={isPending}
            >
              {SUBSCRIPTION_TYPE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </div>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-currency">
              Currency
            </label>
            <FormSelect
              id="sub-currency"
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

        {/* Amount + due (conditional by type) */}
        <div className="serene-form-row" style={{ gap: "var(--space-3)" }}>
          {!isTopUp && (
            <div style={{ flex: 1 }}>
              <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-amount">
                Amount
              </label>
              <Input
                id="sub-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isPending}
                placeholder="0.00"
              />
            </div>
          )}
          {needsDay && (
            <div style={{ flex: 1 }}>
              <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-due-day">
                Due Day (of month)
              </label>
              <Input
                id="sub-due-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                disabled={isPending}
                placeholder="1–31"
              />
            </div>
          )}
          {needsDate && (
            <div style={{ flex: 1 }}>
              <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-due-date">
                Due Date
              </label>
              <DatePicker
                id="sub-due-date"
                style={{ width: "100%" }}
                placeholder="Pick a date"
                value={parseIsoDate(dueDate)}
                onChange={(d) => setDueDate(toIsoDate(d))}
                disabled={isPending}
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
        <div className="serene-form-row" style={{ gap: "var(--space-3)" }}>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-login">
              Login <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
            </label>
            <Input
              id="sub-login"
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              maxLength={300}
              placeholder="username or email"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-password">
              Password <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
            </label>
            <div style={{ position: "relative" }}>
              <Input
                id="sub-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
                autoComplete="new-password"
                maxLength={300}
                style={{ paddingRight: "var(--space-8)" }}
              />
              <Button
                variant="ghost"
                iconOnly size="sm"
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: "var(--space-2)", top: "50%", transform: "translateY(-50%)", display: "inline-flex" }}
              >
                {showPassword ? (
                  <EyeOff style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
                ) : (
                  <Eye style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
                )}
              </Button>
            </div>
            {isEdit && (
              <p style={HELP_TEXT_STYLE}>Leave blank to keep the current password.</p>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="sub-notes">
            Notes <span style={{ color: "var(--theme-text-tertiary)" }}>(optional)</span>
          </label>
          <Textarea
            id="sub-notes"
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
