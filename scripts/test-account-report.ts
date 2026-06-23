/**
 * Budget account-attribution regression check — the committed test for the two
 * PURE functions the /budget per-account report depends on:
 *
 *   resolveAccountFromCampaign  (lib/constants/ad-accounts.ts)
 *   buildAccountReport          (lib/services/ad-spend-service.ts)
 *
 * These carry FINANCE invariants where a silent bug is a real-money error:
 *   - account is the index-2 campaign-key segment; any miss → Unattributed,
 *     never a wrong account, never a silent drop
 *   - balance = INR recharged − INR spent (INR ONLY — never mix currencies)
 *   - non-INR recharges are recorded but excluded from the balance
 *   - the empty/zero state (no spend, no recharge) is ₹0, NOT negative
 *
 * Pure functions, no LLM, no DB — so this is fully deterministic and
 * self-asserting (unlike scripts/test-revival-gate.ts, which evals a live LLM).
 * It hard-exits non-zero on any failure, so it works as a CI/pre-deploy gate.
 *
 * buildAccountReport is imported from the service file, which carries no
 * `import "server-only"` guard for the pure export — but createAdminClient is
 * imported at module top, which pulls next/headers. So, like the revival-gate
 * eval, run it through tsx with the @/* path mapping; the admin client is never
 * CALLED here (we only touch the two pure functions), so module load is enough.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/test-account-report.ts
 *
 * (If module load trips on next/headers in your toolchain, the same /tmp shim
 * trick from scripts/test-revival-gate.ts applies — but the pure functions have
 * no server-only import of their own.)
 */

