// ─────────────────────────────────────────────────────────────────────────────
// Number formatting utilities — design-dna.md §8.2
//
// formatCount    — exact integers with commas. null → "—"
// formatCompact  — K/L/Cr (Indian) for stat cards. null → "—"
// formatPercent  — ratio (0–1) → "74.2%". null → "—"
// formatCurrency — INR / USD with locale-correct separators. null → "—"
// ─────────────────────────────────────────────────────────────────────────────

/** Standard count — exact integer with commas. null → "—" */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN').format(value);
}

/**
 * Compact — for stat cards, dashboard metrics, and Recharts tickFormatters.
 * Indian market ladder (design-dna.md §8.2):
 *   Below 1,000:       full number → "847"
 *   1,000–9,999:       1 decimal K → "1.2K"
 *   10,000–99,999:     whole K     → "12K"
 *   1,00,000–99,99,999: L (lakh)   → "12.5L"
 *   1,00,00,000+:      Cr (crore)  → "1.2Cr"
 * null / undefined → "—"
 * string input (Recharts categorical axis labels) → parsed as number; if NaN, returned as-is
 */
export function formatCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  // Non-numeric string (e.g. a Recharts category label like "Jan") → pass through unchanged
  if (isNaN(n)) return String(value);
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) {
    const cr = n / 1_00_00_000;
    return Number.isInteger(cr) ? `${cr}Cr` : `${cr.toFixed(1)}Cr`;
  }
  if (abs >= 1_00_000) {
    const l = n / 1_00_000;
    return Number.isInteger(l) ? `${l}L` : `${l.toFixed(1)}L`;
  }
  if (abs >= 10_000) {
    const k = Math.round(n / 1_000);
    return `${k}K`;
  }
  if (abs >= 1_000) {
    const k = n / 1_000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  // Below 1,000: full number, but never leak float noise (e.g. a summed spend
  // of 566.400000052) — round to whole units, the compact ladder's intent.
  return `${Math.round(n)}`;
}

/** Western K/M ladder — USD compact currency only */
function formatCompactWestern(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = n / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (abs >= 10_000) {
    return `${Math.round(n / 1_000)}K`;
  }
  if (abs >= 1_000) {
    const k = n / 1_000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  // Below 1,000: full number, rounded so float noise never leaks ($566.40… → $566).
  return `${Math.round(n)}`;
}

/**
 * Percentage — accepts a ratio (0–1) OR a pre-multiplied percentage (0–100).
 * Pass `{ multiplied: true }` when the value is already 0–100.
 * Always one decimal unless the value is a whole number.
 * null → "—"
 *
 * Examples (ratio input):
 *   formatPercent(0.742)  → "74.2%"
 *   formatPercent(1.0)    → "100%"
 *   formatPercent(0)      → "0%"
 */
export function formatPercent(
  value: number | null | undefined,
  options?: { multiplied?: boolean; decimals?: 0 | 1 },
): string {
  if (value === null || value === undefined) return '—';
  const raw = options?.multiplied ? value : value * 100;
  // Round to the requested precision first so 74.97 → "75%" (never "75.0%").
  const factor = (options?.decimals ?? 1) === 0 ? 1 : 10;
  const pct = Math.round(raw * factor) / factor;
  // Whole number → no decimal; otherwise one decimal
  const formatted = Number.isInteger(pct) ? `${pct}` : `${pct.toFixed(1)}`;
  return `${formatted}%`;
}

/**
 * Compact currency — for stat cards and chart axes.
 * INR: ₹ + K/L/Cr (never M). USD: $ + K/M.
 * null → "—"
 */
export function formatCurrencyCompact(
  value: number | null | undefined,
  currency: 'INR' | 'USD' = 'INR',
): string {
  if (value === null || value === undefined) return '—';
  const symbol = currency === 'INR' ? '₹' : '$';
  const magnitude =
    currency === 'INR' ? formatCompact(value) : formatCompactWestern(value);
  return `${symbol}${magnitude}`;
}

/**
 * Currency — INR uses Indian numbering (1,00,000). USD uses Western.
 * Always shows the symbol. null → "—"
 */
export function formatCurrency(
  value: number | null | undefined,
  currency: 'INR' | 'USD' = 'INR',
): string {
  if (value === null || value === undefined) return '—';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style:                 'currency',
    currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}
