"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, FileText, ChevronDown, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { createClient } from "@/lib/supabase/client";
import { upsertTrainingAsset } from "@/lib/actions/elaya-training";
import { useToast } from "@/hooks/useToast";
import {
  TRAINING_ASSET_KIND_OPTIONS,
  TRAINING_UPLOAD_HINTS,
  TRAINING_BUCKET,
  trainingInputMode,
  type TrainingAssetKind,
} from "@/lib/constants/elaya-training";
import { GIA_DOMAINS, DOMAIN_LABELS, type GiaDomain } from "@/lib/constants/domains";
import type { TrainingAssetRow } from "@/lib/types/elaya-training";

interface TrainingAssetFormModalProps {
  open:     boolean;
  onClose:  () => void;
  /** Existing row when editing; null when creating. */
  editing:  TrainingAssetRow | null;
  /** Pre-selected kind for a fresh create (e.g. the "Set up company facts" CTA → 'fact'). */
  defaultKind?: TrainingAssetKind;
  /** Called with the saved row so the parent updates its list without a refetch. */
  onSaved:  (row: TrainingAssetRow, wasEdit: boolean) => void;
}

const inputBase: React.CSSProperties = {
  width:        "100%",
  height:       "2.5rem",
  padding:      "0 var(--space-3)",
  background:   "var(--theme-paper)",
  border:       "1px solid var(--theme-paper-border)",
  borderRadius: "var(--radius-md)",
  fontSize:     "var(--text-sm)",
  color:        "var(--theme-text-primary)",
  outline:      "none",
};

const selectBase: React.CSSProperties = {
  ...inputBase,
  appearance:       "none",
  WebkitAppearance: "none",
  paddingRight:     "var(--space-8)",
  cursor:           "pointer",
};

const chevronStyle: React.CSSProperties = {
  position:      "absolute",
  right:         "var(--space-3)",
  top:           "50%",
  transform:     "translateY(-50%)",
  width:         "1rem",
  height:        "1rem",
  strokeWidth:   1.5,
  pointerEvents: "none",
  color:         "var(--theme-text-tertiary)",
  flexShrink:    0,
};

const requiredStar = <span style={{ color: "var(--color-danger)" }}>*</span>;

