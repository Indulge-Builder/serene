import DOMPurify from "isomorphic-dompurify";

export function sanitizeText(input: string): string {
  return DOMPurify.sanitize(input.trim(), { ALLOWED_TAGS: [] })
    .replace(/\s+/g, " ")
    .trim();
}
