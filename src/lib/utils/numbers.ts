// ─────────────────────────────────────────────────────────────────────────────
// Number formatting utilities — design-dna.md §8.2
//
// formatCount    — exact integers with commas. null → "—"
// formatCompact  — K/M abbreviation for stat cards. null → "—"
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
 * Below 1,000:  full number  → "847"
 * 1,000–9,999:  1 decimal K  → "1.2K"
 * 10,000–999,999: no decimal K → "12K"
 * 1,000,000+:  1 decimal M  → "1.2M"
 * null / undefined → "—"
 * string input (Recharts categorical axis labels) → parsed as number; if NaN, returned as-is
 */
export function formatCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  // Non-numeric string (e.g. a Recharts category label like "Jan") → pass through unchanged
  if (isNaN(n)) return String(value);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = n / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (abs >= 10_000) {
    const k = Math.round(n / 1_000);
    return `${k}K`;
  }
  if (abs >= 1_000) {
    const k = n / 1_000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
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
  options?: { multiplied?: boolean },
): string {
  if (value === null || value === undefined) return '—';
  const pct = options?.multiplied ? value : value * 100;
  // Whole number → no decimal; otherwise one decimal
  const formatted = Number.isInteger(pct) ? `${pct}` : `${pct.toFixed(1)}`;
  return `${formatted}%`;
}

/**
 * Compact currency — for stat cards and chart axes.
 * Combines formatCompact magnitude with a currency symbol prefix.
 * null → "—"
 */
export function formatCurrencyCompact(
  value: number | null | undefined,
  currency: 'INR' | 'USD' = 'INR',
): string {
  if (value === null || value === undefined) return '—';
  const symbol = currency === 'INR' ? '₹' : '$';
  return `${symbol}${formatCompact(value)}`;
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
