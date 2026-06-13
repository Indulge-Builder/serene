"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, Film, ChevronDown } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { createClient } from "@/lib/supabase/client";
import { upsertAdCreative } from "@/lib/actions/ad-creatives";
import { useToast } from "@/hooks/useToast";
import { beautifyCampaignTitle } from "@/lib/utils/campaigns";
import type { AdCreative } from "@/lib/types/database";

const BUCKET = "ad-creatives";
const MAX_VIDEO_MB = 100;

interface AdCreativeFormModalProps {
  open:          boolean;
  onClose:       () => void;
  /** Existing row when editing; null when creating. */
  editing:       AdCreative | null;
  /** Known utm_campaign names for the dropdown. */
  campaignKeys:  string[];
  /** Called with the saved row so the parent can update its list without a refetch. */
  onSaved:       (row: AdCreative, wasEdit: boolean) => void;
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

export function AdCreativeFormModal({
  open,
  onClose,
  editing,
  campaignKeys,
  onSaved,
}: AdCreativeFormModalProps) {
  const toast = useToast;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [campaignKey, setCampaignKey] = useState("");
  const [adName, setAdName]           = useState("");
  const [notes, setNotes]             = useState("");
  const [videoUrl, setVideoUrl]       = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Reset fields whenever the modal opens (create) or the editing target changes.
  useEffect(() => {
    if (!open) return;
    setCampaignKey(editing?.campaign_key ?? "");
    setAdName(editing?.ad_name ?? "");
    setNotes(editing?.notes ?? "");
    setVideoUrl(editing?.video_url ?? null);
    setError(null);
  }, [open, editing]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setError("Please select a video file.");
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`Video must be ${MAX_VIDEO_MB} MB or smaller.`);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const supabase = createClient();
      const ext  = file.name.split(".").pop() || "mp4";
      // Stable-ish unique path; not derived from Date.now in render — fine here (event handler).
      const path = `${crypto.randomUUID()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });

      if (storageError) {
        console.error("[ad-creatives] storage upload error:", storageError);
        setError(`Upload failed: ${storageError.message}`);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setVideoUrl(publicUrl);
    } catch {
      setError("Something went wrong during upload.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!campaignKey.trim()) {
      setError("Pick a campaign.");
      return;
    }
    if (!videoUrl) {
      setError("Upload a video first.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const fd = new FormData();
      if (editing?.id) fd.append("id", editing.id);
      fd.append("campaign_key", campaignKey);
      fd.append("video_url", videoUrl);
      fd.append("ad_name", adName);
      fd.append("notes", notes);

      const result = await upsertAdCreative({ data: null, error: null }, fd);

      if (result.error || !result.data) {
        setError(result.error ?? "Could not save the creative.");
        return;
      }

      toast.success(editing ? "Creative updated." : "Creative added.");
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
      title={editing ? "Edit Ad Creative" : "Add Ad Creative"}
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
            {saving ? "Saving…" : editing ? "Save" : "Add Creative"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        {error && (
          <p
            style={{
              fontSize: "var(--text-sm)",
              color:    "var(--color-danger-text)",
              background: "var(--color-danger-light)",
              border:   "1px solid var(--color-danger)",
              borderRadius: "var(--radius-md)",
              padding:  "var(--space-3)",
              margin:   0,
            }}
          >
            {error}
          </p>
        )}

        {/* Campaign */}
        <div>
          <label htmlFor="ac-campaign" className="label-micro block mb-2">
            Campaign <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <div style={{ position: "relative" }}>
            <select
              id="ac-campaign"
              value={campaignKey}
              onChange={(e) => setCampaignKey(e.target.value)}
              disabled={!!editing}
              style={{ ...selectBase, cursor: editing ? "not-allowed" : "pointer", opacity: editing ? 0.6 : 1 }}
            >
              <option value="">Select a campaign…</option>
              {/* When editing, the stored key may not be in the active campaign list — show it regardless. */}
              {editing && !campaignKeys.includes(editing.campaign_key) && (
                <option value={editing.campaign_key}>{beautifyCampaignTitle(editing.campaign_key)}</option>
              )}
              {campaignKeys.map((k) => (
                <option key={k} value={k}>{beautifyCampaignTitle(k)}</option>
              ))}
            </select>
            <ChevronDown style={chevronStyle} />
          </div>
          {editing && (
            <p style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", margin: "var(--space-1) 0 0" }}>
              Campaign cannot be changed after creation. Delete and re-add to relink.
            </p>
          )}
        </div>

        {/* Video uploader */}
        <div>
          <label className="label-micro block mb-2">
            Video <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
            id="ac-video-input"
          />

          {videoUrl ? (
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
              <video
                src={videoUrl}
                muted
                playsInline
                style={{
                  width:        "72px",
                  height:       "96px",
                  objectFit:    "cover",
                  borderRadius: "var(--radius-sm)",
                  background:   "var(--theme-canvas)",
                  flexShrink:   0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--theme-text-primary)", margin: 0 }}>
                  <Film style={{ width: "1rem", height: "1rem", strokeWidth: 1.5 }} />
                  Video uploaded
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  style={{
                    marginTop:  "var(--space-1)",
                    fontSize:   "var(--text-xs)",
                    color:      "var(--theme-accent)",
                    background: "none",
                    border:     "none",
                    cursor:     busy ? "not-allowed" : "pointer",
                    padding:    0,
                  }}
                >
                  Replace video
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                width:          "100%",
                display:        "flex",
                flexDirection:  "column",
                alignItems:     "center",
                justifyContent: "center",
                gap:            "var(--space-2)",
                padding:        "var(--space-8) var(--space-4)",
                background:     "var(--theme-paper-subtle)",
                border:         "1px dashed var(--theme-paper-border)",
                borderRadius:   "var(--radius-md)",
                cursor:         uploading ? "wait" : "pointer",
                color:          "var(--theme-text-secondary)",
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
                  <span style={{ fontSize: "var(--text-sm)" }}>Click to upload a vertical (9:16) video</span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
                    MP4 / MOV, up to {MAX_VIDEO_MB} MB
                  </span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Ad name */}
        <div>
          <label htmlFor="ac-ad-name" className="label-micro block mb-2">Ad name</label>
          <input
            id="ac-ad-name"
            type="text"
            value={adName}
            onChange={(e) => setAdName(e.target.value)}
            placeholder="e.g. Goa Resort — Summer Hook"
            className="serene-input"
            style={inputBase}
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="ac-notes" className="label-micro block mb-2">Notes</label>
          <textarea
            id="ac-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal context for the team…"
            className="serene-input"
            style={{ ...inputBase, height: "auto", padding: "var(--space-3)", resize: "vertical", lineHeight: "var(--leading-normal)" }}
          />
        </div>
      </div>
    </Modal>
  );
}
