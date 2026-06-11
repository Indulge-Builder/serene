"use client";

import { MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export function EmptyConversationState() {
  return (
    <EmptyState
      icon={MessageCircle}
      title="Select a conversation."
      description="Choose from the list to view the full thread."
      style={{ height: "100%" }}
    />
  );
}

EmptyConversationState.displayName = "EmptyConversationState";
