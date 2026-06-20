"use client";

// Recharge history — admin/founder ledger view. Sanctioned Table<T> use
// (read-only RPC-result-style grid, no toolbar/column-picker).

import { Table, type TableColumn } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils/numbers";
import { formatDate } from "@/lib/utils/dates";
import { accountLabel, AD_ACCOUNT_MAP } from "@/lib/constants/ad-accounts";
import type { AccountRecharge } from "@/lib/services/ad-spend-service";
import type { AdAccountKey } from "@/lib/constants/ad-accounts";

function labelForStoredAccount(key: string): string {
  return key in AD_ACCOUNT_MAP ? accountLabel(key as AdAccountKey) : key;
}

const COLUMNS: TableColumn<AccountRecharge>[] = [
  {
    id:     "date",
    header: "Date",
    cell:   (row) => formatDate(row.rechargedAt, "dd MMM yyyy"),
  },
  {
    id:     "account",
    header: "Account",
    cell:   (row) => (
      <span style={{ fontWeight: "var(--weight-medium)", color: "var(--theme-text-primary)" }}>
        {labelForStoredAccount(row.adAccount)}
      </span>
    ),
  },
  {
    id:     "amount",
    header: "Amount",
    align:  "right",
    cell:   (row) => formatCurrency(row.amount, row.currency === "USD" ? "USD" : "INR"),
  },
  {
    id:     "method",
    header: "Method",
    cell:   (row) => row.method ?? "—",
  },
  {
    id:     "note",
    header: "Note",
    cell:   (row) => row.note ?? "—",
  },
  {
    id:     "by",
    header: "By",
    cell:   (row) => row.doneByName ?? "—",
  },
];

export function RechargeHistoryTable({ rows }: { rows: AccountRecharge[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title="No recharges recorded for this period."
        size="sm"
      />
    );
  }
  return (
    <Table<AccountRecharge>
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.id}
      stickyHeader
    />
  );
}
