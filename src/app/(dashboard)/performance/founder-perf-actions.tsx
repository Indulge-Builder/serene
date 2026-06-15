'use client';

// Bridge so the founder Agents-tab roster panel (ManagerPerformancePanel) can
// render its "Deck view" trigger up on the shell's tab row — aligned opposite
// the Agents/Domains tabs — without lifting the roster state (visibleAgents,
// domainFilter, selectedId) out of the panel. The panel registers a trigger
// node; the shell renders it on the right of the tab row when the Agents tab
// is active. Null = no trigger (e.g. nothing to deck, or the Domains tab).

import { createContext, useContext } from 'react';

export type FounderPerfActionsContextValue = {
  /** The panel registers/clears its tab-row action node here. */
  setTabAction: (node: React.ReactNode) => void;
};

const FounderPerfActionsContext = createContext<FounderPerfActionsContextValue | null>(null);

export function FounderPerfActionsProvider({
  value,
  children,
}: {
  value: FounderPerfActionsContextValue;
  children: React.ReactNode;
}) {
  return (
    <FounderPerfActionsContext.Provider value={value}>
      {children}
    </FounderPerfActionsContext.Provider>
  );
}

/** Returns the registrar, or null when rendered outside the founder shell
 *  (manager view mounts ManagerPerformancePanel directly — no tab row). */
export function useFounderPerfActions(): FounderPerfActionsContextValue | null {
  return useContext(FounderPerfActionsContext);
}
