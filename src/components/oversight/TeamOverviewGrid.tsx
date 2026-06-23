"use client";

import Link from "next/link";
import { m as motion } from "framer-motion";
import { EASE_OUT_EXPO, BASE_DURATION } from "@/lib/constants/motion";
import { DOMAIN_LABELS, DOMAIN_ICONS, ALL_DOMAINS_ICON } from "@/lib/constants/domains";
import { formatCount } from "@/lib/utils/numbers";
import { EmptyState } from "@/components/ui/EmptyState";
import { OversightStatRow } from "./OversightStatRow";
import { Users } from "lucide-react";
import type { TeamTaskOverviewRow } from "@/lib/types/oversight";
import type { GiaDomain } from "@/lib/constants/domains";

// Tier 1 — one card per rostered app_domain (founder/admin). Display-only
// (A-06): the page does the one aggregation query and passes rows in. Each card
// is a Link to /oversight/<domain> (the card → open grammar, every tier).

function domainGlyph(domain: string) {
  // Gia domains carry a glyph; non-Gia rostered domains fall back to the globe.
  const giaIcon = (DOMAIN_ICONS as Record<string, typeof ALL_DOMAINS_ICON>)[domain];
  return giaIcon ?? ALL_DOMAINS_ICON;
}

export function TeamOverviewGrid({ rows }: { rows: TeamTaskOverviewRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No teams to oversee yet."
        description="Teams appear here once a domain has an active agent."
        framed
        ambient
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((row, i) => {
        const Glyph = domainGlyph(row.domain);
        return (
          <motion.div
            key={row.domain}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: BASE_DURATION,
              ease: EASE_OUT_EXPO,
              delay: Math.min(i * 0.06, 0.32),
            }}
          >
            <Link
              href={`/oversight/${row.domain}`}
              // Reuse the canonical dashboard card-link hover chrome (R-01 — the
              // same paper-card-that-lifts idiom); rest chrome inline below.
              className="serene-activity-card block"
              aria-label={`Open ${DOMAIN_LABELS[row.domain]} team detail`}
              style={{
                display: "block",
                padding: "var(--space-5)",
                background: "var(--theme-paper)",
                border: "1px solid var(--theme-paper-border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-1)",
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden="true"
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "var(--radius-md)",
                      background: "var(--theme-accent-surface)",
                      color: "var(--theme-accent)",
                    }}
                  >
                    <Glyph style={{ width: 18, height: 18, strokeWidth: 1.5 }} />
                  </span>
                  <span
                    className="truncate"
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-base)",
                      fontWeight: "var(--weight-medium)",
                      color: "var(--theme-text-primary)",
                    }}
                  >
                    {DOMAIN_LABELS[row.domain as GiaDomain] ?? row.domain}
                  </span>
                </div>
                {/* Live pulse — present agents now / total roster. A breathing
                    dot when anyone is present; a quiet dot otherwise. */}
                <span className="flex items-center gap-1.5 shrink-0">
                  <span
                    aria-hidden="true"
                    className={row.presentAgentCount > 0 ? "serene-oversight-pulse" : undefined}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "var(--radius-full)",
                      background:
                        row.presentAgentCount > 0
                          ? "var(--color-success)"
                          : "var(--theme-text-tertiary)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "var(--text-2xs)",
                      fontWeight: "var(--weight-medium)",
                      letterSpacing: "var(--tracking-wide)",
                      color:
                        row.presentAgentCount > 0
                          ? "var(--color-success-text)"
                          : "var(--theme-text-tertiary)",
                    }}
                  >
                    {formatCount(row.presentAgentCount)}/{formatCount(row.agentCount)}
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
        );
      })}
    </div>
  );
}
