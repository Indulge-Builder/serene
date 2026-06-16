"use client";

// THE single mount point for the suggestion / bug-report composer. Lives once in
// the dashboard layout (beside ElayaWidget) so the Sidebar "Send feedback" button
// (desktop, all roles) and the mobile Elaya-card trigger both open the SAME modal
// instance — never two composers. Exposes openComposer() via context.
//
// The heavy composer chunk loads on first open (next/dynamic + useMountOnFirstOpen
// — the Heavy modal loading rule); the modal stays mounted afterwards so it keeps
// its own exit animation.

import { createContext, useCallback, useContext, useState } from "react";
import dynamic from "next/dynamic";
import { useMountOnFirstOpen } from "@/hooks/useMountOnFirstOpen";

const SuggestionComposerModal = dynamic(
  () =>
    import("@/components/suggestions/SuggestionComposerModal").then(
      (m) => m.SuggestionComposerModal,
    ),
  { ssr: false },
);

type SuggestionFeedbackContextValue = {
  /** Open the shared feedback composer. */
  openComposer: () => void;
};

const SuggestionFeedbackContext = createContext<SuggestionFeedbackContextValue | null>(null);

/** Open the shared feedback composer from anywhere under the provider. */
export function useSuggestionFeedback(): SuggestionFeedbackContextValue {
  const ctx = useContext(SuggestionFeedbackContext);
  if (!ctx) {
    throw new Error("useSuggestionFeedback must be used within SuggestionFeedbackProvider");
  }
  return ctx;
}

export function SuggestionFeedbackProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openComposer = useCallback(() => setOpen(true), []);
  const shouldMount = useMountOnFirstOpen(open);

  return (
    <SuggestionFeedbackContext.Provider value={{ openComposer }}>
      {children}
      {shouldMount && (
        <SuggestionComposerModal
          open={open}
          onClose={() => setOpen(false)}
          userId={userId}
        />
      )}
    </SuggestionFeedbackContext.Provider>
  );
}