import {
  resolveAccountFromCampaign,
  UNATTRIBUTED_ACCOUNT_KEY,
} from "@/lib/constants/ad-accounts";
import {
  buildAccountReport,
  buildBudgetGaugeSummary,
  type BudgetCampaignRow,
  type AccountRecharge,
} from "@/lib/services/ad-spend-service";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}` + (ok ? "" : `\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`));
}

// ── Helpers to build minimal rows ──────────────────────────────────────────
function spendRow(campaignKey: string, totalSpend: number): BudgetCampaignRow {
  return {
    campaignKey,
    totalSpend,
    totalResults: null,
    totalImpressions: null,
    totalReach: null,
    totalLinkClicks: null,
    leadCount: 0,
    dealCount: 0,
    dealRevenue: 0,
    costPerLead: null,
    costPerDeal: null,
  };
}
/** Spend row carrying lead/deal outcomes (for the gauge ROI roll-up). */
function outcomeRow(
  campaignKey: string,
  totalSpend: number,
  leadCount: number,
  dealCount: number,
  dealRevenue: number,
): BudgetCampaignRow {
  return {
    ...spendRow(campaignKey, totalSpend),
    leadCount,
    dealCount,
    dealRevenue,
    costPerLead: leadCount > 0 ? totalSpend / leadCount : null,
    costPerDeal: dealCount > 0 ? totalSpend / dealCount : null,
  };
}
function recharge(adAccount: string, amount: number, currency = "INR"): AccountRecharge {
  return {
    id: `${adAccount}-${amount}-${currency}`,
    adAccount,
    platform: "meta",
    amount,
    currency,
    rechargedAt: "2026-06-01",
    method: null,
    note: null,
    doneBy: "u1",
    doneByName: "Tester",
  };
}

console.log("── resolveAccountFromCampaign (index-2 segment + Unattributed fallback) ──");
const RESOLVE_CASES: [string | null, string][] = [
  ["tg_global_april_lead gen_17 june", "april"],
  ["tg_global_gmr_lead gen_5 june",    "gmr"],
  ["tg_dubai_dubai_lead gen_21 april", "dubai"],          // account token == domain token, still index 2
  ["tg_global_lead gen_23 april",      UNATTRIBUTED_ACCOUNT_KEY], // old-convention: index2 = a campaign type
  ["tg_global",                        UNATTRIBUTED_ACCOUNT_KEY], // too few segments
  ["organic",                          UNATTRIBUTED_ACCOUNT_KEY],
  ["",                                 UNATTRIBUTED_ACCOUNT_KEY],
  [null,                               UNATTRIBUTED_ACCOUNT_KEY],
  ["TG_GLOBAL_APRIL_LEAD GEN",         "april"],           // uppercase lowered defensively
];
for (const [input, want] of RESOLVE_CASES) {
  check(`resolve(${JSON.stringify(input)})`, resolveAccountFromCampaign(input), want);
}

console.log("\n── buildAccountReport: empty/zero state ──");
{
  // No spend, no recharge → every live account ₹0, balance 0 (NOT negative),
  // no Unattributed block, no non-INR.
  const r = buildAccountReport([], []);
  check("zero: 3 live blocks only", r.blocks.map((b) => b.key), ["april", "gmr", "dubai"]);
  check("zero: all balances are 0 (not negative)", r.blocks.map((b) => b.balance), [0, 0, 0]);
  check("zero: grand total spend 0", r.grandTotalSpend, 0);
  check("zero: grand total recharged 0", r.grandTotalRecharged, 0);
  check("zero: hasNonInr false", r.hasNonInr, false);
}

console.log("\n── buildAccountReport: INR balance + spend attribution ──");
{
  const r = buildAccountReport(
    [spendRow("tg_global_april_lead gen_1 jun", 30000), spendRow("tg_global_april_lp_2 jun", 20000)],
    [recharge("april", 100000)],
  );
  const april = r.blocks.find((b) => b.key === "april")!;
  check("april recharged", april.recharged, 100000);
  check("april spent (two campaigns summed)", april.spent, 50000);
  check("april balance = 100k - 50k", april.balance, 50000);
  check("april campaign count", april.campaigns.length, 2);
  check("grand total spend", r.grandTotalSpend, 50000);
}

console.log("\n── buildAccountReport: negative balance (overspend) ──");
{
  const r = buildAccountReport([spendRow("tg_global_gmr_lead gen_1 jun", 80000)], [recharge("gmr", 50000)]);
  const gmr = r.blocks.find((b) => b.key === "gmr")!;
  check("gmr balance is negative when spend > recharge", gmr.balance, -30000);
}

console.log("\n── buildAccountReport: Unattributed fallback is exercised + visible ──");
{
  // An old-convention campaign key (no resolvable account) must surface as its
  // OWN Unattributed block, never folded into a real account.
  const r = buildAccountReport(
    [spendRow("tg_global_lead gen_23 april", 12345)],
    [],
  );
  const un = r.blocks.find((b) => b.key === UNATTRIBUTED_ACCOUNT_KEY);
  check("Unattributed block exists", Boolean(un), true);
  check("Unattributed holds the unresolved spend", un?.spent, 12345);
  check("Unattributed sorts LAST", r.blocks[r.blocks.length - 1].key, UNATTRIBUTED_ACCOUNT_KEY);
  check("live accounts NOT polluted by the unresolved spend", r.blocks.filter((b) => b.key !== UNATTRIBUTED_ACCOUNT_KEY).every((b) => b.spent === 0), true);
}

console.log("\n── buildAccountReport: non-INR recharge excluded from INR balance ──");
{
  const r = buildAccountReport(
    [spendRow("tg_global_dubai_lead gen_1 jun", 40000)],
    [recharge("dubai", 100000, "INR"), recharge("dubai", 5000, "USD")],
  );
  const dubai = r.blocks.find((b) => b.key === "dubai")!;
  check("dubai INR recharged only (USD excluded)", dubai.recharged, 100000);
  check("dubai balance ignores the USD recharge", dubai.balance, 60000); // 100k - 40k, NOT minus the 5k USD
  check("dubai nonInr line captures the USD", dubai.nonInr, [{ currency: "USD", total: 5000 }]);
  check("report.hasNonInr true", r.hasNonInr, true);
  check("grandTotalRecharged is INR only", r.grandTotalRecharged, 100000);
}

console.log("\n── buildAccountReport: empty Unattributed bucket is dropped ──");
{
  // Spend that all resolves + recharges that all resolve → NO Unattributed block.
  const r = buildAccountReport([spendRow("tg_global_april_lp_1 jun", 1000)], [recharge("april", 2000)]);
  check("no Unattributed block when nothing is unresolved", r.blocks.some((b) => b.key === UNATTRIBUTED_ACCOUNT_KEY), false);
}

// ── buildBudgetGaugeSummary — the dashboard fuel-gauge roll-up ──────────────
// Same finance invariants as buildAccountReport (it is layered over it), plus
// the gauge-specific derivations: consumed = spent/recharged, remaining can go
// negative, CPL/ROAS are null at zero denominators, and the lead/deal/revenue
// roll-up sums ACROSS all campaigns (org-wide — recharges carry no domain).

console.log("\n── buildBudgetGaugeSummary: empty/zero state ──");
{
  const g = buildBudgetGaugeSummary([], []);
  check("zero: recharged 0", g.recharged, 0);
  check("zero: spent 0", g.spent, 0);
  check("zero: remaining 0 (not negative)", g.remaining, 0);
  check("zero: consumed null (no tank to measure)", g.consumed, null);
  check("zero: CPL null (no leads)", g.costPerLead, null);
  check("zero: ROAS null (no spend)", g.roas, null);
  check("zero: campaignCount 0", g.campaignCount, 0);
  check("zero: hasNonInr false", g.hasNonInr, false);
}

console.log("\n── buildBudgetGaugeSummary: tank fill + ROI roll-up (org-wide) ──");
{
  // Two accounts, two campaigns each — the gauge sums across ALL of them.
  const g = buildBudgetGaugeSummary(
    [
      outcomeRow("tg_global_april_lead gen_1 jun", 30000, 60, 3, 240000),
      outcomeRow("tg_global_gmr_lead gen_2 jun",   50000, 40, 2, 160000),
    ],
    [recharge("april", 100000), recharge("gmr", 60000)],
  );
  check("recharged sums both accounts", g.recharged, 160000);
  check("spent sums both campaigns", g.spent, 80000);
  check("remaining = 160k - 80k", g.remaining, 80000);
  check("consumed = 80k/160k", g.consumed, 0.5);
  check("leadCount roll-up", g.leadCount, 100);
  check("dealCount roll-up", g.dealCount, 5);
  check("dealRevenue roll-up", g.dealRevenue, 400000);
  check("CPL = spent/leads", g.costPerLead, 800);
  check("ROAS = revenue/spent", g.roas, 5);
  check("campaignCount", g.campaignCount, 2);
}

console.log("\n── buildBudgetGaugeSummary: overspend (remaining negative, consumed > 1) ──");
{
  const g = buildBudgetGaugeSummary(
    [outcomeRow("tg_global_april_lead gen_1 jun", 120000, 50, 0, 0)],
    [recharge("april", 100000)],
  );
  check("remaining negative when spend > recharge", g.remaining, -20000);
  check("consumed > 1 when overspent", g.consumed, 1.2);
  check("ROAS 0 (revenue 0, spend > 0)", g.roas, 0); // 0/120000 = 0, not null
}

console.log("\n── buildBudgetGaugeSummary: non-INR recharge excluded from the tank ──");
{
  // The USD recharge must NOT inflate the tank — INR-only, same as the report.
  const g = buildBudgetGaugeSummary(
    [outcomeRow("tg_global_dubai_lead gen_1 jun", 40000, 20, 1, 80000)],
    [recharge("dubai", 100000, "INR"), recharge("dubai", 5000, "USD")],
  );
  check("recharged is INR only (USD excluded)", g.recharged, 100000);
  check("remaining ignores the USD recharge", g.remaining, 60000);
  check("hasNonInr true", g.hasNonInr, true);
}

console.log("\n── buildBudgetGaugeSummary: spend but no recharge (consumed null) ──");
{
  // Spend with zero recharge → consumed null (the widget shows the EmptyGauge
  // "no recharge logged" branch + the spend figure, never a ÷0).
  const g = buildBudgetGaugeSummary([outcomeRow("tg_global_april_lp_1 jun", 5000, 10, 0, 0)], []);
  check("recharged 0", g.recharged, 0);
  check("spent surfaced", g.spent, 5000);
  check("consumed null (no recharge denominator)", g.consumed, null);
  check("remaining = -spent", g.remaining, -5000);
}

console.log(
  failures === 0
    ? "\n✅ ALL PASS — account attribution + balance + fuel-gauge invariants hold"
    : `\n❌ ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
