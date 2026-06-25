"use client";

// Shares the /budget Accounts|Campaigns tab state across the Suspense boundary:
// the TabSelector lives in the filter-bar leading slot (BudgetFilterBar, above
// the boundary) while the content switch lives in BudgetWorkspace (inside
// BudgetAsync, below it). A tiny client context bridges the two — the same
// cross-boundary client-state pattern as FounderPerfActions on /performance.
// Tab is pure view state (no server refetch on switch), so it stays in memory,
// never the URL.

import { createContext, useContext, useState } from "react";

export type BudgetTab = "accounts" | "campaigns";

type BudgetTabContextValue = {
  tab: BudgetTab;
  setTab: (tab: BudgetTab) => void;
};

const BudgetTabContext = createContext<BudgetTabContextValue | null>(null);

export function BudgetTabProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<BudgetTab>("accounts");
  return (
    <BudgetTabContext.Provider value={{ tab, setTab }}>
      {children}
    </BudgetTabContext.Provider>
  );
}

export function useBudgetTab(): BudgetTabContextValue {
  const ctx = useContext(BudgetTabContext);
  if (!ctx) {
    throw new Error("useBudgetTab must be used within a BudgetTabProvider");
  }
  return ctx;
}
