// safeReturnPath() — THE "where to go after login" guard.
//
// A `next` value from a query string or a hidden form field is untrusted. Only a path on this
// site is allowed: it must start with one "/", never "//" or "/\" (protocol-relative escapes),
// and carry no scheme. Anything else yields null and the caller falls back to its default.

const MAX_LEN = 2048;

export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > MAX_LEN) return null;
  if (!v.startsWith('/')) return null;
  if (v.startsWith('//') || v.startsWith('/\\')) return null;
  if (/[\r\n]/.test(v)) return null;
  return v;
}
