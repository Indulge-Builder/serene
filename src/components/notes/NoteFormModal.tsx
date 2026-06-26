"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { DictationButton } from "@/components/ui/DictationButton";
import { upsertNote } from "@/lib/actions/elaya-notes";
import { useToast } from "@/hooks/useToast";
import {
  ELAYA_NOTE_TITLE_MAX,
  ELAYA_NOTE_BODY_MAX,
} from "@/lib/constants/elaya-notes";
import type { ElayaNoteRow } from "@/lib/types/elaya-notes";

interface NoteFormModalProps {
  open:    boolean;
  onClose: () => void;
  /** Existing row when editing; null when creating. */
  editing: ElayaNoteRow | null;
  /** Called with the saved row so the parent updates its list without a refetch. */
  onSaved: (row: ElayaNoteRow, wasEdit: boolean) => void;
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

export function NoteFormModal({ open, onClose, editing, onSaved }: NoteFormModalProps) {
  const toast = useToast;
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [title, setTitle] = useState("");
  const [body, setBody]   = useState("");
  const [saving, setSaving] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open / when the editing target changes.
  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setBody(editing?.body ?? "");
    setError(null);
  }, [open, editing]);

  async function handleSave() {
    if (!title.trim() && !body.trim()) {
      setError("Write something before saving.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      if (editing?.id) fd.append("id", editing.id);
      fd.append("title", title);
      fd.append("body", body);

      const result = await upsertNote({ data: null, error: null }, fd);
      if (result.error || !result.data) {
        setError(result.error ?? "Could not save the note.");
        return;
      }
      toast.success(editing ? "Note updated." : "Note saved.");
      onSaved(result.data, !!editing);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || dictating;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={editing ? "Edit Note" : "New Note"}
      maxWidth="max-w-xl"
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
            {saving ? "Saving…" : editing ? "Save" : "Save Note"}
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

        {/* Title */}
        <div>
          <label htmlFor="note-title" className="label-micro block mb-2">Title</label>
          <input
            id="note-title"
            type="text"
            value={title}
            maxLength={ELAYA_NOTE_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. How I work my GMR leads"
            className="serene-input"
            style={inputBase}
            autoFocus
          />
        </div>

        {/* Body — with voice dictation (the shared cluster) */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <label htmlFor="note-body" className="label-micro">Note</label>
            <DictationButton
              variant="inline"
              what="a note"
              disabled={saving}
              onBusyChange={setDictating}
              onTranscript={(text) =>
                setBody((prev) => {
                  const next = prev.trim() ? `${prev.trim()} ${text}` : text;
                  return next.slice(0, ELAYA_NOTE_BODY_MAX);
                })
              }
              onError={(message) => setError(message)}
            />
          </div>
          <textarea
            id="note-body"
            ref={bodyRef}
            value={body}
            maxLength={ELAYA_NOTE_BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="What should Elaya remember? e.g. I own the GMR account; I chase cold leads on Mondays; always give me the number first, then the context."
            className="serene-input"
            style={{ ...inputBase, height: "auto", padding: "var(--space-3)", resize: "vertical", lineHeight: "var(--leading-normal)" }}
          />
          <p
            className="mt-1 text-right"
            style={{ fontSize: "var(--text-2xs)", color: "var(--theme-text-tertiary)" }}
          >
            {body.length} / {ELAYA_NOTE_BODY_MAX}
          </p>
        </div>
      </div>
    </Modal>
  );
}
