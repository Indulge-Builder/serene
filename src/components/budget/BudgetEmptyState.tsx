"use client";

// Client wrapper so the Lucide icon component never crosses the RSC boundary
// (BudgetAsync is a server component; component functions can't be serialised
// as props to the 'use client' EmptyState).

import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export function BudgetEmptyState({ canUpload }: { canUpload: boolean }) {
  return (
    <EmptyState
      icon={Wallet}
      title="No spend recorded for this period."
      description={
        canUpload
          ? "Upload a Meta daily-breakdown export to see cost per lead and cost per deal here."
          : "Spend appears here once a Meta daily-breakdown export has been uploaded."
      }
      framed
    />
  );
}
