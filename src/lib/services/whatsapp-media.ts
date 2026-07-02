// SERVER ONLY — do not import in client components.
// WhatsApp media durability layer (Phase C, 2026-06-23).
//
// Gupshup delivers inbound media as a direct, TIME-LIMITED CDN url — storing that
// url means old media 404s once the link expires. This module downloads the bytes
// and re-uploads them to the PRIVATE `whatsapp-media` Supabase Storage bucket
// (migration 0141), so whatsapp_messages.media_url holds a durable STORAGE PATH,
// never a url. Reads mint short-lived signed urls via signMediaPath().
//
// All operations use the ADMIN (service-role) client: the inbound webhook has no
// session, and signed-url minting on read is gated by the page/action role layer
// (the whatsapp_messages RLS posture), not by storage RLS. Never import the
// session client here.

import { createAdminClient } from '@/lib/supabase/admin';

const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media';

// Signed-url lifetime for reads. Short enough that a leaked url ages out quickly,
// long enough to outlast a normal page session + scrollback.
const WHATSAPP_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

// Hard cap on a single inbound media download. Gupshup/Meta media is bounded
// (images ≤5MB, video/document ≤16MB on WhatsApp), but guard against a hostile
// or runaway response so the webhook lambda never balloons.
const MAX_INBOUND_MEDIA_BYTES = 32 * 1024 * 1024; // 32 MB

// ─────────────────────────────────────────────
// mediaExtFromMime — best-effort file extension from a MIME type.
// Falls back to 'bin' for unknown types (the path extension is cosmetic — the
// stored media_mime_type column is the authoritative content type).
// ─────────────────────────────────────────────

const MIME_EXT: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'image/gif':       'gif',
  'video/mp4':       'mp4',
  'video/3gpp':      '3gp',
  'audio/ogg':       'ogg',
  'audio/mpeg':      'mp3',
  'audio/mp4':       'm4a',
  'audio/amr':       'amr',
  'application/pdf': 'pdf',
};

function mediaExtFromMime(mimeType: string | null | undefined): string {
  if (!mimeType) return 'bin';
  const base = mimeType.split(';')[0]!.trim().toLowerCase();
  if (MIME_EXT[base]) return MIME_EXT[base];
  // image/foo → foo as a last resort
  const slash = base.indexOf('/');
  if (slash !== -1) {
    const sub = base.slice(slash + 1);
    if (/^[a-z0-9]{1,8}$/.test(sub)) return sub;
  }
  return 'bin';
}

// ─────────────────────────────────────────────
// storeInboundMedia — download a Gupshup CDN url and persist it durably.
// Returns the storage PATH on success, or null on any failure (download error,
// empty body, oversize, upload error) so the caller can fall back to the raw url.
// Never throws — media durability is best-effort and must not lose the message.
// ─────────────────────────────────────────────

export async function storeInboundMedia(
  cdnUrl:    string,
  mimeType:  string,
  leadId:    string,
  messageId: string,
): Promise<string | null> {
  try {
    const res = await fetch(cdnUrl);
    if (!res.ok) {
      console.error(`[whatsapp-media] CDN download failed: ${res.status} for ${messageId}`);
      return null;
    }

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) {
      console.error(`[whatsapp-media] CDN download returned 0 bytes for ${messageId}`);
      return null;
    }
    if (bytes.byteLength > MAX_INBOUND_MEDIA_BYTES) {
      console.error(`[whatsapp-media] media exceeds cap (${bytes.byteLength}B) for ${messageId}`);
      return null;
    }

    // Prefer the server-declared content type; fall back to the message's mime.
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || mimeType || 'application/octet-stream';
    const ext  = mediaExtFromMime(contentType);
    const path = `${leadId}/${messageId}.${ext}`;

    const admin = createAdminClient();
    const { error } = await admin.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .upload(path, bytes, {
        contentType,
        upsert: true, // idempotent — a re-delivered message overwrites identically
      });

    if (error) {
      console.error(`[whatsapp-media] upload failed for ${messageId}:`, error.message);
      return null;
    }

    return path;
  } catch (err) {
    console.error(`[whatsapp-media] storeInboundMedia threw for ${messageId}:`, err);
    return null;
  }
}

// ─────────────────────────────────────────────
// storeOutboundMedia — upload a staff-attached file to the bucket.
// Returns the storage PATH on success, null on failure. Mirrors the inbound
// path's bucket + layout (`{leadId}/out-{key}.{ext}`) so a conversation's media
// stays grouped under one prefix. Same admin client, same size cap.
// ─────────────────────────────────────────────

export async function storeOutboundMedia(
  bytes:    ArrayBuffer | Uint8Array,
  mimeType: string,
  leadId:   string,
  key:      string,
): Promise<string | null> {
  try {
    const size = bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength;
    if (size === 0 || size > MAX_INBOUND_MEDIA_BYTES) {
      console.error(`[whatsapp-media] outbound media size invalid (${size}B)`);
      return null;
    }

    const contentType = mimeType || 'application/octet-stream';
    const ext  = mediaExtFromMime(contentType);
    const path = `${leadId}/out-${key}.${ext}`;

    const admin = createAdminClient();
    const { error } = await admin.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });

    if (error) {
      console.error('[whatsapp-media] outbound upload failed:', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error('[whatsapp-media] storeOutboundMedia threw:', err);
    return null;
  }
}

// ─────────────────────────────────────────────
// signMediaPath — mint a short-lived signed url for a stored media path.
// A value that already looks like an absolute url (legacy raw-CDN fallback rows,
// or a not-yet-migrated row) is returned unchanged. Returns null when signing
// fails so the caller can render the "media unavailable" affordance.
// ─────────────────────────────────────────────

export async function signMediaPath(pathOrUrl: string | null): Promise<string | null> {
  if (!pathOrUrl) return null;
  // Legacy / fallback rows store the raw CDN url — pass through untouched.
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .createSignedUrl(pathOrUrl, WHATSAPP_MEDIA_SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      console.error('[whatsapp-media] createSignedUrl failed:', error?.message);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error('[whatsapp-media] signMediaPath threw:', err);
    return null;
  }
}
