"use client";

import { MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export function EmptyConversationState() {
  return (
    <EmptyState
      icon={MessageCircle}
      title="Select a conversation."
      description="Choose from the list to view the full thread."
      style={{ flex: 1, minHeight: 0 }}
    />
  );
}

EmptyConversationState.displayName = "EmptyConversationState";
