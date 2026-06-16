"use client";

// Admin/founder triage inbox for suggestions / bug reports. Card-list layout
// (the Standard Page Layout Contract): one motion.div card per report, --shadow-1
// at rest. Status filter via TabSelector; resolve button flips the row. Display +
// thin client state only — all data arrives seeded from the RSC page (Rule: no
// component both fetches and renders); resolve goes through resolveSuggestionAction.

import { useMemo, useState, useTransition } from "react";
import { m as motion } from "framer-motion";
import { Inbox, Check, ExternalLink } from "lucide-react";
import { TabSelector } from "@/components/ui/TabSelector";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import { formatRelativeTime } from "@/lib/utils/dates";
import { resolveSuggestionAction } from "@/lib/actions/suggestions";
import {
  SUGGESTION_CATEGORY_LABELS,
  type SuggestionStatus,
} from "@/lib/constants/suggestions";
import { ENTER_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import type { SuggestionWithSender } from "@/lib/types/suggestions";

type FilterTab = "all" | SuggestionStatus;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
];

export function SuggestionInboxClient({
  initialSuggestions,
}: {
  initialSuggestions: SuggestionWithSender[];
}) {
  const toast = useToast;
  const [items, setItems] = useState(initialSuggestions);
  const [tab, setTab] = useState<FilterTab>("all");
  const [pending, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const visible = useMemo(
    () => (tab === "all" ? items : items.filter((s) => s.status === tab)),
    [items, tab],
  );

  function handleResolve(id: string) {
    setResolvingId(id);
    startTransition(async () => {
      const result = await resolveSuggestionAction({ id });
      setResolvingId(null);
      if (result.error) {
        toast.danger(result.error);
        return;
      }
      // Optimistic local flip — the RSC revalidate will reconcile on next load.
      setItems((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, status: "resolved" as SuggestionStatus, resolved_at: new Date().toISOString() }
            : s,
        ),
      );
      toast.success("Marked resolved.");
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <TabSelector
        tabs={FILTER_TABS}
        activeTab={tab}
        onChange={(id) => setTab(id as FilterTab)}
        variant="pill"
        indicatorLayoutId="suggestions-status-tabs"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing here yet."
          description={
            tab === "open"
              ? "No open reports — you're all caught up."
              : "Feedback from the team will land here."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {visible.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: ENTER_DURATION,
                ease: EASE_OUT_EXPO,
                delay: Math.min(i * 0.04, 0.32),
              }}
              style={{
                padding: "var(--space-5)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--theme-paper-border)",
                background: "var(--theme-paper)",
                boxShadow: "var(--shadow-1)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-4)",
              }}
            >
              {/* Header — sender + category + time + status */}
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <Avatar size="sm" name={s.sender?.full_name ?? "Unknown"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--text-sm)",
                      fontWeight: "var(--weight-medium)",
                      color: "var(--theme-text-primary)",
                    }}
                  >
                    {s.sender?.full_name ?? "Unknown"}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--text-2xs)",
                      color: "var(--theme-text-tertiary)",
                      letterSpacing: "var(--tracking-wide)",
                    }}
                  >
                    {SUGGESTION_CATEGORY_LABELS[s.category]} · {formatRelativeTime(s.created_at)}
                  </p>
                </div>
                <StatusPill status={s.status} />
              </div>

              {/* Message */}
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-sm)",
                  lineHeight: 1.6,
                  color: "var(--theme-text-primary)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {s.message}
              </p>

              {/* Screenshots — short-lived signed URLs; open full-size in a new tab */}
              {s.image_urls.length > 0 && (
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                  {s.image_urls.map((url, idx) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        position: "relative",
                        width: "80px",
                        height: "80px",
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                        border: "1px solid var(--theme-paper-border)",
                        display: "block",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Screenshot ${idx + 1}`}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </a>
                  ))}
                </div>
              )}

              {/* Actions */}
              {s.status === "open" && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={Check}
                    loading={pending && resolvingId === s.id}
                    disabled={pending}
                    onClick={() => handleResolve(s.id)}
                  >
                    Mark resolved
                  </Button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SuggestionStatus }) {
  const resolved = status === "resolved";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-full)",
        fontSize: "var(--text-2xs)",
        fontWeight: "var(--weight-medium)",
        letterSpacing: "var(--tracking-wide)",
        color: resolved ? "var(--color-success-text)" : "var(--color-warning-text)",
        background: resolved ? "var(--color-success-light)" : "var(--color-warning-light)",
        flexShrink: 0,
      }}
    >
      {resolved ? <Check style={{ width: "11px", height: "11px", strokeWidth: 2 }} /> : <ExternalLink style={{ width: "11px", height: "11px", strokeWidth: 1.5 }} />}
      {resolved ? "Resolved" : "Open"}
    </span>
  );
}
