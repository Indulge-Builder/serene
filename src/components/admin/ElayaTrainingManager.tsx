"use client";

import { useMemo, useState, useTransition } from "react";
import { m as motion } from "framer-motion";
import {
  Plus, Pencil, Trash2, SlidersHorizontal, GraduationCap,
  FileText, Link2, Image as ImageIcon, Film, Mic, BookOpen,
} from "lucide-react";
import { MotionButton, MOTION_BUTTON_DEFAULTS } from "@/components/ui/MotionButton";
import { SearchBar } from "@/components/ui/SearchBar";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrainingAssetFormModal } from "./TrainingAssetFormModal";
import { deleteTrainingAsset } from "@/lib/actions/elaya-training";
import { useToast } from "@/hooks/useToast";
import { EASE_OUT_EXPO } from "@/lib/constants/motion";
import {
  TRAINING_ASSET_KIND_LABELS,
  trainingInputMode,
  type TrainingAssetKind,
} from "@/lib/constants/elaya-training";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import type { TrainingAssetRow } from "@/lib/types/elaya-training";
import type { LucideIcon } from "lucide-react";

interface ElayaTrainingManagerProps {
  initialAssets: TrainingAssetRow[];
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

const KIND_ICON: Record<TrainingAssetKind, LucideIcon> = {
  brochure:     FileText,
  work_example: ImageIcon,
  testimonial:  BookOpen,
  review:       BookOpen,
  podcast:      Mic,
  image:        ImageIcon,
  video:        Film,
  doc:          FileText,
  fact:         BookOpen,
  url:          Link2,
};

export function ElayaTrainingManager({ initialAssets }: ElayaTrainingManagerProps) {
  const toast = useToast;
  const [assets, setAssets]         = useState<TrainingAssetRow[]>(initialAssets);
  const [search, setSearch]         = useState("");
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<TrainingAssetRow | null>(null);
  const [defaultKind, setDefaultKind] = useState<TrainingAssetKind | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TrainingAssetRow | null>(null);
  const [isPending, startTransition] = useTransition();

  // The company-facts brief = the kind='fact' row(s). Pinned out of the normal list as
  // the dedicated "Company Facts" card(s) at the top. There may be one per domain.
  const factAssets = useMemo(
    () => assets.filter((a) => a.kind === "fact"),
    [assets],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const nonFact = assets.filter((a) => a.kind !== "fact");
    const sorted = [...nonFact].sort((a, b) => {
      if (a.send_order !== b.send_order) return a.send_order - b.send_order;
      return b.created_at.localeCompare(a.created_at);
    });
    if (!q) return sorted;
    return sorted.filter((row) => {
      const haystack = [
        row.title,
        TRAINING_ASSET_KIND_LABELS[row.kind],
        row.tags.join(" "),
        row.url ?? row.description ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [assets, search]);

  const activeFilterCount = search.trim() ? 1 : 0;

  function openCreate(kind?: TrainingAssetKind) {
    setEditing(null);
    setDefaultKind(kind);
    setModalOpen(true);
  }

  function openEdit(row: TrainingAssetRow) {
    setEditing(row);
    setDefaultKind(undefined);
    setModalOpen(true);
  }

  function handleSaved(row: TrainingAssetRow, wasEdit: boolean) {
    setAssets((prev) =>
      wasEdit || prev.some((a) => a.id === row.id)
        ? prev.map((a) => (a.id === row.id ? row : a))
        : [row, ...prev],
    );
  }

  function handleDelete(row: TrainingAssetRow) {
    setDeletingId(row.id);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", row.id);
      const result = await deleteTrainingAsset(fd);
      if (result.error) {
        toast.danger(result.error);
      } else {
        setAssets((prev) => prev.filter((a) => a.id !== row.id));
        toast.success("Asset deleted.");
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
          Elaya Training<span className="page-title-dot">.</span>
        </h1>
        <MotionButton
          {...MOTION_BUTTON_DEFAULTS}
          variant="primary"
          type="button"
          iconMotion="rotate"
          onClick={() => openCreate()}
          style={{ boxShadow: "var(--shadow-accent-glow)", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          <Plus style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
          Add Asset
        </MotionButton>
      </div>

      {/* Company-facts brief card(s) — pinned above the library */}
      <div className="flex flex-col gap-2 mb-4">
        {factAssets.length === 0 ? (
          <button
            type="button"
            onClick={() => openCreate("fact")}
            style={{
              display: "flex", alignItems: "center", gap: "var(--space-4)",
              padding: "var(--space-4) var(--space-5)", width: "100%", textAlign: "left",
              background: "var(--theme-paper-subtle)", border: "1px dashed var(--theme-paper-border)",
              borderRadius: "var(--radius-lg)", cursor: "pointer",
            }}
          >
            <BookOpen style={{ width: "1.25rem", height: "1.25rem", color: "var(--theme-accent)", strokeWidth: 1.5, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--theme-text-primary)", margin: 0 }}>
                Set up the company facts
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", margin: "2px 0 0" }}>
                The brief Elaya draws on when she talks to a customer — the only source of company facts she may state.
              </p>
            </div>
          </button>
        ) : (
          factAssets.map((fact) => (
            <FactCard
              key={fact.id}
              row={fact}
              onEdit={() => openEdit(fact)}
            />
          ))
        )}
      </div>

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
              placeholder="Search by title, type or tag…"
              size="sm"
            />
          </div>
          <span
            className="ml-auto text-xs whitespace-nowrap"
            style={{ color: "var(--theme-text-tertiary)", fontFamily: "var(--font-sans)" }}
          >
            {filtered.length} {filtered.length === 1 ? "asset" : "assets"}
          </span>
        </div>
      </div>

      {/* Row 3 — card list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={assets.filter((a) => a.kind !== "fact").length === 0 ? "No training assets yet." : "Nothing matches your search."}
          description={
            assets.filter((a) => a.kind !== "fact").length === 0
              ? "Add brochures, work examples, testimonials and reviews for Elaya to share with customers."
              : "Try a different title, type or tag."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((row, i) => (
            <AssetCard
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

      <TrainingAssetFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        defaultKind={defaultKind}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        dialogKey="delete-training-asset"
        title="Delete asset?"
        body={
          confirmTarget ? (
            <>
              <strong style={{ color: "var(--theme-text-primary)" }}>{confirmTarget.title}</strong>{" "}
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

// ─── The company-facts brief card (kind='fact') ───
function FactCard({ row, onEdit }: { row: TrainingAssetRow; onEdit: () => void }) {
  const domainLabel = row.domain ? DOMAIN_LABELS[row.domain] : "All domains";
  const preview = (row.description ?? "").trim();
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
      style={{
        display: "flex", alignItems: "flex-start", gap: "var(--space-4)",
        padding: "var(--space-4) var(--space-5)", background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)", borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-1)",
        transition: "box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)",
      }}
      {...CARD_HOVER}
    >
      <div
        style={{
          width: "48px", height: "48px", borderRadius: "var(--radius-md)",
          background: "var(--theme-accent-surface)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <BookOpen style={{ width: "1.25rem", height: "1.25rem", color: "var(--theme-accent)", strokeWidth: 1.5 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--theme-text-primary)", margin: 0 }}>
          Company Facts <span style={{ color: "var(--theme-text-tertiary)", fontWeight: "var(--weight-normal)" }}>· {domainLabel}</span>
        </p>
        {preview && (
          <p
            style={{
              fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)",
              margin: "var(--space-1) 0 0", display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {preview}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit company facts"
        style={actionBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--theme-accent-muted)"; e.currentTarget.style.color = "var(--theme-text-primary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--theme-paper-border)"; e.currentTarget.style.color = "var(--theme-text-secondary)"; }}
      >
        <Pencil style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
        Edit
      </button>
    </motion.div>
  );
}

// ─── A library asset card ───
function AssetCard({
  row, index, isDeleting, onEdit, onDelete,
}: {
  row: TrainingAssetRow;
  index: number;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const staggerDelay = Math.min(index * 80, 320);
  const Icon = KIND_ICON[row.kind];
  const mode = trainingInputMode(row.kind);
  const domainLabel = row.domain ? DOMAIN_LABELS[row.domain] : "All domains";
  const previewUrl = row.url ?? null;
  const subtitle =
    mode === "link"
      ? safeHost(row.url)
      : row.storage_path
        ? "Uploaded file"
        : safeHost(row.url);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: staggerDelay / 1000, ease: EASE_OUT_EXPO }}
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-4)",
        padding: "var(--space-4) var(--space-5)", background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)", borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-1)", opacity: row.active ? 1 : 0.62,
        transition: "box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)",
      }}
      {...CARD_HOVER}
    >
      {/* Leading tile: image/video thumb for visual media, else the kind icon */}
      <div
        style={{
          width: "48px", height: "48px", borderRadius: "var(--radius-sm)", overflow: "hidden",
          background: "var(--theme-canvas)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {previewUrl && (row.kind === "image" || row.kind === "review" || row.kind === "testimonial" || row.kind === "work_example") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : previewUrl && (row.kind === "video") ? (
          <video src={previewUrl} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Icon style={{ width: "1.25rem", height: "1.25rem", color: "var(--theme-canvas-text)", strokeWidth: 1.5 }} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <p
            style={{
              fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)",
              color: "var(--theme-text-primary)", margin: 0, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {row.title}
          </p>
          <span
            style={{
              fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)",
              padding: "1px var(--space-2)", borderRadius: "var(--radius-full)",
              background: "var(--theme-accent-surface)", color: "var(--theme-accent)",
              fontWeight: "var(--weight-medium)", flexShrink: 0,
            }}
          >
            {TRAINING_ASSET_KIND_LABELS[row.kind]}
          </span>
          {!row.active && (
            <span
              style={{
                fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)",
                padding: "1px var(--space-2)", borderRadius: "var(--radius-full)",
                background: "var(--theme-paper-subtle)", color: "var(--theme-text-tertiary)",
                fontWeight: "var(--weight-medium)", flexShrink: 0,
              }}
            >
              Inactive
            </span>
          )}
        </div>
        <p
          style={{
            fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)",
            margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {subtitle} · {domainLabel}{row.tags.length > 0 ? ` · ${row.tags.join(", ")}` : ""}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit asset"
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
          aria-label="Delete asset"
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

function safeHost(url: string | null): string {
  if (!url) return "—";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const actionBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
  padding: "var(--space-1) var(--space-3)", background: "transparent",
  border: "1px solid var(--theme-paper-border)", borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)",
  color: "var(--theme-text-secondary)", cursor: "pointer",
  transition: "var(--transition-interactive)", whiteSpace: "nowrap",
};
