"use client";

// Monthly report export (CSV / XLSX) for a selected month. Data comes from a server
// action as plain JSON; the file is built entirely client-side (export.ts is
// CLIENT-SIDE ONLY). Columns per the brief: Name, Department, Type, Currency,
// Original Amount, INR Paid Amount, Due Date, Paid Date.

import { useState, useTransition } from "react";
import { Download, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TabSelector } from "@/components/ui/TabSelector";
import { useToast } from "@/hooks/useToast";
import { FIELD_LABEL_STYLE } from "./form-styles";
import {
  buildCSV,
  buildSingleSheetXLSX,
  triggerBrowserDownload,
  type ExportRow,
} from "@/lib/utils/export";
import type { ExportHeader } from "@/lib/constants/export-columns";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { SUBSCRIPTION_TYPE_LABELS } from "@/lib/constants/subscription-constants";
import { formatDate } from "@/lib/utils/dates";
import { getSubscriptionMonthlyReportAction } from "@/lib/actions/subscriptions";
import type { MonthlyReportRow } from "@/lib/services/subscriptions-service";

const REPORT_HEADERS: ExportHeader[] = [
  { key: "name", label: "Subscription Name" },
  { key: "departments", label: "Department" },
  { key: "type", label: "Type" },
  { key: "currency", label: "Currency" },
  { key: "original_amount", label: "Original Amount" },
  { key: "inr_paid", label: "INR Paid Amount" },
  { key: "due_date", label: "Due Date" },
  { key: "paid_date", label: "Paid Date" },
];

const FORMAT_TABS = [
  { id: "csv", label: "CSV" },
  { id: "xlsx", label: "Excel" },
];

function currentMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toExportRow(r: MonthlyReportRow): ExportRow {
  return {
    name: r.name,
    departments: r.departments.map((d) => DOMAIN_LABELS[d]).join(", "),
    type: SUBSCRIPTION_TYPE_LABELS[r.type],
    currency: r.currency,
    original_amount: r.originalAmount,
    inr_paid: r.inrPaid,
    due_date: r.dueDate ? formatDate(r.dueDate, "dd MMM yyyy") : "",
    paid_date: formatDate(r.paidDate, "dd MMM yyyy"),
  };
}

export function SubscriptionExportButton() {
  const toast = useToast;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonthIso());
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [feedback, setFeedback] = useState<{ tone: "danger" | "info"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDownload() {
    if (isPending || !month) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await getSubscriptionMonthlyReportAction(month);
        if (res.error || !res.data) {
          setFeedback({ tone: "danger", message: res.error ?? "The report could not be prepared. Try again." });
          return;
        }
        if (res.data.rows.length === 0) {
          setFeedback({ tone: "info", message: "No payments or top-ups in that month. Choose another month to export." });
          return;
        }
        const rows = res.data.rows.map(toExportRow);
        const base = `subscriptions-${month}`;
        if (format === "csv") {
          triggerBrowserDownload(`${base}.csv`, buildCSV(rows, REPORT_HEADERS), "text/csv;charset=utf-8;");
        } else {
          const bytes = await buildSingleSheetXLSX(rows, REPORT_HEADERS, "Subscriptions");
          triggerBrowserDownload(
            `${base}.xlsx`,
            bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          );
        }
        toast.success("Report downloaded");
        setOpen(false);
      } catch {
        setFeedback({ tone: "danger", message: "The report could not be prepared. Try again." });
      }
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        iconLeft={Download as LucideIcon}
        iconMotion="drop"
        onClick={() => { setFeedback(null); setOpen(true); }}
      >
        Export
      </Button>

      <Modal
        open={open}
        pending={isPending}
        onClose={() => !isPending && setOpen(false)}
        title="Export Monthly Report"
        description="Download every payment and top-up recorded in the selected month."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="subscription-export-form"
              loading={isPending}
              disabled={!month || isPending}
              iconLeft={Download as LucideIcon}
            >
              {isPending ? "Preparing…" : "Download"}
            </Button>
          </>
        }
      >
        <form id="subscription-export-form" onSubmit={event => { event.preventDefault(); handleDownload(); }} aria-busy={isPending} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE} htmlFor="export-month">
              Month
            </label>
            <Input
              id="export-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div>
            <label className="serene-field-label" style={FIELD_LABEL_STYLE}>
              Format
            </label>
            <TabSelector
              variant="connected"
              indicatorLayoutId="subscriptions-export-format"
              tabs={FORMAT_TABS.map(tab => ({ ...tab, disabled: isPending }))}
              activeTab={format}
              onChange={(id) => setFormat(id as "csv" | "xlsx")}
            />
          </div>
          {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}
        </form>
      </Modal>
    </>
  );
}
