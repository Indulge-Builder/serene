/**
 * Identity-string helpers shared by avatar surfaces.
 *
 * getInitials() — THE canonical initials derivation. Never re-implement inline.
 *   ""              → "?"
 *   "Madonna"       → "M"
 *   "Anna M. Lopez" → "AL"  (first + last word)
 *
 * hashString() — THE canonical deterministic string hash for colour/icon picks
 * (avatar fallback pairs, group-card accent fallbacks). Always non-negative;
 * use as hashString(x) % palette.length.
 */

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) & 0xffff;
  }
  return h;
}
