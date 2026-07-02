"use client";

// THE suggestion / bug-report composer. Compose-only over modal.tsx (Modal Rule).
// Any staff member: category + message + up to 4 screenshots. Images upload
// client-side to the PRIVATE `suggestions` bucket (the ProfileAvatarSection
// pattern — createClient() browser singleton, .storage.upload, inline size/type
// guards) under the caller's own `${userId}/` prefix; only the resulting storage
// PATHS reach submitSuggestionAction (never the File, never a public URL — the
// bucket is private and signed on read). Never auto-sends; submit is explicit.

import { useRef, useState } from "react";
import { Trash2, ImagePlus, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { submitSuggestionAction } from "@/lib/actions/suggestions";
import { formErrors } from "@/lib/validations/form-errors";
import {
  SUGGESTION_CATEGORY_OPTIONS,
  SUGGESTIONS_BUCKET,
  MAX_SUGGESTION_IMAGES,
  MAX_SUGGESTION_IMAGE_BYTES,
  type SuggestionCategory,
} from "@/lib/constants/suggestions";

type Attachment = {
  file: File;
  /** In-memory object URL for the thumbnail (revoked on remove/close). */
  previewUrl: string;
};

export function SuggestionComposerModal({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
}) {
  const toast = useToast;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<SuggestionCategory>("bug");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setCategory("bug");
    setMessage("");
    setAttachments([]);
    setError(null);
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    // Allow re-picking the same file later.
    e.target.value = "";
    if (picked.length === 0) return;

    setError(null);
    const next: Attachment[] = [];
    for (const file of picked) {
      if (attachments.length + next.length >= MAX_SUGGESTION_IMAGES) {
        setError(formErrors.suggestionTooManyImages);
        break;
      }
      if (!file.type.startsWith("image/")) {
        setError(formErrors.suggestionImageInvalidType);
        continue;
      }
      if (file.size > MAX_SUGGESTION_IMAGE_BYTES) {
        setError(formErrors.suggestionImageTooLarge);
        continue;
      }
      next.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    if (submitting) return;
    if (message.trim().length === 0) {
      setError(formErrors.suggestionMessageRequired);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Upload each image to the private bucket under the caller's prefix.
      const supabase = createClient();
      const draftId = crypto.randomUUID();
      const imagePaths: string[] = [];

      for (let i = 0; i < attachments.length; i++) {
        const { file } = attachments[i];
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${userId}/${draftId}/${i}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(SUGGESTIONS_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) {
          setError(formErrors.suggestionUploadFailed);
          setSubmitting(false);
          return;
        }
        imagePaths.push(path);
      }

      // 2. Persist the report (paths only — never the File, never a URL).
      const result = await submitSuggestionAction({ category, message, imagePaths });
      if (result.error || !result.data) {
        setError(result.error ?? formErrors.suggestionSubmitFailed);
        setSubmitting(false);
        return;
      }

      toast.success("Thanks — your feedback was sent.");
      reset();
      onClose();
    } catch {
      setError(formErrors.suggestionSubmitFailed);
      setSubmitting(false);
    }
  }

  const atMax = attachments.length >= MAX_SUGGESTION_IMAGES;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Send feedback"
      description="Spotted a bug or have an idea? Tell us — add screenshots if it helps."
      size="md"
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", width: "100%" }}>
          {error && (
            <span style={{ flex: 1, color: "var(--color-danger)", fontSize: "var(--text-xs)" }}>
              {error}
            </span>
          )}
          <div style={{ flex: error ? 0 : 1 }} />
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={Send}
            iconMotion="lift"
            loading={submitting}
            onClick={() => void handleSubmit()}
          >
            Send
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        {/* Category */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <label className="label-micro" style={{ color: "var(--theme-text-secondary)" }}>
            Type
          </label>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {SUGGESTION_CATEGORY_OPTIONS.map((opt) => {
              const selected = category === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className="serene-pressable"
                  onClick={() => setCategory(opt.id)}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    borderRadius: "var(--radius-full)",
                    fontSize: "var(--text-sm)",
                    cursor: "pointer",
                    color: selected ? "var(--theme-accent)" : "var(--theme-text-secondary)",
                    background: selected ? "var(--theme-accent-surface)" : "var(--theme-paper-subtle)",
                    border: `1px solid ${selected ? "var(--theme-accent)" : "var(--theme-paper-border)"}`,
                    transition: "color var(--duration-fast) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Message */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <label className="label-micro" style={{ color: "var(--theme-text-secondary)" }}>
            Message
          </label>
          <textarea
            className="serene-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What happened, or what would you like to see?"
            rows={4}
            maxLength={2000}
            autoFocus
            style={{
              resize: "vertical",
              minHeight: "96px",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--theme-paper-border)",
              background: "var(--theme-paper)",
              color: "var(--theme-text-primary)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
            }}
          />
        </div>

        {/* Attachments */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <label className="label-micro" style={{ color: "var(--theme-text-secondary)" }}>
            Screenshots <span style={{ color: "var(--theme-text-tertiary)" }}>(optional, up to {MAX_SUGGESTION_IMAGES})</span>
          </label>

          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {attachments.map((a, i) => (
              <div
                key={a.previewUrl}
                style={{
                  position: "relative",
                  width: "72px",
                  height: "72px",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  border: "1px solid var(--theme-paper-border)",
                }}
              >
                { }
                <img
                  src={a.previewUrl}
                  alt={`Attachment ${i + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  type="button"
                  aria-label="Remove image"
                  className="serene-pressable"
                  onClick={() => removeAttachment(i)}
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "22px",
                    height: "22px",
                    borderRadius: "var(--radius-full)",
                    border: "none",
                    background: "var(--overlay-scrim)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 style={{ width: "12px", height: "12px", strokeWidth: 1.5 }} />
                </button>
              </div>
            ))}

            {!atMax && (
              <button
                type="button"
                className="serene-pressable serene-touch"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Add screenshot"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "72px",
                  height: "72px",
                  borderRadius: "var(--radius-md)",
                  border: "1px dashed var(--theme-paper-border)",
                  background: "var(--theme-paper-subtle)",
                  color: "var(--theme-text-tertiary)",
                  cursor: "pointer",
                }}
              >
                <ImagePlus style={{ width: "20px", height: "20px", strokeWidth: 1.5 }} />
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            style={{ display: "none" }}
          />
        </div>
      </div>
    </Modal>
  );
}
