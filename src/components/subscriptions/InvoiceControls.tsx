"use client";

// Invoice upload + view for the Subscriptions tracker.
// InvoiceField: client-side upload to the PRIVATE subscription-invoices bucket
// under the caller's {uid}/ prefix (A-15 — keeps large file bytes off the server
// action; the RLS insert-own-prefix policy permits it), returns the storage PATH.
// InvoiceLink: mints a short-lived signed URL (admin-client action) and opens it.

import { Button } from '@/components/ui/Button';
import { useRef, useState, type ChangeEvent } from "react";
import { Paperclip, X, FileText, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signSubscriptionInvoiceAction } from "@/lib/actions/subscriptions";
import { formErrors } from "@/lib/validations/form-errors";
import {
  SUBSCRIPTION_INVOICE_BUCKET,
  INVOICE_MAX_BYTES,
  INVOICE_ACCEPT_MIME,
  INVOICE_ACCEPT_ATTR,
} from "@/lib/constants/subscription-constants";

type InvoiceFieldProps = {
  value: string | null; // current storage path
  onChange: (path: string | null) => void;
  onError?: (message: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
};

export function InvoiceField({
  value,
  onChange,
  onError,
  onUploadingChange,
  disabled,
}: InvoiceFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    if (!INVOICE_ACCEPT_MIME.includes(file.type)) {
      onError?.(formErrors.subscriptionInvoiceInvalidType);
      return;
    }
    if (file.size > INVOICE_MAX_BYTES) {
      onError?.(formErrors.subscriptionInvoiceTooLarge);
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    try {
      const supabase = createClient();
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        onError?.(formErrors.subscriptionInvoiceUploadFailed);
        return;
      }
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from(SUBSCRIPTION_INVOICE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) {
        onError?.(formErrors.subscriptionInvoiceUploadFailed);
        return;
      }
      setFileName(file.name);
      onChange(path);
    } catch {
      onError?.(formErrors.subscriptionInvoiceUploadFailed);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  function clear() {
    setFileName(null);
    onChange(null);
  }

  const attached = value != null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
      <input
        ref={inputRef}
        type="file"
        accept={INVOICE_ACCEPT_ATTR}
        onChange={handleSelect}
        style={{ display: "none" }}
        disabled={disabled || uploading}
      />
      {!attached ? (
        <Button
          variant="control"
          size="sm"
          type="button"
          className="serene-pressable"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? (
            <Loader2 style={{ width: 14, height: 14, strokeWidth: 1.5 }} className="animate-spin" />
          ) : (
            <Paperclip style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
          )}
          {uploading ? "Uploading…" : "Attach invoice"}
        </Button>
      ) : (
        <span style={attachedStyle}>
          <FileText style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
          <span
            style={{
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fileName ?? "Invoice attached"}
          </span>
          <Button
            variant="danger"
            iconOnly size="sm"
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label="Remove invoice"
            style={{ display: "inline-flex" }}
          >
            <X style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
          </Button>
        </span>
      )}
    </div>
  );
}

export function InvoiceLink({ path, label = "View" }: { path: string; label?: string }) {
  const [loading, setLoading] = useState(false);

  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await signSubscriptionInvoiceAction({ path });
      if (res.data?.url) {
        window.open(res.data.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="control"
      size="sm"
      type="button"
      onClick={open}
      disabled={loading}
      style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}
    >
      {loading ? (
        <Loader2 style={{ width: 13, height: 13, strokeWidth: 1.5 }} className="animate-spin" />
      ) : (
        <FileText style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
      )}
      {label}
    </Button>
  );
}



const attachedStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-2)",
  height: "2rem",
  padding: "0 var(--space-3)",
  background: "var(--theme-accent-surface)",
  border: "1px solid var(--theme-accent-muted)",
  borderRadius: "var(--radius-sm)",
  color: "var(--theme-text-primary)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-xs)",
} as const;
