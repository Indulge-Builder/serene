// link-preview.ts — THE reader of a WhatsApp link preview (2026-10-01). When someone sends a link,
// their phone builds the preview (title, description, a small jpeg) and WhatsApp carries it inside
// the message (`extendedTextMessage`). Serene never fetches the page itself: the preview is read
// from what the sender's phone already put in the message, so there is no network call and no way
// for a link to make our server visit an address. Sia (sia-service) and Hands (hands-service) both
// read through here; <LinkPreviewCard> (components/ui) is the one way it is drawn. Pure, client-safe.

export type LinkPreview = {
  url: string;
  /** The host, shown under the title ("booking.com"). */
  domain: string;
  title: string;
  description: string | null;
  /** A data: url of the sender's jpeg thumbnail, or null. */
  thumbnail: string | null;
};

/** The preview fields as WhatsApp sends them on an extendedTextMessage. */
export type WaPreviewFields = {
  title?: string | null;
  description?: string | null;
  canonicalUrl?: string | null;
  matchedText?: string | null;
  /** Base64 of the jpeg (how the Sia watcher stores bytes). */
  jpegThumbnail?: string | null;
};

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 300;
/** ~64 KB of jpeg; WhatsApp's own thumbnails are 5 to 30 KB. Anything bigger is not a thumbnail. */
const THUMBNAIL_MAX_CHARS = 90_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function safeUrl(raw: string | null | undefined): URL | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function clip(text: string | null | undefined, max: number): string | null {
  const t = text?.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** The preview a message carries, or null when it carries none (no title or no safe http(s) link). */
export function readLinkPreview(fields: WaPreviewFields | null | undefined): LinkPreview | null {
  if (!fields) return null;
  const title = clip(fields.title, TITLE_MAX);
  const url = safeUrl(fields.canonicalUrl) ?? safeUrl(fields.matchedText);
  if (!title || !url) return null;
  const thumb = typeof fields.jpegThumbnail === "string" ? fields.jpegThumbnail : null;
  return {
    url: url.toString(),
    domain: url.hostname.replace(/^www\./, ""),
    title,
    description: clip(fields.description, DESCRIPTION_MAX),
    thumbnail: thumb && thumb.length <= THUMBNAIL_MAX_CHARS && BASE64.test(thumb) ? `data:image/jpeg;base64,${thumb}` : null,
  };
}

/** Cheap test before reading a preview: only a message whose text holds a link can carry one. */
export function mayCarryLinkPreview(text: string | null | undefined): boolean {
  return !!text && /https?:\/\/|www\./i.test(text);
}
