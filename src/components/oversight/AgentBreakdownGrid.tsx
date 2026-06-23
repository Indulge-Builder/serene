"use client";

import Link from "next/link";
import { m as motion } from "framer-motion";
import { EASE_OUT_EXPO, BASE_DURATION } from "@/lib/constants/motion";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { OversightStatRow } from "./OversightStatRow";
import { Users } from "lucide-react";
import type { AppDomain } from "@/lib/types/database";
import type { TeamAgentBreakdownRow } from "@/lib/types/oversight";

// Tier 2 — one card per active agent in the team, each a Link to Tier 3
// (/oversight/<domain>/<agentId>). Display-only (A-06). Live "online now" dot
// overlaid from the breakdown's isPresent (listLivePresence, reused).

export function AgentBreakdownGrid({
  domain,
  rows,
}: {
  domain: AppDomain;
  rows: TeamAgentBreakdownRow[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No agents on this team yet."
        description="Active agents in this domain will appear here."
        framed
        ambient
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {rows.map((row, i) => (
        <motion.div
          key={row.agentId}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: BASE_DURATION,
            ease: EASE_OUT_EXPO,
            delay: Math.min(i * 0.06, 0.32),
          }}
        >
          <Link
            href={`/oversight/${domain}/${row.agentId}`}
            className="serene-activity-card block"
            aria-label={`Open ${row.fullName ?? "agent"} detail`}
            style={{
              display: "block",
              padding: "var(--space-5)",
              background: "var(--theme-paper)",
              border: "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <div className="flex items-center gap-3 mb-4 min-w-0">
              <span className="relative shrink-0">
                <Avatar name={row.fullName ?? "Agent"} src={row.avatarUrl} size="md" />
                {/* Online-now dot, bottom-right of the avatar. */}
                {row.isPresent && (
                  <span
                    aria-label="online now"
                    className="serene-oversight-pulse"
                    style={{
                      position: "absolute",
                      right: -1,
                      bottom: -1,
                      width: 10,
                      height: 10,
                      borderRadius: "var(--radius-full)",
                      background: "var(--color-success)",
                      boxShadow: "0 0 0 2px var(--theme-paper)",
                    }}
                  />
                )}
              </span>
              <span className="min-w-0">
                <span
                  className="block truncate"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--weight-medium)",
                    color: "var(--theme-text-primary)",
                  }}
                >
                  {row.fullName ?? "Agent"}
                </span>
                <span
                  className="block"
                  style={{
                    fontSize: "var(--text-2xs)",
                    letterSpacing: "var(--tracking-wide)",
                    color: row.isPresent
                      ? "var(--color-success-text)"
                      : "var(--theme-text-tertiary)",
                  }}
                >
                  {row.isPresent ? "Online now" : "Offline"}
                </span>
              </span>
            </div>

            <OversightStatRow
              open={row.openCount}
              overdue={row.overdueCount}
              completed={row.completedCount}
            />
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
