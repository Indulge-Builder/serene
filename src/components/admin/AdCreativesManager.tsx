"use client";

import { useMemo, useState, useTransition } from "react";
import { m as motion } from "framer-motion";
import { Plus, Pencil, Trash2, Film, SlidersHorizontal } from "lucide-react";
import { MotionButton, MOTION_BUTTON_DEFAULTS } from "@/components/ui/MotionButton";
import { SearchBar } from "@/components/ui/SearchBar";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdCreativeFormModal } from "./AdCreativeFormModal";
import { deleteAdCreative } from "@/lib/actions/ad-creatives";
import { useToast } from "@/hooks/useToast";
import { EASE_OUT_EXPO, EXIT_DURATION } from "@/lib/constants/motion";
import type { AdCreative } from "@/lib/types/database";

interface AdCreativesManagerProps {
  initialCreatives: AdCreative[];
  campaignKeys:     string[];
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

export function AdCreativesManager({ initialCreatives, campaignKeys }: AdCreativesManagerProps) {
  const toast = useToast;
  const [creatives, setCreatives] = useState<AdCreative[]>(initialCreatives);
  const [search, setSearch]       = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<AdCreative | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdCreative | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return creatives;
    return creatives.filter((row) => {
      const haystack = [
        row.campaign_key,
        row.ad_name ?? "",
        row.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [creatives, search]);

  const activeFilterCount = search.trim() ? 1 : 0;

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row: AdCreative) {
    setEditing(row);
    setModalOpen(true);
  }

  function handleSaved(row: AdCreative, wasEdit: boolean) {
    setCreatives((prev) =>
      wasEdit ? prev.map((c) => (c.id === row.id ? row : c)) : [row, ...prev]
    );
  }

  function handleDelete(row: AdCreative) {
    setDeletingId(row.id);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", row.id);
      const result = await deleteAdCreative(fd);
      if (result.error) {
        toast.danger(result.error);
      } else {
        setCreatives((prev) => prev.filter((c) => c.id !== row.id));
        toast.success("Creative deleted.");
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
          Ad Creatives<span className="page-title-dot">.</span>
        </h1>
        <MotionButton
          {...MOTION_BUTTON_DEFAULTS}
          variant="primary"
          type="button"
          iconMotion="rotate"
          onClick={openCreate}
          style={{ boxShadow: "var(--shadow-accent-glow)", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          <Plus style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
          Add Creative
        </MotionButton>
      </div>

      {/* Row 2 — filter bar */}
      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <SlidersHorizontal
              className="w-4 h-4"
              style={{ color: "var(--theme-text-tertiary)", strokeWidth: 1.5 }}
            />
            {activeFilterCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-medium leading-none"
                style={{
                  background: "var(--theme-accent)",
                  color:      "var(--theme-accent-fg)",
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-[160px]" style={{ flex: "1 1 200px" }}>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by campaign or ad name…"
              size="sm"
            />
          </div>

          <span
            className="ml-auto text-xs whitespace-nowrap"
            style={{ color: "var(--theme-text-tertiary)", fontFamily: "var(--font-sans)" }}
          >
            {filtered.length} {filtered.length === 1 ? "creative" : "creatives"}
          </span>
        </div>
      </div>

      {/* Row 3 — card list */}
      {filtered.length === 0 ? (
        <EmptyState
          variant="hero"
          title={
            creatives.length === 0
              ? "No ad creatives yet."
              : "Nothing matches your search."
          }
          description={
            creatives.length === 0
              ? "Add one to bring campaigns to life on lead dossiers."
              : "Try a different campaign or ad name."
          }
          style={{ padding: "var(--space-20) var(--space-8)" }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((row, i) => (
            <CreativeCard
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

      <AdCreativeFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        campaignKeys={campaignKeys}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        dialogKey="delete-creative"
        title="Delete creative?"
        body={
          confirmTarget ? (
            <>
              The creative for{" "}
              <strong style={{ color: "var(--theme-text-primary)" }}>
                {confirmTarget.campaign_key}
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

function CreativeCard({
  row,
  index,
  isDeleting,
  onEdit,
  onDelete,
}: {
  row:        AdCreative;
  index:      number;
  isDeleting: boolean;
  onEdit:     () => void;
  onDelete:   () => void;
}) {
  const staggerDelay = Math.min(index * 80, 320);
  const displayTitle = row.ad_name?.trim() || row.campaign_key;
  const subtitle = row.campaign_key;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: EXIT_DURATION, delay: staggerDelay / 1000, ease: EASE_OUT_EXPO }}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "var(--space-4)",
        padding:      "var(--space-4) var(--space-5)",
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow:    "var(--shadow-1)",
        transition:   "box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)",
      }}
      {...CARD_HOVER}
    >
      <div
        style={{
          width:          "48px",
          height:         "64px",
          borderRadius:   "var(--radius-sm)",
          overflow:       "hidden",
          background:     "var(--theme-canvas)",
          flexShrink:     0,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
        }}
      >
        {row.video_url ? (
          <video
            src={row.video_url}
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Film
            style={{ width: "1.25rem", height: "1.25rem", color: "var(--theme-canvas-text)", strokeWidth: 1.5 }}
          />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily:   "var(--font-sans)",
            fontSize:     "var(--text-sm)",
            fontWeight:   "var(--weight-semibold)",
            color:        "var(--theme-text-primary)",
            margin:       0,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}
        >
          {displayTitle}
        </p>
        <p
          style={{
            fontSize:     "var(--text-xs)",
            color:        "var(--theme-text-tertiary)",
            margin:       "2px 0 0",
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}
        >
          {subtitle}
        </p>
        {row.notes?.trim() && (
          <p
            style={{
              fontSize:     "var(--text-xs)",
              color:        "var(--theme-text-secondary)",
              margin:       "var(--space-1) 0 0",
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
            }}
          >
            {row.notes.trim()}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit creative"
          style={actionBtnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--theme-accent-muted)";
            e.currentTarget.style.color = "var(--theme-text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--theme-paper-border)";
            e.currentTarget.style.color = "var(--theme-text-secondary)";
          }}
        >
          <Pencil style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Delete creative"
          style={actionBtnStyle}
          onMouseEnter={(e) => {
            if (isDeleting) return;
            e.currentTarget.style.borderColor = "var(--color-danger)";
            e.currentTarget.style.color = "var(--color-danger-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--theme-paper-border)";
            e.currentTarget.style.color = "var(--theme-text-secondary)";
          }}
        >
          {isDeleting ? (
            <Spinner size="sm" />
          ) : (
            <>
              <Trash2 style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
              Delete
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  display:        "inline-flex",
  alignItems:     "center",
  gap:            "var(--space-1)",
  padding:        "var(--space-1) var(--space-3)",
  background:     "transparent",
  border:         "1px solid var(--theme-paper-border)",
  borderRadius:   "var(--radius-sm)",
  fontFamily:     "var(--font-sans)",
  fontSize:       "var(--text-xs)",
  fontWeight:     "var(--weight-medium)",
  color:          "var(--theme-text-secondary)",
  cursor:         "pointer",
  transition:     "var(--transition-interactive)",
  whiteSpace:     "nowrap",
};
