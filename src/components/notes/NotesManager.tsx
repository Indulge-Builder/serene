"use client";

import { useMemo, useState, useTransition } from "react";
import { m as motion } from "framer-motion";
import { Plus, Pencil, Trash2, SlidersHorizontal, NotebookPen } from "lucide-react";
import { MotionButton, MOTION_BUTTON_DEFAULTS } from "@/components/ui/MotionButton";
import { SearchBar } from "@/components/ui/SearchBar";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoteFormModal } from "./NoteFormModal";
import { deleteNote } from "@/lib/actions/elaya-notes";
import { useToast } from "@/hooks/useToast";
import { formatRelativeTime } from "@/lib/utils/dates";
import { EASE_OUT_EXPO, EXIT_DURATION } from "@/lib/constants/motion";
import { ELAYA_NOTES_MAX_PER_USER } from "@/lib/constants/elaya-notes";
import type { ElayaNoteRow } from "@/lib/types/elaya-notes";

interface NotesManagerProps {
  initialNotes: ElayaNoteRow[];
}

const CARD_HOVER = {
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = "var(--shadow-2)";
    e.currentTarget.style.transform = "translateY(-1px)";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = "var(--shadow-1)";
    e.currentTarget.style.transform = "translateY(0)";
  },
} as const;

export function NotesManager({ initialNotes }: NotesManagerProps) {
  const toast = useToast;
  const [notes, setNotes]           = useState<ElayaNoteRow[]>(initialNotes);
  const [search, setSearch]         = useState("");
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<ElayaNoteRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ElayaNoteRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const atCap = notes.length >= ELAYA_NOTES_MAX_PER_USER;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const sorted = [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (!q) return sorted;
    return sorted.filter((row) =>
      `${row.title} ${row.body}`.toLowerCase().includes(q),
    );
  }, [notes, search]);

  const activeFilterCount = search.trim() ? 1 : 0;

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row: ElayaNoteRow) {
    setEditing(row);
    setModalOpen(true);
  }

  function handleSaved(row: ElayaNoteRow, wasEdit: boolean) {
    setNotes((prev) =>
      wasEdit || prev.some((n) => n.id === row.id)
        ? prev.map((n) => (n.id === row.id ? row : n))
        : [row, ...prev],
    );
  }

  function handleDelete(row: ElayaNoteRow) {
    setDeletingId(row.id);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", row.id);
      const result = await deleteNote(fd);
      if (result.error) {
        toast.danger(result.error);
      } else {
        setNotes((prev) => prev.filter((n) => n.id !== row.id));
        toast.success("Note deleted.");
      }
      setDeletingId(null);
      setConfirmTarget(null);
    });
  }

  return (
    <>
      {/* Row 1 — page header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Notes<span className="page-title-dot">.</span>
        </h1>
        <MotionButton
          {...MOTION_BUTTON_DEFAULTS}
          variant="primary"
          type="button"
          iconMotion="rotate"
          onClick={openCreate}
          disabled={atCap}
          title={atCap ? `You've reached the ${ELAYA_NOTES_MAX_PER_USER}-note limit.` : undefined}
          style={{ boxShadow: "var(--shadow-accent-glow)", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          <Plus style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
          New Note
        </MotionButton>
      </div>

      {/* Intro line — what these notes are for */}
      <p
        className="mb-4"
        style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)", maxWidth: "60ch" }}
      >
        Write what you&rsquo;d like Elaya to keep in mind about your work — accounts you own,
        how you like things done, anything worth remembering. She reads your notes when she
        helps you. Only you can see them.
      </p>

      {/* Row 2 — filter bar */}
      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <SlidersHorizontal className="w-4 h-4" style={{ color: "var(--theme-text-tertiary)", strokeWidth: 1.5 }} />
            {activeFilterCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-medium leading-none"
                style={{ background: "var(--theme-accent)", color: "var(--theme-accent-fg)" }}
              >
                {activeFilterCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-[160px]" style={{ flex: "1 1 200px" }}>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search your notes…"
              size="sm"
            />
          </div>
          <span
            className="ml-auto text-xs whitespace-nowrap"
            style={{ color: "var(--theme-text-tertiary)", fontFamily: "var(--font-sans)" }}
          >
            {filtered.length} {filtered.length === 1 ? "note" : "notes"}
          </span>
        </div>
      </div>

      {/* Row 3 — note cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={notes.length === 0 ? "No notes yet." : "Nothing matches your search."}
          description={
            notes.length === 0
              ? "Write your first note so Elaya knows how you like to work."
              : "Try a different word."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((row, i) => (
            <NoteCard
              key={row.id}
              row={row}
              index={i}
              isDeleting={isPending && deletingId === row.id}
              onEdit={() => openEdit(row)}
              onDelete={() => setConfirmTarget(row)}
            />
          ))}
        </div>
      )}

      <NoteFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        dialogKey="delete-note"
        title="Delete note?"
        body={
          confirmTarget ? (
            <>
              <strong style={{ color: "var(--theme-text-primary)" }}>
                {confirmTarget.title || "This note"}
              </strong>{" "}
              will be permanently deleted. This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        danger
        pending={isPending && deletingId !== null}
        onConfirm={() => confirmTarget && handleDelete(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </>
  );
}

// ─── A single note card ───
function NoteCard({
  row, index, isDeleting, onEdit, onDelete,
}: {
  row: ElayaNoteRow;
  index: number;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const staggerDelay = Math.min(index * 80, 320);
  const title = row.title.trim();
  const body = row.body.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: EXIT_DURATION, delay: staggerDelay / 1000, ease: EASE_OUT_EXPO }}
      style={{
        display: "flex", alignItems: "flex-start", gap: "var(--space-4)",
        padding: "var(--space-4) var(--space-5)", background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)", borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-1)",
        transition: "box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)",
      }}
      {...CARD_HOVER}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <p
            style={{
              fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)",
              color: "var(--theme-text-primary)", margin: 0, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
            }}
          >
            {title || "Untitled note"}
          </p>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--theme-text-tertiary)", flexShrink: 0 }}>
            {formatRelativeTime(row.updated_at)}
          </span>
        </div>
        {body && (
          <p
            style={{
              fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)",
              margin: "var(--space-1) 0 0", display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              lineHeight: "var(--leading-normal)", whiteSpace: "pre-wrap",
            }}
          >
            {body}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit note"
          style={actionBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--theme-accent-muted)"; e.currentTarget.style.color = "var(--theme-text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--theme-paper-border)"; e.currentTarget.style.color = "var(--theme-text-secondary)"; }}
        >
          <Pencil style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Delete note"
          style={actionBtnStyle}
          onMouseEnter={(e) => { if (isDeleting) return; e.currentTarget.style.borderColor = "var(--color-danger)"; e.currentTarget.style.color = "var(--color-danger-text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--theme-paper-border)"; e.currentTarget.style.color = "var(--theme-text-secondary)"; }}
        >
          {isDeleting ? <Spinner size="sm" /> : (<><Trash2 style={{ width: 12, height: 12, strokeWidth: 1.5 }} />Delete</>)}
        </button>
      </div>
    </motion.div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
  padding: "var(--space-1) var(--space-3)", background: "transparent",
  border: "1px solid var(--theme-paper-border)", borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)",
  color: "var(--theme-text-secondary)", cursor: "pointer",
  transition: "var(--transition-interactive)", whiteSpace: "nowrap",
};
