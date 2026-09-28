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
  if (parts.length === 1) return firstGlyph(parts[0]).toUpperCase();
  return (firstGlyph(parts[0]) + firstGlyph(parts[parts.length - 1])).toUpperCase();
}

/**
 * First code point of a word. charAt(0) slices an emoji's UTF-16 surrogate pair
 * in half — a lone surrogate the server serializes as U+FFFD while the client
 * keeps the raw half, so SSR hydration diverges (live case: a WhatsApp group
 * named "… 💸"). Array.from iterates by code point, keeping the emoji whole.
 */
function firstGlyph(word: string): string {
  return Array.from(word)[0] ?? '';
}

/**
 * THE safe text cut: at most `max` UTF-16 units, never ending on half an emoji. A plain
 * .slice() can leave a lone surrogate, which is not valid JSON: a model request carrying one is
 * refused ("no low surrogate in string", the jokers' reply reader, 2026-09-24) and a row
 * written with one can fail too. Use it wherever message text is shortened to send or store.
 */
export function clipText(value: string, max: number): string {
  if (value.length <= max) return value;
  const code = value.charCodeAt(max - 1);
  return value.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

export function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) & 0xffff;
  }
  return h;
}
