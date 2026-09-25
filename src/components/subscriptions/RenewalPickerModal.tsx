"use client";

// The "Renewal" picker — opened from the top-right Add Subscription menu. Loads all
// active subscriptions, filters by name client-side, and on row click hands the chosen
// subscription up to the parent, which opens Record Payment (or Log Top-up for a
// top_up). List-style modal (bodyPadding={false}): the CompletedTasksModal anatomy.

import { SelectionButton } from '@/components/ui/SelectionButton';
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/lib/toast";
import { listActiveSubscriptionsAction } from "@/lib/actions/subscriptions";
import type { SubscriptionListItem } from "@/lib/types/subscription";
import { SubscriptionStatusPill, TypePill, CurrencyAmount } from "./SubscriptionBits";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fired when a subscription is chosen — the parent opens Record Payment / Log Top-up. */
  onSelect: (sub: SubscriptionListItem) => void;
};

export function RenewalPickerModal({ open, onClose, onSelect }: Props) {
  const [subs, setSubs] = useState<SubscriptionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listActiveSubscriptionsAction();
    setLoading(false);
    if (res.error || !res.data) {
      toast.danger(res.error ?? "Could not load subscriptions.");
      setSubs([]);
      return;
    }
    setSubs(res.data);
  }, []);

  // Fetch on open; reset the search each time it opens.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    load();
  }, [open, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter((s) => s.name.toLowerCase().includes(q));
  }, [subs, search]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a renewal"
      description="Choose a subscription to record its payment or top-up."
      size="md"
      bodyPadding={false}
    >
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        {/* Pinned search strip */}
        <div
          style={{
            padding: "var(--space-3) var(--space-5)",
            borderBottom: "1px solid var(--theme-paper-border)",
            flexShrink: 0,
          }}
        >
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search subscriptions"
            autoFocus
            aria-label="Search subscriptions"
          />
        </div>

        {/* Scrollable list — the only part that scrolls */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "var(--space-8)",
              }}
            >
              <LogoSpinner size="md" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              variant="inline"
              title={search.trim() ? "No subscriptions match." : "No active subscriptions."}
              description={
                search.trim()
                  ? "Try a different name."
                  : "Add a subscription first, then record its renewal here."
              }
              style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-10)" }}
            />
          ) : (
            filtered.map((sub) => <RenewalRow key={sub.id} sub={sub} onSelect={onSelect} />)
          )}
        </div>
      </div>
    </Modal>
  );
}

function RenewalRow({
  sub,
  onSelect,
}: {
  sub: SubscriptionListItem;
  onSelect: (sub: SubscriptionListItem) => void;
}) {
  return (
    <SelectionButton
      appearance="option"
      type="button"
      onClick={() => onSelect(sub)}
      style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              width: "100%",
              textAlign: "left",
              padding: "var(--space-3) var(--space-5)",
              borderBottom: "1px solid var(--theme-paper-border)",
          }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color: "var(--theme-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sub.name}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <TypePill type={sub.type} />
          <span style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)" }}>
            <CurrencyAmount amount={sub.amount} currency={sub.currency} />
          </span>
        </span>
      </span>
      <SubscriptionStatusPill status={sub.status} daysOverdue={sub.daysOverdue} />
    </SelectionButton>
  );
}
