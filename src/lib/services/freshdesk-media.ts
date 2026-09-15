// freshdesk-media.ts — THE durable copy of Freshdesk files (migration 0197). Freshdesk hands
// the API a link that expires in hours, so at the moment a thread is pulled this copies every
// file and every pasted image into the PRIVATE `freshdesk-attachments` bucket and keeps the
// storage path beside the file's name. The page signs a one-hour link on read.
//
// The whatsapp-media.ts posture: admin client, best-effort, never throws — a copy that fails
// leaves the name (and the reason) on the note, never loses the note. Freshdesk is never
// written to. No `server-only` guard: like freshdesk-sync.ts, the laptop loop
// (scripts/freshdesk/backfill.ts) runs this outside Next.

import { createAdminClient } from "@/lib/supabase/admin";
import { FD_ATTACHMENT_MAX_BYTES, FD_ATTACHMENT_SIGNED_TTL_SECONDS, FRESHDESK_ATTACHMENT_BUCKET, fdAttachmentExt } from "@/lib/constants/freshdesk";
import type { FdAttachment } from "@/lib/types/freshdesk";

const LOG = "[freshdesk-media]";

// ─── Inline images ───────────────────────────────────────────────────────────

/** Only Freshdesk's own hosts are copied — a note can embed any web image, and those stay links. */
const FRESHDESK_HOST_RE = /^https?:\/\/[^/]*(freshdesk\.com|freshworks\.com|freshcloud\.io)\//i;
const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;

/** The Freshdesk-hosted images pasted into a note body, in order, de-duplicated. */
export function extractInlineImages(html: string | null | undefined): string[] {
  if (!html) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(IMG_SRC_RE)) {
    const src = m[1].replace(/&amp;/g, "&");
    if (!FRESHDESK_HOST_RE.test(src) || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
  }
  return out;
}

// ─── Naming ──────────────────────────────────────────────────────────────────

function safeName(name: string | undefined, fallback: string): string {
  const base = (name ?? "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return base || fallback;
}

// ─── Copy one file ───────────────────────────────────────────────────────────

/**
 * Download a Freshdesk link and upload it under `path`. Returns the stored attachment shape
 * (path, real content type, size) or a `store_error` — never throws.
 */
export async function storeFreshdeskFile(url: string, path: string, hint: { name?: string; content_type?: string }): Promise<Pick<FdAttachment, "storage_path" | "content_type" | "size" | "store_error">> {
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow" });
    if (!res.ok) return { store_error: `download ${res.status}` };
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return { store_error: "empty" };
    if (bytes.byteLength > FD_ATTACHMENT_MAX_BYTES) return { store_error: `too large (${Math.round(bytes.byteLength / 1048576)} MB)` };
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || hint.content_type || "application/octet-stream";
    const { error } = await createAdminClient().storage.from(FRESHDESK_ATTACHMENT_BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) return { store_error: `upload: ${error.message}` };
    return { storage_path: path, content_type: contentType, size: bytes.byteLength };
  } catch (e) {
    return { store_error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Copy what a note (or a ticket) carries: its file attachments plus the images pasted into
 * its body. `prior` keeps already-copied paths across a re-pull (the API sends fresh objects
 * every time). Copies at most `cap` files this round and reports how many remain.
 */
export async function copyMedia(
  prefix: string,
  attachments: FdAttachment[],
  bodyHtml: string | null | undefined,
  prior: FdAttachment[],
  cap: number,
): Promise<{ attachments: FdAttachment[]; copied: number; remaining: number }> {
  const priorById = new Map<string, FdAttachment>();
  for (const p of prior) priorById.set(p.inline ? `inline:${p.attachment_url ?? p.name}` : `file:${p.id ?? p.name}`, p);

  const wanted: FdAttachment[] = attachments.map((a) => ({ ...a, inline: false }));
  extractInlineImages(bodyHtml).forEach((src, i) => wanted.push({ name: `inline-${i + 1}`, attachment_url: src, inline: true }));

  const out: FdAttachment[] = [];
  let copied = 0;
  let remaining = 0;
  for (const a of wanted) {
    const key = a.inline ? `inline:${a.attachment_url ?? a.name}` : `file:${a.id ?? a.name}`;
    const kept = priorById.get(key);
    if (kept?.storage_path) {
      out.push({ ...a, storage_path: kept.storage_path, content_type: kept.content_type ?? a.content_type, size: kept.size ?? a.size, stored_at: kept.stored_at });
      continue;
    }
    if (!a.attachment_url) {
      out.push({ ...a, store_error: a.store_error ?? "no link (export era)" });
      continue;
    }
    if (copied >= cap) {
      remaining += 1;
      out.push(a);
      continue;
    }
    const ext = fdAttachmentExt(a.name, a.content_type);
    const file = a.inline ? `${a.name}.${ext === "bin" ? "png" : ext}` : `${a.id ?? copied}-${safeName(a.name, `file.${ext}`)}`;
    const stored = await storeFreshdeskFile(a.attachment_url, `${prefix}/${file}`, { name: a.name, content_type: a.content_type });
    copied += 1;
    // The expiring link is dropped once copied (or once it failed): it is useless in hours anyway.
    const { attachment_url: _drop, ...rest } = a;
    void _drop;
    out.push(stored.storage_path ? { ...rest, ...stored, stored_at: new Date().toISOString() } : { ...rest, store_error: stored.store_error });
    if (stored.store_error) {
      console.warn(`${LOG} ${prefix}/${file}: ${stored.store_error}`);
      // A network hiccup or a 5xx is worth another go on the next pull; a file that is too
      // large, empty or gone (403/404) is not — its name stays with the reason.
      if (/fetch failed|upload|download 5\d\d|download 429|timeout|ECONN|<none>/i.test(stored.store_error ?? "")) remaining += 1;
    }
  }
  return { attachments: out, copied, remaining };
}

// ─── Read path ───────────────────────────────────────────────────────────────

/** Sign every stored path in one call; attachments without a copy come back untouched. */
export async function signFreshdeskAttachments<T extends { attachments: FdAttachment[] }>(rows: T[]): Promise<T[]> {
  const paths = [...new Set(rows.flatMap((r) => r.attachments.map((a) => a.storage_path).filter((p): p is string => Boolean(p))))];
  if (paths.length === 0) return rows;
  const signed = new Map<string, string>();
  try {
    const { data, error } = await createAdminClient().storage.from(FRESHDESK_ATTACHMENT_BUCKET).createSignedUrls(paths, FD_ATTACHMENT_SIGNED_TTL_SECONDS);
    if (error) console.error(`${LOG} createSignedUrls failed`, error.message);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  } catch (e) {
    console.error(`${LOG} createSignedUrls threw`, e instanceof Error ? e.message : e);
  }
  return rows.map((r) => ({ ...r, attachments: r.attachments.map((a) => (a.storage_path ? { ...a, signed_url: signed.get(a.storage_path) ?? null } : a)) }));
}
