import { formatInTimeZone } from "date-fns-tz";

export const DEFAULT_TZ = "Asia/Kolkata";

export function formatDate(
  date: Date | string,
  fmt = "dd MMM yyyy",
  tz = DEFAULT_TZ,
): string {
  return formatInTimeZone(new Date(date), tz, fmt);
}

/** Task row due stamp (IST) — matches Gia task list on /tasks and lead dossier. */
export function formatTaskDueAt(
  dueAt: Date | string | null | undefined,
): string | null {
  if (!dueAt) return null;
  return formatDate(dueAt, "h:mm a, d MMM");
}

export function toUTC(date: Date | string): Date {
  return new Date(new Date(date).toISOString());
}

// ── Calendar text ↔ Date (2026-09-25) ────────────────────────────────────────
// Forms hold calendar dates as the text the database stores ('YYYY-MM-DD',
// 'YYYY-MM-DDTHH:mm' for a moment, 'YYYY-MM' for a month). The DatePicker
// works in Date objects in the browser's own clock. These convert between the
// two WITHOUT a timezone step: the calendar day the user picked is the calendar
// day that is stored, wherever they are.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 'YYYY-MM-DD' → a local Date at midnight, or null for blank or malformed text. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** A Date → 'YYYY-MM-DD' (the local calendar day); '' for null. */
export function toIsoDate(date: Date | null | undefined): string {
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 'YYYY-MM-DDTHH:mm' (the old datetime-local text) → a local Date, or null. */
export function parseIsoDateTime(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

/** A Date → 'YYYY-MM-DDTHH:mm' (local); '' for null. */
export function toIsoDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  return `${toIsoDate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 'YYYY-MM' → the first of that month as a local Date, or null. */
export function parseIsoMonth(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

/** A Date → 'YYYY-MM'; '' for null. */
export function toIsoMonth(date: Date | null | undefined): string {
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/**
 * Formats a timestamp as a relative string.
 * < 1m → "just now"
 * < 60m → "14m ago"
 * < 24h → "3h ago"
 * < 7d  → "2d ago"
 * else  → "12 May"
 */
export function formatRelativeTime(date: Date | string): string {
  const d      = new Date(date);
  const now    = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffS  = Math.floor(diffMs / 1000);
  const diffM  = Math.floor(diffS / 60);
  const diffH  = Math.floor(diffM / 60);
  const diffD  = Math.floor(diffH / 24);

  if (diffS < 60)  return "just now";
  if (diffM < 60)  return `${diffM}m ago`;
  if (diffH < 24)  return `${diffH}h ago`;
  if (diffD < 7)   return `${diffD}d ago`;
  return formatDate(d, "d MMM");
}

/**
 * Formats a duration in minutes as a human-readable string.
 * null → "—" (absence, not zero)
 * < 60 min → "48m"
 * ≥ 60 min → "2h 34m"
 */
/**
 * Normalises PostgreSQL `time` strings (often `HH:MM:SS`) to `HH:MM` for UI + validation.
 */
export function normalizeTimeHHMM(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return "—";
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
