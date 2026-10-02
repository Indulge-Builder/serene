"use client";

import { Button } from '@/components/ui/Button';
import { useMemo, useState, useTransition } from "react";
import { m as motion } from "framer-motion";
import {
  Plus, SlidersHorizontal, GraduationCap, Check,
  FileText, Link2, Image as ImageIcon, Film, Mic, BookOpen,
  MessageSquareText, Quote, HelpCircle, ShieldQuestion, Newspaper, Ban, Music,
} from "lucide-react";
import { TabSelector } from "@/components/ui/TabSelector";
import { MotionButton, MOTION_BUTTON_DEFAULTS } from "@/components/ui/MotionButton";
import { PageControls } from "@/components/layout/PageControls";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
import { SearchBar } from "@/components/ui/SearchBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { EditDeleteActions } from "@/components/ui/RowActions";
import { TrainingAssetFormModal } from "./TrainingAssetFormModal";
import { approveTrainingAsset, deleteTrainingAsset } from "@/lib/actions/elaya-training";
import { useToast } from "@/hooks/useToast";
import { EASE_OUT_EXPO, EXIT_DURATION } from "@/lib/constants/motion";
import {
  TRAINING_ASSET_KIND_LABELS,
  TRAINING_TEXT_KINDS,
  isLibraryKind,
  trainingInputMode,
  type TrainingAssetKind,
} from "@/lib/constants/elaya-training";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import type { TrainingAssetRow } from "@/lib/types/elaya-training";
import type { LucideIcon } from "lucide-react";

interface ElayaTrainingManagerProps {
  initialAssets: TrainingAssetRow[];
  /** Admin / founder: may approve items for the public bot's pack (0252). */
  canApprove: boolean;
  /** The pack card and the corrections queue, rendered above the list. */
  header?: React.ReactNode;
}

type LibraryView = "all" | "knowledge" | "library" | "drafts";

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
  audio:         Music,
  ready_message: MessageSquareText,
  story:         Quote,
  answer:        HelpCircle,
  objection:     ShieldQuestion,
  news:          Newspaper,
  forbidden:     Ban,
};

export function ElayaTrainingManager({ initialAssets, canApprove, header }: ElayaTrainingManagerProps) {
  const toast = useToast;
  const [assets, setAssets]         = useState<TrainingAssetRow[]>(initialAssets);
  const [search, setSearch]         = useState("");
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<TrainingAssetRow | null>(null);
  const [defaultKind, setDefaultKind] = useState<TrainingAssetKind | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TrainingAssetRow | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView>("all");
  const [isPending, startTransition] = useTransition();

  // The library items a ready message may attach (approved files and links, never another
  // ready message).
  const attachable = useMemo(
    () => assets.filter((a) => isLibraryKind(a.kind) && a.kind !== "ready_message" && a.status === "approved"),
    [assets],
  );

  const viewCounts = useMemo(() => ({
    all: assets.length,
    knowledge: assets.filter((a) => (TRAINING_TEXT_KINDS as readonly string[]).includes(a.kind)).length,
    library: assets.filter((a) => isLibraryKind(a.kind)).length,
    drafts: assets.filter((a) => a.status !== "approved").length,
  }), [assets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const inView = assets.filter((a) =>
      view === "all" ? true
      : view === "knowledge" ? (TRAINING_TEXT_KINDS as readonly string[]).includes(a.kind)
      : view === "library" ? isLibraryKind(a.kind)
      : a.status !== "approved",
    );
    const sorted = [...inView].sort((a, b) => {
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
  }, [assets, search, view]);

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

  function handleApprove(row: TrainingAssetRow) {
    setApprovingId(row.id);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", row.id);
      const result = await approveTrainingAsset(fd);
      if (result.error || !result.data) {
        toast.danger(result.error ?? "Could not approve it.");
      } else {
        const approved = result.data;
        setAssets((prev) => prev.map((a) => (a.id === approved.id ? approved : a)));
        toast.success("Approved. It goes live with the next publish.");
      }
      setApprovingId(null);
    });
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
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
        {TOP_BAR_ENABLED && <PageControls isPrivileged={false} />}
        </div>
      </div>

      {header}

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
          <TabSelector
            tabs={[
              { id: "all", label: "All", count: viewCounts.all },
              { id: "knowledge", label: "Knowledge", count: viewCounts.knowledge },
              { id: "library", label: "Files & messages", count: viewCounts.library },
              { id: "drafts", label: "Drafts", count: viewCounts.drafts },
            ]}
            activeTab={view}
            onChange={(id) => setView(id as LibraryView)}
            indicatorLayoutId="library-view"
          />
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
          framed
          title={assets.length === 0 ? "Nothing here yet." : "Nothing matches."}
          description={
            assets.length === 0
              ? "Add the facts, stories, answers, files and ready messages the Indulge concierge and the onboarding team use."
              : "Try a different view, title, type or tag."
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
              isApproving={isPending && approvingId === row.id}
              canApprove={canApprove}
              onApprove={() => handleApprove(row)}
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
        attachable={attachable}
        canApprove={canApprove}
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

// ─── A library asset card ───
function AssetCard({
  row, index, isDeleting, isApproving, canApprove, onApprove, onEdit, onDelete,
}: {
  row: TrainingAssetRow;
  index: number;
  isDeleting: boolean;
  isApproving: boolean;
  canApprove: boolean;
  onApprove: () => void;
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
      : mode === "text" || mode === "message"
        ? (row.description ?? "").replace(/\s+/g, " ").slice(0, 90)
        : row.storage_path
          ? "Uploaded file"
          : safeHost(row.url);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: EXIT_DURATION, delay: staggerDelay / 1000, ease: EASE_OUT_EXPO }}
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
              background: "var(--theme-accent-surface)", color: "var(--neu-accent-deep)",
              fontWeight: "var(--weight-medium)", flexShrink: 0,
            }}
          >
            {TRAINING_ASSET_KIND_LABELS[row.kind]}
          </span>
          <span
            style={{
              fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)",
              padding: "1px var(--space-2)", borderRadius: "var(--radius-full)",
              background: row.status === "approved" ? "var(--color-success-light)" : "var(--color-warning-light)",
              color: row.status === "approved" ? "var(--color-success-text)" : "var(--color-warning-text)",
              fontWeight: "var(--weight-medium)", flexShrink: 0,
            }}
          >
            {row.status === "approved" ? "Approved" : "Draft"}
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

      {canApprove && row.status !== "approved" && (
        <Button variant="control" size="sm" type="button" onClick={onApprove} loading={isApproving} disabled={isApproving}>
          <Check style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
          Approve
        </Button>
      )}
      <EditDeleteActions onEdit={onEdit} onDelete={onDelete} deleting={isDeleting} subject="asset" />
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