export function TrainingAssetFormModal({
  open,
  onClose,
  editing,
  defaultKind,
  onSaved,
}: TrainingAssetFormModalProps) {
  const toast = useToast;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind]               = useState<TrainingAssetKind>("image");
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl]                 = useState("");
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);
  const [tags, setTags]               = useState<string[]>([]);
  const [tagDraft, setTagDraft]       = useState("");
  const [domain, setDomain]           = useState<GiaDomain | "">("");
  const [sendOrder, setSendOrder]     = useState("0");
  const [active, setActive]           = useState(true);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Reset on open / when the editing target changes (editing wins, else defaults).
  useEffect(() => {
    if (!open) return;
    const initialKind = editing?.kind ?? defaultKind ?? "image";
    setKind(initialKind);
    setTitle(editing?.title ?? (initialKind === "fact" ? "Company Facts" : ""));
    setDescription(editing?.description ?? "");
    setUrl(editing?.url ?? "");
    setStoragePath(editing?.storage_path ?? null);
    setPreviewUrl(editing?.url ?? null);
    setTags(editing?.tags ?? []);
    setTagDraft("");
    setDomain((editing?.domain as GiaDomain | null) ?? "");
    setSendOrder(String(editing?.send_order ?? 0));
    setActive(editing?.active ?? true);
    setError(null);
  }, [open, editing, defaultKind]);

  const mode = trainingInputMode(kind);
  const uploadHint = TRAINING_UPLOAD_HINTS[kind];

  // When the kind changes input mode, clear the stale source so it can't carry over.
  function handleKindChange(next: TrainingAssetKind) {
    const prevMode = trainingInputMode(kind);
    const nextMode = trainingInputMode(next);
    setKind(next);
    if (prevMode !== nextMode) {
      setUrl("");
      setStoragePath(null);
      setPreviewUrl(null);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadHint && file.size > uploadHint.maxMb * 1024 * 1024) {
      setError(`File must be ${uploadHint.maxMb} MB or smaller.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "bin";
      // crypto.randomUUID() in an event handler (not render) — fine. Flat path.
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: storageError } = await supabase.storage
        .from(TRAINING_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (storageError) {
        console.error("[elaya-training] storage upload error:", storageError);
        setError(`Upload failed: ${storageError.message}`);
        return;
      }
      // Public bucket → a plain public url (no signing). Path is what we persist;
      // publicUrl is the preview + what the send path mints again on read.
      const { data: { publicUrl } } = supabase.storage.from(TRAINING_BUCKET).getPublicUrl(path);
      setStoragePath(path);
      setPreviewUrl(publicUrl);
      // A fresh upload supersedes any pasted link for a media asset.
      setUrl("");
    } catch {
      setError("Something went wrong during upload.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function addTag() {
    const next = tagDraft.trim().toLowerCase();
    if (!next) return;
    if (tags.length >= 10) {
      setError("You can add at most 10 tags.");
      return;
    }
    if (!tags.includes(next)) setTags((prev) => [...prev, next]);
    setTagDraft("");
  }

  function onTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !tagDraft && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  async function handleSave() {
    // Client-side guard by input mode (mirrors the schema refines, friendlier copy).
    if (!title.trim()) {
      setError("Give this asset a title.");
      return;
    }
    if (mode === "link" && !url.trim()) {
      setError("A link asset needs a link.");
      return;
    }
    if (mode === "text" && !description.trim()) {
      setError("Write the company facts before saving.");
      return;
    }
    if (mode === "media" && !storagePath && !url.trim()) {
      setError("Upload a file or paste a link for this asset.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      if (editing?.id) fd.append("id", editing.id);
      fd.append("kind", kind);
      fd.append("title", title);
      fd.append("description", description);
      // Send the stored PATH, never the preview public url. A media asset may carry a
      // pasted link instead of an upload; both are honoured by the schema.
      if (url.trim()) fd.append("url", url.trim());
      if (storagePath) fd.append("storagePath", storagePath);
      fd.append("tags", JSON.stringify(tags));
      if (domain) fd.append("domain", domain);
      fd.append("sendOrder", sendOrder || "0");
      fd.append("active", active ? "true" : "false");

      const result = await upsertTrainingAsset({ data: null, error: null }, fd);
      if (result.error || !result.data) {
        setError(result.error ?? "Could not save the asset.");
        return;
      }
      toast.success(editing ? "Asset updated." : "Asset added.");
      onSaved(result.data, !!editing);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const busy = uploading || saving;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={editing ? "Edit Asset" : "Add Asset"}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleSave}
            disabled={busy}
            loading={saving}
            style={{ minWidth: "7rem" }}
          >
            {saving ? "Saving…" : editing ? "Save" : "Add Asset"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        {error && (
          <p
            style={{
              fontSize:     "var(--text-sm)",
              color:        "var(--color-danger-text)",
              background:   "var(--color-danger-light)",
              border:       "1px solid var(--color-danger)",
              borderRadius: "var(--radius-md)",
              padding:      "var(--space-3)",
              margin:       0,
            }}
          >
            {error}
          </p>
        )}

        {/* Kind */}
        <div>
          <label htmlFor="ta-kind" className="label-micro block mb-2">
            Type {requiredStar}
          </label>
          <div style={{ position: "relative" }}>
            <select
              id="ta-kind"
              value={kind}
              onChange={(e) => handleKindChange(e.target.value as TrainingAssetKind)}
              style={selectBase}
            >
              {TRAINING_ASSET_KIND_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <ChevronDown style={chevronStyle} />
          </div>
        </div>

        {/* Conditional source by input mode */}
        {mode === "text" ? (
          <div>
            <label htmlFor="ta-facts" className="label-micro block mb-2">
              {kind === "fact" ? "Company Facts" : "Text"} {requiredStar}
            </label>
            <textarea
              id="ta-facts"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              placeholder="What Elaya should know about the company, services, and tone — the only source of company facts she may state to a customer."
              className="serene-input"
              style={{ ...inputBase, height: "auto", padding: "var(--space-3)", resize: "vertical", lineHeight: "var(--leading-normal)" }}
            />
          </div>
        ) : mode === "link" ? (
          <div>
            <label htmlFor="ta-url" className="label-micro block mb-2">
              Link {requiredStar}
            </label>
            <input
              id="ta-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="serene-input"
              style={inputBase}
            />
          </div>
        ) : (
          // media — upload a file OR paste a link
          <div>
            <label className="label-micro block mb-2">
              File or link {requiredStar}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={uploadHint?.accept}
              onChange={handleFileChange}
              style={{ display: "none" }}
              id="ta-file-input"
            />
            {storagePath || previewUrl ? (
              <div
                style={{
                  display:      "flex",
                  gap:          "var(--space-4)",
                  alignItems:   "center",
                  padding:      "var(--space-3)",
                  background:   "var(--theme-paper-subtle)",
                  border:       "1px solid var(--theme-paper-border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div
                  style={{
                    width: "56px", height: "56px", borderRadius: "var(--radius-sm)",
                    background: "var(--theme-canvas)", flexShrink: 0, overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <FileText style={{ width: "1.25rem", height: "1.25rem", color: "var(--theme-canvas-text)", strokeWidth: 1.5 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-primary)", margin: 0 }}>
                    {storagePath ? "File uploaded" : "Linked"}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    style={{
                      marginTop: "var(--space-1)", fontSize: "var(--text-xs)",
                      color: "var(--theme-accent)", background: "none", border: "none",
                      cursor: busy ? "not-allowed" : "pointer", padding: 0,
                    }}
                  >
                    Replace file
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  width: "100%", display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: "var(--space-2)", padding: "var(--space-8) var(--space-4)",
                  background: "var(--theme-paper-subtle)", border: "1px dashed var(--theme-paper-border)",
                  borderRadius: "var(--radius-md)", cursor: uploading ? "wait" : "pointer",
                  color: "var(--theme-text-secondary)",
                }}
              >
                {uploading ? (
                  <>
                    <Spinner size="md" />
                    <span style={{ fontSize: "var(--text-sm)" }}>Uploading…</span>
                  </>
                ) : (
                  <>
                    <UploadCloud style={{ width: "1.5rem", height: "1.5rem", strokeWidth: 1.5 }} />
                    <span style={{ fontSize: "var(--text-sm)" }}>Click to upload a file</span>
                    {uploadHint && (
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
                        up to {uploadHint.maxMb} MB
                      </span>
                    )}
                  </>
                )}
              </button>
            )}
            {/* Paste-a-link alternative for media kinds (satisfies the refine via url) */}
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="…or paste a link instead (https://…)"
              className="serene-input"
              style={{ ...inputBase, marginTop: "var(--space-2)" }}
            />
          </div>
        )}

        {/* Title */}
        <div>
          <label htmlFor="ta-title" className="label-micro block mb-2">
            Title {requiredStar}
          </label>
          <input
            id="ta-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 2026 Concierge Brochure"
            className="serene-input"
            style={inputBase}
          />
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="ta-tags" className="label-micro block mb-2">Tags</label>
          {tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
              {tags.map((t) => (
                <span
                  key={t}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
                    padding: "2px var(--space-2)", background: "var(--theme-accent-surface)",
                    color: "var(--theme-accent)", borderRadius: "var(--radius-full)",
                    fontSize: "var(--text-xs)",
                  }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    aria-label={`Remove ${t}`}
                    style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "inline-flex" }}
                  >
                    <X style={{ width: 12, height: 12, strokeWidth: 2 }} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            id="ta-tags"
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKeyDown}
            onBlur={addTag}
            placeholder="Add a tag and press Enter (e.g. wedding, dubai)"
            className="serene-input"
            style={inputBase}
          />
        </div>

        {/* Domain + Send order — two-up */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div>
            <label htmlFor="ta-domain" className="label-micro block mb-2">Domain</label>
            <div style={{ position: "relative" }}>
              <select
                id="ta-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value as GiaDomain | "")}
                style={selectBase}
              >
                <option value="">All domains</option>
                {GIA_DOMAINS.map((d) => (
                  <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
                ))}
              </select>
              <ChevronDown style={chevronStyle} />
            </div>
          </div>
          <div>
            <label htmlFor="ta-order" className="label-micro block mb-2">Send order</label>
            <input
              id="ta-order"
              type="number"
              min={0}
              value={sendOrder}
              onChange={(e) => setSendOrder(e.target.value)}
              className="serene-input"
              style={inputBase}
            />
          </div>
        </div>

        {/* Active */}
        <Toggle
          checked={active}
          onChange={setActive}
          label="Active — Elaya may send this to customers"
        />
      </div>
    </Modal>
  );
}
