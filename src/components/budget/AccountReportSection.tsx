"use client";

// Per-account report on /budget: one block per Meta ad account
// (recharged · spent · balance via StatTile), each expandable to its campaign
// rows (reuses BudgetTable), an "Unattributed" block when any campaign fails to
// resolve, and a grand-total Meta spend line.
//
// Finance rules made visible here:
//   * balance = recharged − spent is INR-ONLY (computed in the service).
//   * non-INR recharges show as a separate line, never in the balance.
//   * Unattributed renders visibly (accent-free, neutral) so the post-ship
//     campaign-rename pass is self-auditing.

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { CollapseReveal } from "@/components/ui/CollapseReveal";
import { BudgetTable } from "@/components/budget/BudgetTable";
import { BudgetSectionHeader } from "@/components/budget/BudgetSectionHeader";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/numbers";
import { UNATTRIBUTED_ACCOUNT_KEY } from "@/lib/constants/ad-accounts";
import type { AccountReport } from "@/lib/services/ad-spend-service";

export function AccountReportSection({ report }: { report: AccountReport }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Section header — totals live in the top strip (spend) and the
          Recharge History header (recharged), so this stays just the title. */}
      <BudgetSectionHeader title="By Ad Account" />

      {/* Account blocks */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {report.blocks.map((block) => {
          const isOpen = expanded === block.key;
          const isUnattributed = block.key === UNATTRIBUTED_ACCOUNT_KEY;
          const balanceColor =
            block.balance < 0 ? "var(--color-danger)" : "var(--theme-text-primary)";
          const hasCampaigns = block.campaigns.length > 0;

          return (
            <div
              key={block.key}
              className="rounded-md border bg-(--theme-paper) shadow-(--shadow-1)"
              style={{
                borderColor: isUnattributed
                  ? "var(--color-warning)"
                  : "var(--theme-paper-border)",
                overflow: "hidden",
              }}
            >
              {/* Block header — clickable to expand campaigns */}
              <button
                type="button"
                onClick={() => hasCampaigns && setExpanded(isOpen ? null : block.key)}
                disabled={!hasCampaigns}
                style={{
                  width:          "100%",
                  display:        "flex",
                  alignItems:     "center",
                  gap:            "var(--space-4)",
                  padding:        "var(--space-3) var(--space-5)",
                  background:     "transparent",
                  border:         "none",
                  cursor:         hasCampaigns ? "pointer" : "default",
                  textAlign:      "left",
                }}
              >
                {/* Fixed-width identity column so every block's stat cluster
                    starts at the same x — a long account name (e.g. "Indulge
                    New Gen") truncates with an ellipsis instead of pushing the
                    Recharged/Spent/Balance columns out of vertical alignment
                    across the stacked blocks. */}
                <div style={{ flex: "0 0 180px", minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily:   "var(--font-sans)",
                      fontSize:     "var(--text-sm)",
                      fontWeight:   "var(--weight-semibold)",
                      color:        "var(--theme-text-primary)",
                      margin:       0,
                      whiteSpace:   "nowrap",
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={block.label}
                  >
                    {block.label}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize:   "var(--text-2xs)",
                      color:      "var(--theme-text-tertiary)",
                      margin:     0,
                    }}
                  >
                    {block.campaigns.length} campaign{block.campaigns.length === 1 ? "" : "s"}
                    {isUnattributed ? " · rename to attribute" : ""}
                  </p>
                </div>

                {/* Stat cells */}
                <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <StatTile variant="cell" label="Recharged" value={formatCurrencyCompact(block.recharged)} />
                  <StatTile variant="cell" label="Spent"     value={formatCurrencyCompact(block.spent)} />
                  {/* Balance is a bespoke cell (mirrors StatTile cell anatomy)
                      so overspend can render in danger — StatTile's cell value
                      is always accent by design. */}
                  <div
                    style={{
                      display:       "flex",
                      flexDirection: "column",
                      alignItems:    "center",
                      flex:          1,
                      padding:       "var(--space-4) var(--space-5)",
                      minWidth:      "120px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily:         "var(--font-mono)",
                        fontSize:           "var(--text-2xl)",
                        fontWeight:         "var(--weight-normal)",
                        fontVariantNumeric: "tabular-nums",
                        color:              balanceColor,
                        lineHeight:         1.1,
                        marginBottom:       "var(--space-1)",
                        whiteSpace:         "nowrap",
                      }}
                    >
                      {formatCurrencyCompact(block.balance)}
                    </span>
                    <span className="label-micro" style={{ color: "var(--theme-text-tertiary)", textAlign: "center" }}>
                      Balance
                    </span>
                  </div>
                </div>

                {hasCampaigns && (
                  <ChevronDown
                    style={{
                      width: 16, height: 16, strokeWidth: 1.5, flexShrink: 0,
                      color: "var(--theme-text-tertiary)",
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform var(--duration-fast) var(--ease-in-out)",
                    }}
                  />
                )}
              </button>

              {/* Non-INR line — recorded, excluded from balance */}
              {block.nonInr.length > 0 && (
                <p
                  style={{
                    margin:     0,
                    padding:    "0 var(--space-5) var(--space-3)",
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-xs)",
                    color:      "var(--theme-text-tertiary)",
                  }}
                >
                  Also recharged (excluded from INR balance):{" "}
                  {block.nonInr.map((n, i) => (
                    <span key={n.currency}>
                      {i > 0 ? " · " : ""}
                      {formatCurrency(Math.round(n.total), n.currency === "USD" ? "USD" : "INR")}
                      {n.currency !== "USD" && n.currency !== "INR" ? ` ${n.currency}` : ""}
                    </span>
                  ))}
                </p>
              )}

              {/* Expanded campaign rows */}
              <AnimatePresence initial={false}>
                {isOpen && hasCampaigns && (
                  <CollapseReveal key="campaigns">
                    <div style={{ borderTop: "1px solid var(--theme-paper-border)" }}>
                      <BudgetTable
                        rows={block.campaigns.map((r) => ({
                          ...r,
                          campaignTitle: r.campaignKey,
                        }))}
                      />
                    </div>
                  </CollapseReveal>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Non-INR footnote */}
      {report.hasNonInr && (
        <p
          style={{
            margin:     0,
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            fontStyle:  "italic",
            color:      "var(--theme-text-tertiary)",
          }}
        >
          Balances are INR only. Non-INR recharges are recorded and shown per account
          but never subtracted from INR spend.
        </p>
      )}
    </section>
  );
}
