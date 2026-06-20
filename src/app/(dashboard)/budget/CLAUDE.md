# /budget — CLAUDE.md

The budget page has TWO data planes that share one date range and one page:

1. **Campaign spend** — uploaded Meta daily-breakdown CSV/XLSX → `ad_spend_daily`
   → `get_budget_summary` RPC. Spend per campaign joined to lead/deal outcomes.
   Reads only from our DB, never a live Meta API call. **No Redis** (always-live,
   like `/campaigns`).
2. **Account recharges** — a finance ledger of money sent to each Meta ad
   account → `ad_account_recharges` → `getAccountRecharges`. Kept **separate**
   from spend; the per-account report joins the two by *deriving* account from
   each campaign key.

**Access:** manager (read) · admin/founder (read + upload + add recharge) ·
agent/guest → `redirect('/dashboard')`. Two layers (A-09): the page role
redirect AND RLS on both tables (manager+ SELECT, admin/founder write).

---

## Account attribution — the one rule that must never drift

Account is **derived from the campaign key, never stored on spend**
(`ad_spend_daily` has no account column — exactly like domain).

Convention: `TG_<Domain>_<Account>_<Type>_<Date>`, normalised lowercase. The ad
account is the **third `_`-delimited segment (index 2)**:

```text
tg_global_april_lead gen_17 june
└0─┘ └─1──┘ └─2─┘  …
              ▲ account
```

`resolveAccountFromCampaign(key)` (`lib/constants/ad-accounts.ts`) splits on `_`,
matches index 2 against `AD_ACCOUNTS`, and falls back to the visible
**`'unattributed'`** bucket on any miss — the index-2 twin of
`resolveDomainFromCampaign` (which keys off the index-1 domain segment).

**Non-negotiables (this is real money):**

- An unknown / missing / malformed account segment → **Unattributed**, rendered
  **visibly** (warning-tinted block + "rename to attribute" hint). NEVER merged
  into another account, NEVER silently dropped. Unattributed showing up is what
  makes the post-rename pass self-auditing.
- `AD_ACCOUNTS` is the single source: the 3 live accounts (`april` / `gmr` /
  `dubai`) + Meta account ids. The DB CHECK on `ad_account_recharges.ad_account`
  mirrors `AD_ACCOUNT_KEY_VALUES`. The placeholder **"Indulge New Gen"** is added
  later as a ONE-LINE `AD_ACCOUNTS` edit + a CHECK-extending migration — no other
  code change.
- `ad_spend_daily` is empty today and existing campaign names predate the
  convention (they'll be renamed after this ships) — so index-2 parsing is
  correct for every row that will *ever* land in the table. Do not build for the
  old names.

---

## Balance = recharged − spent — INR ONLY

`buildAccountReport(campaignRows, recharges)` (`ad-spend-service.ts`, pure, no IO)
groups spend by `resolveAccountFromCampaign` and recharges by `ad_account`, then:

- **balance = INR recharged − INR spent.** NEVER subtract a non-INR recharge
  from INR spend (currency cross-contamination = a finance error).
- Non-INR recharges are summed per currency into `block.nonInr` for display and
  **excluded** from `recharged` / `balance`; `report.hasNonInr` drives the
  page footnote.
- Every live account gets a block even at zero activity (stable 3-up grid);
  Unattributed appears only when it has spend or a (mis-keyed) recharge.

---

## PII — `method` is a label, never card data

`ad_account_recharges.method` is a free-text payment-method LABEL ('NEFT',
'Razorpay', 'Card'). Three guards, defence in depth:

1. Zod (`recharge-schema.ts`) rejects any value with a 13–19 digit run (a card
   PAN, tolerant of space/hyphen grouping).
2. The action re-`sanitizeText`s it.
3. The DB CHECK `ad_account_recharges_no_card_pan` rejects a PAN structurally.

No raw card number can persist.

---

## File map

```text
lib/constants/ad-accounts.ts        ← AD_ACCOUNTS + resolveAccountFromCampaign (THE attribution primitive)
lib/services/ad-spend-service.ts    ← getBudgetSummary, getAccountRecharges, buildAccountReport (pure)
scripts/test-account-report.ts      ← committed regression check for the two PURE functions above
                                       (resolve index-2 + Unattributed fallback; INR-only balance;
                                       non-INR exclusion; zero-state = ₹0 not negative). Deterministic,
                                       self-asserting, hard-exits non-zero. Run:
                                       npx tsx --tsconfig tsconfig.json scripts/test-account-report.ts
lib/actions/recharge.ts             ← createRechargeAction (admin/founder)
lib/validations/recharge-schema.ts  ← createRechargeSchema (+ card-PAN reject)
supabase/migrations/…139_ad_account_recharges.sql

app/(dashboard)/budget/page.tsx     ← header (Add Recharge + Upload Spend, admin/founder), filter bar, Suspense
app/(dashboard)/budget/BudgetAsync.tsx ← fetches summary + recharges, builds report, totals strip
components/budget/BudgetWorkspace.tsx  ← client tabs: Accounts | Campaigns
components/budget/AccountReportSection.tsx ← per-account blocks (StatTile cells + expandable BudgetTable) + grand total
components/budget/RechargeHistoryTable.tsx ← Table<T> recharge ledger
components/budget/AddRechargeButton.tsx + AddRechargeModal.tsx ← the recharge form (dynamic, admin/founder)
components/budget/BudgetTable.tsx       ← per-campaign grid (reused inside the account expander)
components/budget/AdSpendUploadButton/Modal.tsx ← Meta CSV upload (unchanged logic; copy clarifies weekly cadence)
```

## Reuse invariants

- Recharge form composes `Modal`; the recharge history + per-account campaign
  breakdown compose `Table<T>`; account summary tiles compose `StatTile`
  variant="cell" (balance is a bespoke cell only so overspend can render in
  danger — StatTile's cell value is always accent).
- Date range stays on the shared `PerformanceFilters` contract — never fork it.
- The grain guard in `ad-spend-parse.ts` is correct and untouched. Weekly
  cadence already works (a multi-day daily-breakdown export uploads as one row
  per day, idempotent on re-upload). The upload copy says so.
