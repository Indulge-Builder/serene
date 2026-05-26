// Strip HTML tags, normalize whitespace, trim.
// Pure regex — no jsdom dependency, safe in all Next.js contexts.
export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/&[a-z]+;/gi, '') // strip HTML entities (&amp; &lt; etc.)
    .replace(/\s+/g, ' ')      // collapse whitespace
    .trim();
}
