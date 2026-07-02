// Suggestion box / bug-report channel — DB + storage access. SERVER ONLY.
//
// THE `suggestions` access layer (admin client — Q-13 / revival-service posture:
// the calling page/action is the trust boundary; the inbox page is admin/founder-
// gated, the submit action runs requireProfile + a path-ownership re-check).
//
// The `suggestions` bucket is PRIVATE — image_paths stores storage PATHS, never
// URLs. getSignedImageUrls mints short-lived signed URLs for admin viewing only.
//
// NOT append-only: resolveSuggestion flips status. Column restriction (only
// status/resolved_by/resolved_at move) is enforced HERE in code, not in SQL — the
// revival markCandidateResolved precedent.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import {
  SUGGESTIONS_BUCKET,
  type SuggestionStatus,
} from "@/lib/constants/suggestions";
import type {
  SuggestionCategory,
  SuggestionRow,
  SuggestionWithSender,
} from "@/lib/types/suggestions";

/** Signed-URL lifetime for inbox image previews (seconds). */
const SIGNED_URL_TTL = 300;

export type CreateSuggestionPayload = {
  senderId: string;
  category: SuggestionCategory;
  /** Already sanitized by the action (Rule 06). */
  message: string;
  /** Already ownership-verified by the action (each path begins `${senderId}/`). */
  imagePaths: string[];
};

/** Insert one suggestion. Admin client — the action is the trust boundary. */
export async function createSuggestion(
  payload: CreateSuggestionPayload,
): Promise<{ id: string | null; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("suggestions")
    .insert({
      sender_id: payload.senderId,
      category: payload.category,
      message: payload.message,
      image_paths: payload.imagePaths,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[suggestions-service] createSuggestion failed:", error?.message);
    return { id: null, error: "Failed to create suggestion." };
  }
  return { id: data.id as string, error: null };
}

// The joined row shape (suggestions row + the embedded profiles sender join).
type SuggestionInboxRow = SuggestionRow & {
  sender: { full_name: string } | null;
};

/**
 * Inbox list for triage. Optionally filter by status; open-first within the
 * (status, created_at DESC) index. Resolves a signed URL per image path so the
 * admin sees the screenshots (the bucket is private). Admin client — the page is
 * admin/founder-gated.
 */
export async function getSuggestionsForInbox(
  status?: SuggestionStatus,
): Promise<SuggestionWithSender[]> {
  const admin = createAdminClient();
  let query = admin
    .from("suggestions")
    .select("*, sender:profiles!suggestions_sender_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error || !data) {
    if (error) console.error("[suggestions-service] getSuggestionsForInbox failed:", error.message);
    return [];
  }

  const rows = mapRows<SuggestionInboxRow, SuggestionRow & { sender: { full_name: string } | null }>(
    data,
    (r) => r,
  );

  // Sign every image path across all rows. createSignedUrls is per-bucket-call;
  // batch each row's paths (small N — ≤ 4 per row).
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      image_urls: await signPaths(row.image_paths),
    })),
  );
}

/** Sign a row's image paths (private bucket). Empty/failed entries are dropped. */
async function signPaths(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(SUGGESTIONS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);

  if (error || !data) {
    console.error("[suggestions-service] signPaths failed:", error?.message);
    return [];
  }
  return data
    .map((d) => d.signedUrl)
    .filter((u): u is string => Boolean(u));
}

/**
 * Resolve a suggestion (admin/founder). Writes ONLY status/resolved_by/resolved_at
 * (the column restriction — RLS can't). Returns the sender_id so the action can
 * notify them. Idempotent-ish: re-resolving an already-resolved row re-stamps.
 */
export async function resolveSuggestion(
  id: string,
  resolvedBy: string,
): Promise<{ senderId: string | null; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("suggestions")
    .update({
      status: "resolved" satisfies SuggestionStatus,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("sender_id")
    .single();

  if (error || !data) {
    console.error("[suggestions-service] resolveSuggestion failed:", error?.message);
    return { senderId: null, error: "Failed to resolve suggestion." };
  }
  return { senderId: data.sender_id as string, error: null };
}
