"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Plus, SlidersHorizontal, NotebookPen } from "lucide-react";
import { MotionButton, MOTION_BUTTON_DEFAULTS } from "@/components/ui/MotionButton";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { CondensingPageHeader } from "@/components/layout/CondensingPageHeader";
import { PageControls } from "@/components/layout/PageControls";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { EditDeleteActions } from "@/components/ui/RowActions";
import { MotionRow } from "@/components/ui/RowMotion";
import { NoteFormModal } from "./NoteFormModal";
import { deleteNote } from "@/lib/actions/elaya-notes";
import { useToast } from "@/hooks/useToast";
import { formatRelativeTime } from "@/lib/utils/dates";
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

  // Undo-instead-of-confirm (polish §06): the row exits immediately (row
  // choreography), a charcoal undo toast counts down 5s, and the server
  // delete commits ONLY when the window expires. Undo re-enters the row.
  function handleDelete(row: ElayaNoteRow) {
    setNotes((prev) => prev.filter((n) => n.id !== row.id));
    const restore = () =>
      setNotes((prev) =>
        prev.some((n) => n.id === row.id) ? prev : [row, ...prev],
      );
    toast.undo("Note deleted", {
      action: { label: "Undo", onClick: restore },
      onTimeout: () => {
        const fd = new FormData();
        fd.append("id", row.id);
        void deleteNote(fd).then((result) => {
          if (result.error) {
            restore();
            toast.danger(result.error);
          }
        });
      },
    });
  }

  return (
    <>
      {/* Row 1 — page header (sticky, condenses on scroll — polish §07) */}
      <CondensingPageHeader title="Notes">
        {/* At the cap the button is disabled — the reason rides the pill (the
            wrapper still hears the hover) and is spoken as part of its name. */}
        <Tooltip label={`You've reached the ${ELAYA_NOTES_MAX_PER_USER}-note limit`} side="bottom" disabled={!atCap}>
        <MotionButton
          {...MOTION_BUTTON_DEFAULTS}
          variant="primary"
          type="button"
          iconMotion="rotate"
          onClick={openCreate}
          disabled={atCap}
          style={{ boxShadow: "var(--shadow-accent-glow)", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          <Plus style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
          New Note
          {atCap && <span className="sr-only">You&apos;ve reached the {ELAYA_NOTES_MAX_PER_USER}-note limit.</span>}
        </MotionButton>
        </Tooltip>
        {TOP_BAR_ENABLED && <PageControls isPrivileged={false} />}
      </CondensingPageHeader>

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
        notes.length === 0 ? (
          // One poetic line, one primary action, Elaya named.
          <EmptyState
            icon={NotebookPen}
            framed
            title="Nothing here yet — beautifully so."
            description="Notes you write will appear here, and Elaya will keep them in mind whenever she helps you."
            action={
              <Button
                variant="primary"
                iconLeft={Plus}
                onClick={openCreate}
                disabled={atCap}
              >
                Add a note
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={NotebookPen}
            framed
            title="Nothing matches your search."
            description="Try a different word."
          />
        )
      ) : (
        <div className="flex flex-col">
          {/* Row choreography (polish §02) — deletes lift out, undo re-enters.
              initial={false}: the first page render never cascades. */}
          <AnimatePresence initial={false}>
            {filtered.map((row) => (
              <MotionRow key={row.id} style={{ paddingBottom: "var(--space-2)" }}>
                <NoteCard
                  row={row}
                  onEdit={() => openEdit(row)}
                  onDelete={() => handleDelete(row)}
                />
              </MotionRow>
            ))}
          </AnimatePresence>
        </div>
      )}

      <NoteFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSaved={handleSaved}
      />
    </>
  );
}

// ─── A single note card ───
// Plain div — MotionRow owns enter/exit (row motion wins inside lists; never
// stack a second entrance animation on the card itself).
function NoteCard({
  row, onEdit, onDelete,
}: {
  row: ElayaNoteRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const title = row.title.trim();
  const body = row.body.trim();

  return (
    <div
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

      <EditDeleteActions onEdit={onEdit} onDelete={onDelete} subject="note" />
    </div>
  );
}
