"use server";

// ALL Jokers-module server actions (Recommendations & Engagement, Activity). Every one: Zod
// (parseActionInput) → requireJokersAccess() → the service → { data, error } (Rule 10). The
// action IS the trust boundary: the services read on the admin client.

import { requireProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { hasJokersAccess } from "@/lib/utils/route-access";
import { formErrors } from "@/lib/validations/form-errors";
import { revalidatePath } from "next/cache";
import { activityMessagesSchema, correctReplySchema } from "@/lib/validations/jokers-schema";
import { getClientActivityMessages } from "@/lib/services/client-activity-service";
import { correctReplyCore } from "@/lib/services/joker-replies";
import { JOKERS_RE_PATH } from "@/lib/constants/joker-engagement";
import type { ActivityMessage } from "@/lib/utils/client-activity";

/** A page of the list, so the list can say how many there are. */
const MESSAGES_PAGE = 50;

async function requireJokersAccess() {
  const auth = await requireProfile();
  if (!auth.ok) return auth;
  if (!hasJokersAccess(auth.profile)) return { ok: false as const, result: { data: null, error: formErrors.unauthorized } };
  return auth;
}

/** The client's side's own messages behind an Activity chart mark, newest first. */
export async function getActivityMessagesAction(
  input: unknown,
): Promise<{ data: { rows: ActivityMessage[]; total: number; pageSize: number } | null; error: string | null }> {
  const parsed = parseActionInput(activityMessagesSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireJokersAccess();
  if (!auth.ok) return auth.result;

  const res = await getClientActivityMessages({ ...parsed.data, limit: MESSAGES_PAGE });
  if (!res) return { data: null, error: formErrors.generic };
  return { data: { ...res, pageSize: MESSAGES_PAGE }, error: null };
}

/**
 * The List's Fix (owner, 2026-09-28): anyone who can open the Jokers pages can correct how a reply
 * was read. The fix is saved with their name; the same words then follow it (correctReplyCore).
 * "Replied" = a reply with no stance; "Not a reply" = the message stops counting for this item.
 */
export async function correctJokerReplyAction(
  input: unknown,
): Promise<{ data: { replies_changed: number; openings_updated: number } | null; error: string | null }> {
  const parsed = parseActionInput(correctReplySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireJokersAccess();
  if (!auth.ok) return auth.result;

  const { replyId, choice } = parsed.data;
  const res = await correctReplyCore({
    replyId,
    stance: choice === "replied" || choice === "not_a_reply" ? "none" : choice,
    notAReply: choice === "not_a_reply",
    correctedBy: auth.profile.id,
  });
  if (res.error) return { data: null, error: res.error };
  revalidatePath(JOKERS_RE_PATH);
  return res;
}
