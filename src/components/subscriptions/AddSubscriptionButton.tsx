"use client";

// The top-right subscriptions CTA. A menu with two choices:
//   New     → create a subscription (AddEditSubscriptionModal).
//   Renewal → search active subscriptions (RenewalPickerModal) → the chosen one
//             opens Record Payment, or Log Top-up if it's a top_up.
// Menu = the canonical usePortalAnchor + <FloatingPanel>. All overlays load on
// intent (next/dynamic); the payment/top-up target stays mounted while it animates
// out (mirrors SubscriptionsTable's modal orchestration).

import { SelectionButton } from '@/components/ui/SelectionButton';
import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus, ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { usePortalAnchor } from "@/hooks/usePortalAnchor";
import { FloatingPanel } from "@/components/ui/FloatingPanel";
import { useMountOnFirstOpen } from "@/hooks/useMountOnFirstOpen";
import type { SubscriptionListItem } from "@/lib/types/subscription";

const AddEditSubscriptionModal = dynamic(
  () => import("./AddEditSubscriptionModal").then((m) => m.AddEditSubscriptionModal),
  { ssr: false },
);
const RenewalPickerModal = dynamic(
  () => import("./RenewalPickerModal").then((m) => m.RenewalPickerModal),
  { ssr: false },
);
const RecordPaymentModal = dynamic(
  () => import("./RecordPaymentModal").then((m) => m.RecordPaymentModal),
  { ssr: false },
);
const LogTopupModal = dynamic(() => import("./LogTopupModal").then((m) => m.LogTopupModal), {
  ssr: false,
});

export function AddSubscriptionButton() {
  const anchor = usePortalAnchor({ estimatedWidth: 220, estimatedHeight: 120 });

  const [newOpen, setNewOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The Record Payment / Log Top-up target — kept mounted while it animates out.
  const [flow, setFlow] = useState<{ kind: "payment" | "topup"; sub: SubscriptionListItem } | null>(
    null,
  );
  const [flowOpen, setFlowOpen] = useState(false);

  const newMount = useMountOnFirstOpen(newOpen);
  const pickerMount = useMountOnFirstOpen(pickerOpen);

  function handleNew() {
    anchor.close();
    setNewOpen(true);
  }

  function handleRenewal() {
    anchor.close();
    setPickerOpen(true);
  }

  function handlePick(sub: SubscriptionListItem) {
    setPickerOpen(false);
    setFlow({ kind: sub.type === "top_up" ? "topup" : "payment", sub });
    setFlowOpen(true);
  }

  return (
    <>
      <Button
        ref={anchor.triggerRef}
        variant="primary"
        iconLeft={Plus as LucideIcon}
        iconRight={ChevronDown as LucideIcon}
        aria-haspopup="menu"
        aria-expanded={anchor.open}
        onClick={anchor.toggle}
      >
        Add Subscription
      </Button>

      <FloatingPanel
        {...anchor.panelProps}
        panelKey="add-subscription-menu"
        style={{ padding: "var(--space-1)", minWidth: 200 }}
      >
        <div role="menu" style={{ display: "flex", flexDirection: "column" }}>
          <MenuItem label="New" hint="Add a subscription" onClick={handleNew} />
          <MenuItem label="Renewal" hint="Record a payment or top-up" onClick={handleRenewal} />
        </div>
      </FloatingPanel>

      {newMount && <AddEditSubscriptionModal open={newOpen} onClose={() => setNewOpen(false)} />}
      {pickerMount && (
        <RenewalPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handlePick}
        />
      )}
      {flow?.kind === "payment" && (
        <RecordPaymentModal
          open={flowOpen}
          onClose={() => setFlowOpen(false)}
          subscription={flow.sub}
        />
      )}
      {flow?.kind === "topup" && (
        <LogTopupModal open={flowOpen} onClose={() => setFlowOpen(false)} subscription={flow.sub} />
      )}
    </>
  );
}

function MenuItem({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <SelectionButton
      appearance="option"
      type="button"
      role="menuitem"
      onClick={onClick}
      className="serene-pressable"
      style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.125rem",
              width: "100%",
              textAlign: "left",
              padding: "var(--space-2) var(--space-3)",
          }}
    >
      <span
        style={{
          fontSize: "var(--text-sm)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--theme-text-primary)",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", lineHeight: 1.4 }}>
        {hint}
      </span>
    </SelectionButton>
  );
}
