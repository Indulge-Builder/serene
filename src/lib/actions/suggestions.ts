"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireProfile } from "@/lib/actions/_auth";
import { sanitizeText } from "@/lib/utils/sanitize";
import {
  CreateSuggestionSchema,
  ResolveSuggestionSchema,
} from "@/lib/validations/suggestion-schema";
import { formErrors } from "@/lib/validations/form-errors";
import {
  createSuggestion,
  resolveSuggestion,
  type CreateSuggestionPayload,
} from "@/lib/services/suggestions-service";
import { createNotification } from "@/lib/services/notifications-service";
import type { ActionResult } from "@/lib/types";

/**
 * Submit a suggestion / bug report. Any authenticated staff member. Images are
 * already uploaded client-side to the private `suggestions` bucket (the avatar
 * pattern — the File never reaches the server); we receive only the storage paths
 * and re-verify each one belongs to the caller (defence in depth over the storage
 * RLS prefix check). Message is sanitized before write (Rule 06).
 */
export async function submitSuggestionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSuggestionSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  // Path-ownership: every image path must live under the caller's own uid prefix.
  // The storage RLS already pins WRITES to `${uid}/...`, but a client could still
  // submit a path string pointing at another user's object — reject it here.
  const prefix = `${caller.id}/`;
  if (!parsed.data.imagePaths.every((p) => p.startsWith(prefix))) {
    return { data: null, error: formErrors.unauthorized };
  }

  const payload: CreateSuggestionPayload = {
    senderId: caller.id,
    category: parsed.data.category,
    message: sanitizeText(parsed.data.message),
    imagePaths: parsed.data.imagePaths,
  };

  const { id, error } = await createSuggestion(payload);
  if (error || !id) return { data: null, error: formErrors.suggestionSubmitFailed };

  revalidatePath("/admin/suggestions");
  return { data: { id }, error: null };
}

/**
 * Resolve a suggestion (admin/founder only). Flips status → resolved and notifies
 * the original sender (in-app). The resolve-notify is transactional — no
 * notificationKey, so it is never silenceable (the lead_initiation / elaya_reply
 * posture). Notification is non-fatal and runs via after() — createNotification
 * carries a Web Push send (dispatchPush), so a bare void would orphan it when the
 * lambda freezes on return (A-16).
 */
export async function resolveSuggestionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = ResolveSuggestionSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const { senderId, error } = await resolveSuggestion(parsed.data.id, caller.id);
  if (error || !senderId) return { data: null, error: formErrors.generic };

  // Close the loop for the sender. Non-fatal: a notification failure must not
  // fail the resolve. Skip self-notify when the resolver is the sender.
  if (senderId !== caller.id) {
    after(
      createNotification({
        recipient_id: senderId,
        type: "suggestion_resolved",
        title: "Your feedback was resolved",
        body: "Thanks for the report — we've marked it resolved.",
        action_url: "/dashboard",
      }).catch((err) =>
        console.error("[suggestions-action] resolve notify failed (non-fatal):", err),
      ),
    );
  }

  revalidatePath("/admin/suggestions");
  return { data: { id: parsed.data.id }, error: null };
}
