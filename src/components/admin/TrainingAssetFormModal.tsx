"use client";

import { FormSelect } from '@/components/ui/FormSelect';
import { UploadButton } from '@/components/ui/UploadButton';
import { useEffect, useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { Toggle } from "@/components/ui/Toggle";
import { Checkbox } from "@/components/ui/Checkbox";
import { resolveOutboundMediaType, whatsappMaxBytesFor } from "@/lib/constants/whatsapp";
import { createClient } from "@/lib/supabase/client";
import { upsertTrainingAsset } from "@/lib/actions/elaya-training";
import { useToast } from "@/hooks/useToast";
import {
  TRAINING_ASSET_KIND_LABELS,
  TRAINING_LIBRARY_KINDS,
  TRAINING_TEXT_KINDS,
  TRAINING_UPLOAD_HINTS,
  TRAINING_BUCKET,
  READY_MESSAGE_NAME_TOKEN,
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
  /** Approved files and links a ready message may attach (0252). */
  attachable: TrainingAssetRow[];
  /** Admin / founder: the item may be approved as it is saved. */
  canApprove: boolean;
}

/** What each knowledge kind's text box is for (0252, the pack). */
const TEXT_GUIDE: Partial<Record<TrainingAssetKind, { label: string; placeholder: string }>> = {
  fact:      { label: "The fact", placeholder: "One topic per fact: who we are, membership and price, how expenses work, hours, privacy. Write it exactly as the concierge may say it." },
  story:     { label: "The story", placeholder: "Two or three lines: the moment, what made it hard, how it ended. No names, no exact dates." },
  answer:    { label: "The answer", placeholder: "The question goes in the title; the honest answer here." },
  objection: { label: "The honest answer", placeholder: "What they say goes in the title (\"4 lakh is a lot\"); how we answer, and a story that fits, here." },
  news:      { label: "The news", placeholder: "The fact, its date, where it came from, and one line on how Indulge fits. It drops out of the pack after 60 days." },
  forbidden: { label: "Never say", placeholder: "One per line: names, words or topics the concierge must never mention, in any language." },
};

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


const requiredStar = <span style={{ color: "var(--color-danger-text)" }}>*</span>;

export function TrainingAssetFormModal({
  open,
  onClose,
  editing,
  defaultKind,
  onSaved,
  attachable,
  canApprove,
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
  const [whenToSend, setWhenToSend]   = useState("");
  const [mimeType, setMimeType]       = useState<string | null>(null);
  const [byteSize, setByteSize]       = useState<number | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [approve, setApprove]         = useState(false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Reset on open / when the editing target changes (editing wins, else defaults).
  useEffect(() => {
    if (!open) return;
    const initialKind = editing?.kind ?? defaultKind ?? "image";
    setKind(initialKind);
    setTitle(editing?.title ?? "");
    setDescription(editing?.description ?? "");
    setUrl(editing?.url ?? "");
    setStoragePath(editing?.storage_path ?? null);
    setPreviewUrl(editing?.url ?? null);
    setTags(editing?.tags ?? []);
    setTagDraft("");
    setDomain((editing?.domain as GiaDomain | null) ?? "");
    setSendOrder(String(editing?.send_order ?? 0));
    setActive(editing?.active ?? true);
    setWhenToSend(editing?.when_to_send ?? "");
    setMimeType(editing?.mime_type ?? null);
    setByteSize(editing?.byte_size ?? null);
    setAttachments(editing?.attachments ?? []);
    setApprove(editing?.status === "approved");
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
    // WhatsApp's own rules, checked here so a file never fails later at send (0252).
    if (!resolveOutboundMediaType(file.type)) {
      setError("WhatsApp cannot send this kind of file. Use a JPEG or PNG image, an MP4 video, an MP3 or M4A audio, or a PDF.");
      return;
    }
    const limit = Math.min(whatsappMaxBytesFor(file.type), (uploadHint?.maxMb ?? 16) * 1024 * 1024);
    if (file.size > limit) {
      setError(`This file is over WhatsApp's ${Math.round(limit / (1024 * 1024))} MB limit. Upload a shorter or smaller version, or paste a link (YouTube, Drive) instead.`);
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
      setMimeType(file.type);
      setByteSize(file.size);
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
    if ((mode === "text" || mode === "message") && !description.trim()) {
      setError(mode === "message" ? "Write the message before saving." : "Write the text before saving.");
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
      if (whenToSend.trim()) fd.append("whenToSend", whenToSend.trim());
      if (storagePath && mimeType) fd.append("mimeType", mimeType);
      if (storagePath && byteSize != null) fd.append("byteSize", String(byteSize));
      fd.append("attachments", JSON.stringify(mode === "message" ? attachments : []));
      if (canApprove && approve) fd.append("approve", "true");

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
      error={error ? (
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
      ) : undefined}
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
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

        {/* Kind */}
        <div>
          <label htmlFor="ta-kind" className="label-micro block mb-2">
            Type {requiredStar}
          </label>
          <div style={{ position: "relative" }}>
            <FormSelect
              id="ta-kind"
              value={kind}
              onValueChange={(nextValue) => handleKindChange(nextValue as TrainingAssetKind)}
              style={{ width:        "100%", height:       "2.5rem" }}
            >
              <optgroup label="What the concierge knows">
                {TRAINING_TEXT_KINDS.map((k) => (
                  <option key={k} value={k}>{TRAINING_ASSET_KIND_LABELS[k]}</option>
                ))}
              </optgroup>
              <optgroup label="What can be sent">
                {TRAINING_LIBRARY_KINDS.map((k) => (
                  <option key={k} value={k}>{TRAINING_ASSET_KIND_LABELS[k]}</option>
                ))}
              </optgroup>
            </FormSelect>

          </div>
        </div>

        {/* Conditional source by input mode */}
        {mode === "text" ? (
          <div>
            <label htmlFor="ta-facts" className="label-micro block mb-2">
              {TEXT_GUIDE[kind]?.label ?? "Text"} {requiredStar}
            </label>
            <textarea
              id="ta-facts"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              placeholder={TEXT_GUIDE[kind]?.placeholder ?? ""}
              className="serene-input"
              style={{ ...inputBase, height: "auto", padding: "var(--space-3)", resize: "vertical", lineHeight: "var(--leading-normal)" }}
            />
          </div>
        ) : mode === "message" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div>
              <label htmlFor="ta-message" className="label-micro block mb-2">
                The message {requiredStar}
              </label>
              <textarea
                id="ta-message"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder={`Written once, sent word for word. ${READY_MESSAGE_NAME_TOKEN} becomes their first name.`}
                className="serene-input"
                style={{ ...inputBase, height: "auto", padding: "var(--space-3)", resize: "vertical", lineHeight: "var(--leading-normal)" }}
              />
            </div>
            <div>
              <p className="label-micro" style={{ margin: "0 0 var(--space-2)" }}>Sent after it, in this order</p>
              {attachable.length === 0 ? (
                <p style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", margin: 0 }}>
                  Approve some files or links first; they can then be attached here.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxHeight: "12rem", overflowY: "auto" }}>
                  {attachable.map((a) => {
                    const at = attachments.indexOf(a.id);
                    return (
                      <Checkbox
                        key={a.id}
                        checked={at >= 0}
                        onChange={(on) => setAttachments((prev) => (on ? [...prev, a.id] : prev.filter((x) => x !== a.id)))}
                        label={`${at >= 0 ? `${at + 1}. ` : ""}${a.title} (${TRAINING_ASSET_KIND_LABELS[a.kind]})`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
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
                  <Button
                    variant="control"
                    size="sm"
                    style={{ marginTop: "var(--space-1)" }}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                  >
                    Replace file
                  </Button>
                </div>
              </div>
            ) : (
              <UploadButton
                busy={uploading}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <LogoSpinner size="md" />
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
              </UploadButton>
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

        {/* When to send — the bot reads it, the agent sees it (library items only) */}
        {mode !== "text" && (
          <div>
            <label htmlFor="ta-when" className="label-micro block mb-2">When to send it</label>
            <input
              id="ta-when"
              type="text"
              value={whenToSend}
              onChange={(e) => setWhenToSend(e.target.value)}
              placeholder="e.g. When someone asks what membership includes"
              className="serene-input"
              style={inputBase}
            />
          </div>
        )}

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
                    color: "var(--neu-accent-deep)", borderRadius: "var(--radius-full)",
                    fontSize: "var(--text-xs)",
                  }}
                >
                  {t}
                  <Button
                    variant="ghost"
                    iconOnly size="sm"
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    aria-label={`Remove ${t}`}
                    style={{ display: "inline-flex" }}
                  >
                    <X style={{ width: 12, height: 12, strokeWidth: 2 }} />
                  </Button>
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
        <div className="serene-form-row">
          <div>
            <label htmlFor="ta-domain" className="label-micro block mb-2">Domain</label>
            <div style={{ position: "relative" }}>
              <FormSelect
                id="ta-domain"
                value={domain}
                onValueChange={(nextValue) => setDomain(nextValue as GiaDomain | "")}
                style={{ width:        "100%", height:       "2.5rem" }}
              >
                <option value="">All domains</option>
                {GIA_DOMAINS.map((d) => (
                  <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
                ))}
              </FormSelect>

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
          label="Active: the concierge and the team may use this"
        />
        {canApprove && (
          <Toggle
            checked={approve}
            onChange={setApprove}
            label="Approved: it goes into the next published pack"
          />
        )}
      </div>
    </Modal>
  );
}
