"use client";

import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { ENTER_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";

export function EmptyConversationState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        height:         "100%",
        gap:            "var(--space-4)",
        padding:        "var(--space-8)",
      }}
    >
      <div
        style={{
          width:          "56px",
          height:         "56px",
          borderRadius:   "var(--radius-xl)",
          background:     "var(--theme-accent-surface)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
        }}
      >
        <MessageCircle
          style={{
            width:       "26px",
            height:      "26px",
            strokeWidth: 1.5,
            color:       "var(--theme-accent)",
          }}
        />
      </div>

      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   "var(--text-xl)",
            color:      "var(--theme-text-primary)",
            margin:     "0 0 var(--space-2)",
            fontWeight: "var(--weight-normal)",
          }}
        >
          Select a conversation
        </p>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-sm)",
            color:      "var(--theme-text-tertiary)",
            margin:     0,
            lineHeight: "var(--leading-relaxed)",
          }}
        >
          Choose a conversation from the left to start messaging.
        </p>
      </div>
    </motion.div>
  );
}

EmptyConversationState.displayName = "EmptyConversationState";
