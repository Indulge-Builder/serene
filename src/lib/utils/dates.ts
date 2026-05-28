import { formatInTimeZone } from "date-fns-tz";

export const DEFAULT_TZ = "Asia/Kolkata";

export function formatDate(
  date: Date | string,
  fmt = "dd MMM yyyy",
  tz = DEFAULT_TZ,
): string {
  return formatInTimeZone(new Date(date), tz, fmt);
}

export function toUTC(date: Date | string): Date {
  return new Date(new Date(date).toISOString());
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
export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return "—";
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
