"use client";

// Meta daily-breakdown upload flow:
//   pick file → parse client-side (grain guard, zero-spend skip, key
//   normalisation) → preview summary → confirm → uploadAdSpendAction upsert →
//   toast + router.refresh().
// A range-grain export rejects the WHOLE file with the instructional message
// from lib/utils/ad-spend-parse.ts — nothing is ever partially ingested.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { formatCount, formatCurrency } from "@/lib/utils/numbers";
import { parseMetaSpendFile, type ParsedAdSpend } from "@/lib/utils/ad-spend-parse";
import { uploadAdSpendAction } from "@/lib/actions/ad-spend";
import { formatDate } from "@/lib/utils/dates";

type Props = {
  open:    boolean;
  onClose: () => void;
};

export function AdSpendUploadModal({ open, onClose }: Props) {
  const toast  = useToast;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed]     = useState<ParsedAdSpend | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing]   = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setFileName(null);
    setParsed(null);
    setParseError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClose() {
    if (isPending) return;
    reset();
    onClose();
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setParsed(null);
    setParseError(null);
    setIsParsing(true);
    const result = await parseMetaSpendFile(file);
    setIsParsing(false);
    if (result.ok) {
      setParsed(result);
    } else {
      setParseError(result.error);
    }
  }

  function handleUpload() {
    if (!parsed || isPending) return;
    startTransition(async () => {
      const result = await uploadAdSpendAction({
        rows:    parsed.rows,
        skipped: parsed.skipped,
      });
      if (result.error || !result.data) {
        toast.danger("Upload failed", { message: result.error ?? undefined });
        return;
      }
      const { inserted, updated, skipped } = result.data;
      toast.success("Spend uploaded", {
        message: `${formatCount(inserted)} new · ${formatCount(updated)} updated · ${formatCount(skipped)} skipped`,
      });
      reset();
      onClose();
      router.refresh();
    });
  }

  const totalSpend = parsed
    ? parsed.rows.reduce((s, r) => s + r.spend, 0)
    : 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Upload Meta Spend"
      description="Daily-breakdown CSV or XLSX export from Meta Ads Manager."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            disabled={!parsed || isPending}
            loading={isPending}
            iconLeft={Upload as LucideIcon}
          >
            {isPending ? "Uploading…" : "Upload"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* File picker */}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isParsing || isPending}
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            "var(--space-2)",
            padding:        "var(--space-6)",
            background:     "var(--theme-paper-subtle)",
            border:         "1px dashed var(--theme-paper-border)",
            borderRadius:   "var(--radius-md)",
            cursor:         isParsing || isPending ? "wait" : "pointer",
            color:          "var(--theme-text-secondary)",
            fontFamily:     "var(--font-sans)",
            fontSize:       "var(--text-sm)",
          }}
        >
          <FileSpreadsheet
            style={{ width: 20, height: 20, strokeWidth: 1.5, color: "var(--theme-text-tertiary)" }}
          />
          {isParsing
            ? "Reading file…"
            : fileName ?? "Choose a Meta export (.csv / .xlsx)"}
        </button>

        {/* Weekly cadence works today: a multi-day daily-breakdown export
            uploads in one go (one row per day) and re-uploading is idempotent.
            The only requirement is the Day time-breakdown — never a date range. */}
        <p
          style={{
            margin:     0,
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
            lineHeight: "var(--leading-snug)",
          }}
        >
          Export with <strong style={{ color: "var(--theme-text-secondary)", fontWeight: "var(--weight-semibold)" }}>Breakdown → By time → Day</strong>{" "}
          and pick any range — a week, a month, whatever cadence you run. The whole
          range uploads in one go as one row per day, and re-uploading an
          overlapping range is safe: matching days are updated in place, never
          double-counted.
        </p>

        {/* Grain / parse error */}
        {parseError && (
          <div
            style={{
              background:   "var(--color-danger-light)",
              borderRadius: "var(--radius-md)",
              padding:      "var(--space-3) var(--space-4)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              color:        "var(--color-danger-text)",
            }}
          >
            {parseError}
          </div>
        )}

        {/* Parse preview */}
        {parsed && (
          <div
            style={{
              display:       "flex",
              flexDirection: "column",
              gap:           "var(--space-1)",
              padding:       "var(--space-4)",
              background:    "var(--theme-paper-subtle)",
              borderRadius:  "var(--radius-md)",
              fontFamily:    "var(--font-sans)",
              fontSize:      "var(--text-sm)",
              color:         "var(--theme-text-secondary)",
            }}
          >
            <span>
              <strong style={{ color: "var(--theme-text-primary)", fontWeight: "var(--weight-semibold)" }}>
                {formatCount(parsed.rows.length)}
              </strong>{" "}
              day-grain rows · {formatCurrency(Math.round(totalSpend))} total spend
            </span>
            <span>
              {formatDate(parsed.dateFrom, "dd MMM yyyy")} → {formatDate(parsed.dateTo, "dd MMM yyyy")}
            </span>
            {parsed.skipped > 0 && (
              <span style={{ color: "var(--theme-text-tertiary)" }}>
                {formatCount(parsed.skipped)} zero-spend row{parsed.skipped === 1 ? "" : "s"} will be skipped
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
