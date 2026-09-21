// rowsToCsv() — THE server-safe rows → CSV serializer (no dependency, no DOM).
//
// utils/export.ts builds the leads CSV / XLSX in the BROWSER (it loads xlsx dynamically and
// triggers a download) and must never be imported server-side. This is the other half: a plain
// serializer a server module can call, used by the MCP connector's export_rows tool. RFC 4180:
// a field holding a comma, a quote, or a line break is quoted, quotes are doubled. Columns are the
// union of every row's keys in first-seen order, so a sparse JSON result still lines up.

const NEEDS_QUOTE = /[",\r\n]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return NEEDS_QUOTE.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: readonly Record<string, unknown>[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const lines = [columns.map(cell).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  return lines.join('\r\n');
}
