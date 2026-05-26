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
