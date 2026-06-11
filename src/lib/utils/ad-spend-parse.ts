// CLIENT-SIDE ONLY — never import this file from a server action or service.
// xlsx is dynamically imported to avoid server bundle inclusion (same rule as
// lib/utils/export.ts).
//
// Parses a Meta Ads daily-breakdown export (CSV or XLSX) into ad_spend_daily
// upsert rows. Column whitelist from the Meta export:
//   Reporting starts · Reporting ends · Campaign name · Results ·
//   Amount spent (INR) · Impressions · Reach · Link clicks
// Everything else in the file is discarded.
//
// THE GRAIN GUARD (the single most important check in this module): every row
// must have Reporting starts === Reporting ends. A range-grain export (one row
// spanning the whole reporting window) would be silently double-counted on the
// next day-grain upload — so the ENTIRE file is rejected with an instructional
// error, never partially ingested.

import { normalizeCampaignKey } from "@/lib/utils/campaigns";

export type AdSpendUploadRow = {
  campaign_key: string;
  spend_date:   string; // YYYY-MM-DD
  spend:        number;
  results:      number | null;
  impressions:  number | null;
  reach:        number | null;
  link_clicks:  number | null;
};

export type ParsedAdSpend = {
  ok:       true;
  rows:     AdSpendUploadRow[];
  /** Zero-spend (inactive) rows dropped during parsing */
  skipped:  number;
  dateFrom: string;
  dateTo:   string;
};

export type AdSpendParseError = {
  ok:    false;
  error: string;
};

const REQUIRED_HEADERS = [
  "Reporting starts",
  "Reporting ends",
  "Campaign name",
  "Amount spent (INR)",
] as const;

const RANGE_GRAIN_ERROR =
  "This file is a date-range export, not a daily breakdown. " +
  "In Meta Ads Manager, re-export with Breakdown → By time → Day, then upload again.";

/** "2026-06-01" passthrough; also tolerates Excel-formatted date cells. */
function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : parseFloat(String(value).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function toCount(value: unknown): number | null {
  const n = toNumber(value);
  return n === null ? null : Math.round(n);
}

/**
 * Parse a Meta daily-breakdown export file into upsert rows.
 * Returns a discriminated result — never throws for file-content problems.
 */
export async function parseMetaSpendFile(
  file: File,
): Promise<ParsedAdSpend | AdSpendParseError> {
  let sheetRows: Record<string, unknown>[];
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: true,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return { ok: false, error: "The file appears to be empty." };
    sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
    });
  } catch {
    return {
      ok: false,
      error: "Couldn't read that file. Please upload the CSV or XLSX exported from Meta Ads Manager.",
    };
  }

  if (sheetRows.length === 0) {
    return { ok: false, error: "The file has no data rows." };
  }

  // Header whitelist check — keys are the first row's headers
  const headers = Object.keys(sheetRows[0]).map((h) => h.trim());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing expected Meta export column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Export from Meta Ads Manager with the daily breakdown.`,
    };
  }

  // Merge duplicate (campaign, day) rows defensively — a single upsert
  // statement cannot affect the same conflict key twice.
  const merged = new Map<string, AdSpendUploadRow>();
  let skipped = 0;

  for (const raw of sheetRows) {
    const starts = toIsoDate(raw["Reporting starts"]);
    const ends   = toIsoDate(raw["Reporting ends"]);

    if (!starts || !ends) {
      return {
        ok: false,
        error: "A row has an unreadable reporting date. Re-export the report from Meta Ads Manager and try again.",
      };
    }

    // THE grain guard — reject the whole file on any range row
    if (starts !== ends) {
      return { ok: false, error: RANGE_GRAIN_ERROR };
    }

    const campaignRaw = raw["Campaign name"];
    const campaignKey =
      typeof campaignRaw === "string" ? normalizeCampaignKey(campaignRaw) : "";
    const spend = toNumber(raw["Amount spent (INR)"]) ?? 0;

    // Zero-spend inactive rows (and unnamed summary rows) are skipped
    if (!campaignKey || spend <= 0) {
      skipped += 1;
      continue;
    }

    const row: AdSpendUploadRow = {
      campaign_key: campaignKey,
      spend_date:   starts,
      spend,
      results:      toCount(raw["Results"]),
      impressions:  toCount(raw["Impressions"]),
      reach:        toCount(raw["Reach"]),
      link_clicks:  toCount(raw["Link clicks"]),
    };

    const key = `${row.campaign_key}::${row.spend_date}`;
    const existing = merged.get(key);
    if (existing) {
      existing.spend       += row.spend;
      existing.results      = sumNullable(existing.results, row.results);
      existing.impressions  = sumNullable(existing.impressions, row.impressions);
      existing.reach        = sumNullable(existing.reach, row.reach);
      existing.link_clicks  = sumNullable(existing.link_clicks, row.link_clicks);
    } else {
      merged.set(key, row);
    }
  }

  const rows = [...merged.values()];
  if (rows.length === 0) {
    return {
      ok: false,
      error: "Every row in this file has zero spend — nothing to import.",
    };
  }

  const dates = rows.map((r) => r.spend_date).sort();
  return {
    ok: true,
    rows,
    skipped,
    dateFrom: dates[0],
    dateTo:   dates[dates.length - 1],
  };
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}
