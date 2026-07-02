"use server";

/**
 * notifications.ts — server actions for the notification inbox.
 * All actions begin with Zod validation (Rule 02).
 * Authorization reads only from profiles (Rule 09).
 * Returns { data, error } — never throws (Rule 10).
 */

import { z } from "zod";
import { requireProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/services/notifications-service";
import { uuidField } from "@/lib/validations/fields";
import { formErrors } from "@/lib/validations/form-errors";
import type { ActionResult } from "@/lib/types/index";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const markReadSchema = z.object({
  id: uuidField("Invalid notification ID."),
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Mark a single notification as read.
 * Validates ownership: the caller must be the recipient.
 */
export async function markNotificationReadAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  // Zod validation — Rule 02
  const parsed = parseActionInput(markReadSchema, { id });
  if (!parsed.ok) return { data: null, error: parsed.error };

  // Session auth — Rule 09
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const { error } = await markNotificationRead(parsed.data.id, profile.id);
  if (error) return { data: null, error };

  return { data: { id: parsed.data.id }, error: null };
}

/**
 * Mark all unread notifications as read for the current session user.
 * Session-scoped — no input parameter needed.
 */
export async function markAllReadAction(): Promise<ActionResult<{ success: true }>> {
  // Zod validation — Rule 02 (no schema needed — session-scoped, no untrusted input)
  const parsed = z.object({}).safeParse({});
  if (!parsed.success) {
    return { data: null, error: formErrors.generic };
  }

  // Session auth — Rule 09
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const { error } = await markAllNotificationsRead(profile.id);
  if (error) return { data: null, error };

  return { data: { success: true }, error: null };
}
